// SPDX-License-Identifier: MIT

pragma solidity 0.8.20;

import "../lib/Helper.sol";
import "../interface/IMOSV3.sol";
import "../interface/IMORC20.sol";
import "../interface/IMintableToken.sol";
import "../interface/IMapoExecutor.sol";
import "../interface/ISwapOutLimit.sol";
import "../interface/IMORC20Receiver.sol";
import "../interface/IButterReceiver.sol";
import "@openzeppelin/contracts-upgradeable/utils/AddressUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlEnumerableUpgradeable.sol";

abstract contract BridgeAbstract is
    UUPSUpgradeable,
    PausableUpgradeable,
    ReentrancyGuardUpgradeable,
    AccessControlEnumerableUpgradeable,
    IMORC20Receiver,
    IMapoExecutor
{
    using AddressUpgradeable for address;
    using SafeERC20Upgradeable for IERC20Upgradeable;
    uint256 public immutable selfChainId = block.chainid;
    bytes32 public constant MANAGE_ROLE = keccak256("MANAGE_ROLE");
    bytes32 public constant UPGRADE_ROLE = keccak256("UPGRADE_ROLE");

    uint256 constant MINTABLE_TOKEN = 0x01;
    uint256 constant MORC20_TOKEN = 0x02;

    enum OutType {
        SWAP,
        DEPOSIT
    }
    struct SwapInParam {
        bytes from;
        uint256 fromChain;
        bytes32 orderId;
        address token;
        address to;
        bytes swapData;
        uint256 amount;
    }

    struct BridgeParam {
        uint256 gasLimit;
        bytes refundAddress;
        bytes swapData;
    }

    struct SwapOutParam {
        address from;
        bytes to;
        address token;
        uint256 amount;
        uint256 toChain;
        bytes swapData;
        bytes refundAddress;
        uint256 gasLimit;
    }

    IMOSV3 public mos;
    address public wToken;
    ISwapOutLimit public swapLimit;
    address public nativeFeeReceiver;

    uint256 private nonce;
    mapping(bytes32 => bool) public orderList;
    // mapping(address => bool) public morc20Proxy;

    mapping(address => uint256) public tokenFeatureList;
    mapping(uint256 => mapping(address => bool)) public tokenMappingList;

    mapping(uint256 => mapping(OutType => uint256)) public baseGasLookup;
    // token => chainId => native fee
    mapping(address => mapping(uint256 => uint256)) public nativeFees;

    event SetMapoService(IMOSV3 _mos);
    event SetWrappedToken(address wToken);

    event SetSwapLimit(ISwapOutLimit _swapLimit);
    event SetNativeFeeReceiver(address _receiver);
    // event UpdateMorc20Proxy(address _proxy, bool _flag);
    event RegisterToken(address _token, uint256 _toChain, bool _enable);
    event UpdateToken(address token, uint256 feature);
    event SetNativeFee(address _token, uint256 _toChain, uint256 _amount);
    event SetBaseGas(uint256 _toChain, OutType _outType, uint256 _gasLimit);
    event CollectNativeFee(address _token, uint256 _toChain, uint256 amount);

    event SwapIn(address token, uint256 amount, address to, uint256 fromChain, bytes from);
    event ChargeNativeFee(address _token, uint256 _amount, uint256 fee, uint256 selfChainId, uint256 _tochain);

    event BridgeRelay(
        uint256 indexed fromChain, // from chain
        uint256 indexed toChain, // to chain
        bytes32 orderId, // order id
        bytes token, // token to transfer
        bytes from, // source chain from address
        bytes to,
        uint256 amount,
        bytes swapData // swap data, used on target chain dex.
    );

    event SwapOut(
        bytes32 orderId,
        uint256 tochain,
        address inToken,
        bytes outToken,
        uint256 amount,
        address from,
        bytes to,
        uint256 gasLimit,
        uint256 messageFee
    );

    receive() external payable {}

    modifier checkOrder(bytes32 _orderId) {
        require(!orderList[_orderId], "order exist");
        orderList[_orderId] = true;
        _;
    }

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(
        address _wToken,
        address _defaultAdmin
    ) public initializer checkAddress(_wToken) checkAddress(_defaultAdmin) {
        wToken = _wToken;
        __Pausable_init();
        __ReentrancyGuard_init();
        __AccessControlEnumerable_init();
        _grantRole(DEFAULT_ADMIN_ROLE, _defaultAdmin);
        _grantRole(MANAGE_ROLE, _defaultAdmin);
    }

    modifier checkAddress(address _address) {
        require(_address != address(0), "address is zero");
        _;
    }

    function setWrappedToken(address _wToken) external onlyRole(MANAGE_ROLE) {
        wToken = _wToken;
        emit SetWrappedToken(_wToken);
    }

    function setSwapLimit(ISwapOutLimit _swapLimit) external onlyRole(MANAGE_ROLE) {
        require(address(_swapLimit).isContract(), "not contract");
        swapLimit = _swapLimit;
        emit SetSwapLimit(_swapLimit);
    }

    function setMapoService(IMOSV3 _mos) external onlyRole(MANAGE_ROLE) {
        require(address(_mos).isContract(), "not contract");
        mos = _mos;
        emit SetMapoService(_mos);
    }

    function registerTokenChains(
        address _token,
        uint256[] memory _toChains,
        bool _enable
    ) external onlyRole(MANAGE_ROLE) {
        require(_token.isContract(), "token is not contract");
        for (uint256 i = 0; i < _toChains.length; i++) {
            uint256 toChain = _toChains[i];
            tokenMappingList[toChain][_token] = _enable;
            emit RegisterToken(_token, toChain, _enable);
        }
    }


    function updateTokens(address[] memory _tokens, uint256 _feature) external onlyRole(MANAGE_ROLE) {
        for (uint256 i = 0; i < _tokens.length; i++) {
            tokenFeatureList[_tokens[i]] = _feature;

            emit UpdateToken(_tokens[i], _feature);
        }
    }

    function setNativeFee(address _token, uint256 _toChain, uint256 _amount) external onlyRole(MANAGE_ROLE) {
        nativeFees[_token][_toChain] = _amount;
        emit SetNativeFee(_token, _toChain, _amount);
    }

    function setBaseGas(uint256 _toChain, OutType _outType, uint256 _gasLimit) external onlyRole(MANAGE_ROLE) {
        require(_toChain != selfChainId, "self chain");
        baseGasLookup[_toChain][_outType] = _gasLimit;
        emit SetBaseGas(_toChain, _outType, _gasLimit);
    }

    function setNativeFeeReceiver(address _receiver) external onlyRole(MANAGE_ROLE) checkAddress(_receiver) {
        nativeFeeReceiver = _receiver;
        emit SetNativeFeeReceiver(_receiver);
    }

    function trigger() external onlyRole(MANAGE_ROLE) {
        paused() ? _unpause() : _pause();
    }

    function isMintable(address _token) public view virtual returns (bool) {
        return (tokenFeatureList[_token] & MINTABLE_TOKEN) == MINTABLE_TOKEN;
    }

    function isOmniToken(address _token) public view virtual returns (bool) {
        return (tokenFeatureList[_token] & MORC20_TOKEN) == MORC20_TOKEN;
    }

    function swapOut(SwapOutParam calldata param) external payable virtual nonReentrant whenNotPaused {}

    function _interTransferAndCall(SwapOutParam memory param, bytes memory target) internal returns (bytes32 orderId) {
        (address feeToken, uint256 value) = IMORC20(param.token).estimateFee(param.toChain, param.gasLimit);
        require(feeToken == address(0), "unsupported fee token");

        address token = IMORC20(param.token).token();
        if (token != param.token) {
            IERC20Upgradeable(param.token).safeIncreaseAllowance(param.token, param.amount);
        }

        orderId = _getOrderId(param.from, param.to, param.toChain);

        // bridge
        bytes memory messageData = abi.encode(param.to, param.swapData);
        IMORC20(param.token).interTransferAndCall{value: value}(
            address(this),
            param.toChain,
            target,
            param.amount,
            param.gasLimit,
            param.refundAddress,
            messageData
        );

    }

    function mapoExecute(
        uint256 _fromChain,
        uint256 _toChain,
        bytes calldata _fromAddress,
        bytes32 _orderId,
        bytes calldata _message
    ) external virtual override returns (bytes memory newMessage) {}

    function onMORC20Received(
        uint256 _fromChain,
        bytes memory from,
        uint256 _amount,
        bytes32 _orderId,
        bytes calldata _message
    ) external override returns (bool) {
        address morc20 = msg.sender;
        require(isOmniToken(morc20), "unregistered morc20 token");
        address token = IMORC20(morc20).token();
        require(Helper._getBalance(token, address(this)) >= _amount, "received too low");
        SwapInParam memory param;
        param.from = from;
        param.fromChain = _fromChain;
        param.orderId = _orderId;
        param.amount = _amount;
        (param.to, param.swapData) = abi.decode(_message, (address, bytes));
        _swapIn(param);
        return true;
    }

    function getNativeFeePrice(address _token, uint256 _amount, uint256 _toChain) external view returns (uint256) {
        return nativeFees[_token][_toChain];
    }

    function _tokenIn(
        uint256 _toChain,
        uint256 _amount,
        address _token,
        uint256 _gasLimit,
        bool _isSwap
    ) internal returns (address token, uint256 nativeFee, uint256 messageFee) {
        require(_amount > 0, "value is zero");
        token = _token;
        if (_toChain != selfChainId) messageFee = getMessageFee(_gasLimit, _toChain);
        if (_isSwap) nativeFee = _chargeNativeFee(_token, _amount, _toChain);
        if (Helper._isNative(token)) {
            require((_amount + messageFee + nativeFee) == msg.value, "value and fee mismatching");
            Helper._safeDeposit(wToken, _amount);
            token = wToken;
        } else {
            IERC20Upgradeable(token).safeTransferFrom(msg.sender, address(this), _amount);
            require((messageFee + nativeFee) == msg.value, "fee mismatching");
            if (_toChain != selfChainId) _checkAndBurn(token, _amount);
        }
    }


    function _swapIn(SwapInParam memory param) internal {
        // if swap params is not empty, then we need to do swap on current chain
        if (param.swapData.length > 0 && param.to.isContract()) {
            Helper._transfer(selfChainId, param.token, param.to, param.amount);
            try
                IButterReceiver(param.to).onReceived(
                    param.orderId,
                    param.token,
                    param.amount,
                    param.fromChain,
                    param.from,
                    param.swapData
                )
            {
                // do nothing
            } catch {
                // do nothing
            }
        } else {
            // transfer token if swap did not happen
            _withdraw(param.token, param.to, param.amount);
        }
        emit SwapIn(param.token, param.amount, param.to, param.fromChain, param.from);
    }

    function _withdraw(address _token, address _receiver, uint256 _amount) internal {
        if (_token == wToken) {
            Helper._safeWithdraw(wToken, _amount);
            AddressUpgradeable.sendValue(payable(_receiver), _amount);
        } else {
            Helper._transfer(selfChainId, _token, _receiver, _amount);
        }
    }

    function _getOrderId(address _from, bytes memory _to, uint256 _toChain) internal returns (bytes32) {
        return keccak256(abi.encodePacked(address(this), nonce++, selfChainId, _toChain, _from, _to));
    }

    function _checkBridgeable(address _token, uint256 _chainId) internal view {
        require(tokenMappingList[_chainId][_token], "token not registered");
    }

    function _checkAndBurn(address _token, uint256 _amount) internal {
        if (isMintable(_token)) {
            IMintableToken(_token).burn(_amount);
        }
    }

    function _checkAndMint(address _token, uint256 _amount) internal {
        if (isMintable(_token)) {
            IMintableToken(_token).mint(address(this), _amount);
        }
    }

    function _checkBytes(bytes memory b1, bytes memory b2) internal pure returns (bool) {
        return keccak256(b1) == keccak256(b2);
    }

    function _checkLimit(uint256 amount, uint256 tochain, address token) internal {
        if (address(swapLimit) != address(0)) swapLimit.checkLimit(amount, tochain, token);
    }

    function getMessageFee(uint256 _gasLimit, uint256 _toChain) public virtual returns (uint256 fee) {
        (fee, ) = mos.getMessageFee(_toChain, Helper.ZERO_ADDRESS, _gasLimit);
    }

    function _chargeNativeFee(address _token, uint256 _amount, uint256 _toChain) internal virtual returns (uint256) {
        uint256 fee = nativeFees[_token][_toChain];
        if (fee != 0 && nativeFeeReceiver != address(0)) {
            Helper._transfer(selfChainId, address(0), nativeFeeReceiver, fee);
            emit ChargeNativeFee(_token, _amount, fee, selfChainId, _toChain);
            return fee;
        }
        return 0;
    }

    function _fromBytes(bytes memory bys) internal pure returns (address addr) {
        assembly {
            addr := mload(add(bys, 20))
        }
    }

    /** UUPS *********************************************************/
    function _authorizeUpgrade(address) internal view override {
        require(hasRole(UPGRADE_ROLE, msg.sender), "Bridge: only Admin can upgrade");
    }

    function getImplementation() external view returns (address) {
        return _getImplementation();
    }
}
