// SPDX-License-Identifier: MIT

pragma solidity 0.8.20;

import "../lib/Helper.sol";
import "../interface/IButterBridgeV3.sol";
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
    IButterBridgeV3,
    IMORC20Receiver,
    IMapoExecutor
{
    using AddressUpgradeable for address;
    using SafeERC20Upgradeable for IERC20Upgradeable;
    uint256 public immutable selfChainId = block.chainid;
    bytes32 public constant MANAGER_ROLE = keccak256("MANAGER_ROLE");
    bytes32 public constant UPGRADER_ROLE = keccak256("UPGRADER_ROLE");

    uint256 constant DEFAULT_CHAIN = 0x00;

    uint256 constant MINTABLE_TOKEN = 0x01;
    uint256 constant MORC20_TOKEN = 0x02;

    enum OutType {
        SWAP,
        DEPOSIT,
        INTER_TRANSFER
    }

    struct SwapParam {
        bytes32 orderId;
        address token;
        address from;
        uint256 fromChain;
        uint256 toChain;
        uint256 amount;
        uint256 relayAmount;
        uint256 relayOutAmount;
        uint256 toAmount;
        uint256 baseFee;
        uint256 gasLimit;
        bytes fromBytes;
        bytes toBytes;
    }

    IMOSV3 public mos;
    address public wToken;
    ISwapOutLimit public swapLimit;
    address public nativeFeeReceiver;

    uint256 private nonce;
    mapping(bytes32 => bool) public orderList;

    // | morc address (160bit)  | reserved (94 bit) | morc20 (1 bit) | mintable (1 bit) |
    mapping(address => uint256) public tokenFeatureList;
    mapping(uint256 => mapping(address => bool)) public tokenMappingList;

    // chainId => (type => gasLimit)
    mapping(uint256 => mapping(OutType => uint256)) public baseGasLookup;
    mapping(address => mapping(uint256 => uint256)) public nativeFees;

    event SetOmniService(IMOSV3 mos);
    event SetWrappedToken(address wToken);

    event SetSwapLimit(ISwapOutLimit _swapLimit);
    event SetNativeFeeReceiver(address _receiver);
    event RegisterToken(address _token, uint256 _toChain, bool _enable);
    event UpdateToken(address token, address _omniProxy, uint96 feature);
    event SetNativeFee(address _token, uint256 _toChain, uint256 _amount);
    event SetBaseGas(uint256 _toChain, OutType _outType, uint256 _gasLimit);
    event CollectNativeFee(address _token, uint256 _toChain, uint256 amount);

    event ChargeNativeFee(address _token, uint256 _amount, uint256 fee, uint256 selfChainId, uint256 _tochain);

    event BridgeRelay(
        uint256 indexed fromChain, // from chain
        uint256 indexed toChain, // to chain
        bytes32 orderId, // order id
        bytes token, // token to transfer
        bytes from, // source chain from address
        bytes to,
        uint256 amount
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
        _grantRole(MANAGER_ROLE, _defaultAdmin);
        _grantRole(UPGRADER_ROLE, _defaultAdmin);
    }

    modifier checkAddress(address _address) {
        require(_address != address(0), "address is zero");
        _;
    }

    function setWrappedToken(address _wToken) external onlyRole(MANAGER_ROLE) {
        wToken = _wToken;
        emit SetWrappedToken(_wToken);
    }

    function setSwapLimit(ISwapOutLimit _swapLimit) external onlyRole(MANAGER_ROLE) {
        require(address(_swapLimit).isContract(), "not contract");
        swapLimit = _swapLimit;
        emit SetSwapLimit(_swapLimit);
    }

    function setOmniService(IMOSV3 _mos) external onlyRole(MANAGER_ROLE) {
        require(address(_mos).isContract(), "not contract");
        mos = _mos;
        emit SetOmniService(_mos);
    }

    function registerTokenChains(
        address _token,
        uint256[] memory _toChains,
        bool _enable
    ) external onlyRole(MANAGER_ROLE) {
        require(_token.isContract(), "token is not contract");
        for (uint256 i = 0; i < _toChains.length; i++) {
            uint256 toChain = _toChains[i];
            tokenMappingList[toChain][_token] = _enable;
            emit RegisterToken(_token, toChain, _enable);
        }
    }

    function updateTokens(
        address[] calldata _tokens,
        address[] calldata omniProxys,
        uint96 _feature
    ) external onlyRole(MANAGER_ROLE) {
        require(_tokens.length == omniProxys.length, "mismatching");
        for (uint256 i = 0; i < _tokens.length; i++) {
            tokenFeatureList[_tokens[i]] = (uint256(uint160(omniProxys[i])) << 96) | _feature;
            emit UpdateToken(_tokens[i], omniProxys[i], _feature);
        }
    }

    function setNativeFee(address _token, uint256 _toChain, uint256 _amount) external onlyRole(MANAGER_ROLE) {
        nativeFees[_token][_toChain] = _amount;
        emit SetNativeFee(_token, _toChain, _amount);
    }

    function setBaseGas(uint256 _toChain, OutType _outType, uint256 _gasLimit) external onlyRole(MANAGER_ROLE) {
        require(_toChain != selfChainId, "self chain");
        baseGasLookup[_toChain][_outType] = _gasLimit;
        emit SetBaseGas(_toChain, _outType, _gasLimit);
    }

    function setNativeFeeReceiver(address _receiver) external onlyRole(MANAGER_ROLE) checkAddress(_receiver) {
        nativeFeeReceiver = _receiver;
        emit SetNativeFeeReceiver(_receiver);
    }

    function trigger() external onlyRole(MANAGER_ROLE) {
        paused() ? _unpause() : _pause();
    }

    function isMintable(address _token) public view virtual returns (bool) {
        return (tokenFeatureList[_token] & MINTABLE_TOKEN) == MINTABLE_TOKEN;
    }

    function getOmniProxy(address _token) public view virtual returns (address) {
        require(isOmniToken(_token), "not omniToken");
        address proxy = address(uint160(tokenFeatureList[_token] >> 96));
        if (proxy == Helper.ZERO_ADDRESS) {
            return _token;
        } else {
            return proxy;
        }
    }

    function isOmniToken(address _token) public view virtual returns (bool) {
        return (tokenFeatureList[_token] & MORC20_TOKEN) == MORC20_TOKEN;
    }

    function swapOutToken(
        address _sender, // initiator address
        address _token, // src token
        bytes memory _to,
        uint256 _amount,
        uint256 _toChain, // target chain id
        bytes calldata _swapData
    ) external payable virtual nonReentrant whenNotPaused returns (bytes32 orderId) {}

    function depositToken(address _token, address to, uint256 _amount) external payable virtual {}

    function _interTransferAndCall(
        SwapParam memory param,
        BridgeParam memory bridge,
        bytes memory target,
        uint256 messageFee
    ) internal returns (bytes32 orderId) {
        address proxy = getOmniProxy(param.token);
        if (proxy != param.token) {
            IERC20Upgradeable(param.token).safeIncreaseAllowance(proxy, param.amount);
        }
        orderId = _getOrderId(param.from, param.toBytes, param.toChain);
        if (_checkBytes(bridge.refundAddress, bytes(""))) {
            bridge.refundAddress = param.toBytes;
        }
        // bridge
        bytes memory messageData = abi.encode(orderId, param.toBytes, bridge.swapData);
        IMORC20(proxy).interTransferAndCall{value: messageFee}(
            address(this),
            param.toChain,
            target,
            param.amount,
            param.gasLimit,
            bridge.refundAddress,
            messageData
        );
    }

    function mapoExecute(
        uint256 _fromChain,
        uint256 _toChain,
        bytes calldata _fromAddress,
        bytes32 _orderId,
        bytes calldata _message
    ) external payable virtual override returns (bytes memory newMessage) {}

    function onMORC20Received(
        uint256 _fromChain,
        bytes memory from,
        uint256 _amount,
        bytes32 _orderId,
        bytes calldata _message
    ) external override checkOrder(_orderId) returns (bool) {
        address morc20 = msg.sender;
        SwapParam memory param;
        bytes memory swapData;
        param.token = IMORC20(morc20).token();
        require(getOmniProxy(param.token) == morc20, "unregistered morc20 token");
        require(Helper._getBalance(param.token, address(this)) >= _amount, "received too low");
        param.fromBytes = from;
        param.fromChain = _fromChain;
        param.amount = _amount;
        (param.orderId, param.toBytes, swapData) = abi.decode(_message, (bytes32, bytes, bytes));
        //param.to = _fromBytes(param.toBytes);
        // TODO: check orderId
        _swapIn(param, swapData);
        return true;
    }

    function getNativeFee(address _token, uint256 _gasLimit, uint256 _toChain) external view returns (uint256) {
        address token = Helper._isNative(_token) ? wToken : _token;
        uint256 gasLimit = _gasLimit;
        if (isOmniToken(token)) {
            gasLimit += _getBaseGas(_toChain, OutType.INTER_TRANSFER);
        } else {
            gasLimit += _getBaseGas(_toChain, OutType.SWAP);
        }
        uint256 fee = getMessageFee(token, gasLimit, _toChain);
        if (nativeFeeReceiver != Helper.ZERO_ADDRESS) {
            fee += _getTokenNativeFee(token, _toChain);
        }
        return fee;
    }

    function _swapOut(
        address _initiator, // initiator address
        address _token, // src token
        bytes memory _to,
        uint256 _amount,
        uint256 _toChain, // target chain id
        bytes calldata _swapData
    ) internal returns (SwapParam memory param, BridgeParam memory bridge, uint256 messageFee) {
        require(_toChain != selfChainId, "Cannot swap to self chain");
        param.from = _initiator;
        param.toBytes = _to;
        param.toChain = _toChain;
        param.amount = _amount;
        param.token = Helper._isNative(_token) ? wToken : _token;

        _checkBridgeable(param.token, param.toChain);
        _checkLimit(param.amount, param.toChain, param.token);

        if (isOmniToken(param.token)) {
            param.gasLimit = _getBaseGas(_toChain, OutType.INTER_TRANSFER);
        } else {
            param.gasLimit = _getBaseGas(_toChain, OutType.SWAP);
        }
        if (_swapData.length != 0) {
            bridge = abi.decode(_swapData, (BridgeParam));
            param.gasLimit += bridge.gasLimit;
        }
        uint256 messageFee;
        (, , messageFee) = _tokenIn(param.toChain, param.amount, _token, param.gasLimit, true);

        return (param, bridge, messageFee);
    }

    function _tokenIn(
        uint256 _toChain,
        uint256 _amount,
        address _token,
        uint256 _gasLimit,
        bool _isSwap
    ) internal returns (address token, uint256 nativeFee, uint256 messageFee) {
        require(_amount > 0, "value is zero");
        uint256 value;
        token = _token;
        if (Helper._isNative(token)) {
            value += _amount;
            Helper._safeDeposit(wToken, _amount);
            token = wToken;
        } else {
            IERC20Upgradeable(token).safeTransferFrom(msg.sender, address(this), _amount);
            //if (_toChain != selfChainId) _checkAndBurn(token, _amount);
        }

        if (_isSwap) nativeFee = _chargeNativeFee(token, _amount, _toChain);
        value += nativeFee;

        if (_toChain != selfChainId) {
            // not deposit
            messageFee = getMessageFee(token, _gasLimit, _toChain);
            value += messageFee;
        }
        require(value <= msg.value, "value or fee mismatching");
    }

    function _swapIn(SwapParam memory param, bytes memory swapData) internal {
        // if swap params is not empty, then we need to do swap on current chain
        address outToken = param.token;
        address to = _fromBytes(param.toBytes);
        if (swapData.length > 0 && to.isContract()) {
            Helper._transfer(selfChainId, param.token, to, param.amount);
            try
                IButterReceiver(to).onReceived(
                    param.orderId,
                    param.token,
                    param.amount,
                    param.fromChain,
                    param.fromBytes,
                    swapData
                )
            {
                // do nothing
            } catch {
                // do nothing
            }
        } else {
            // transfer token if swap did not happen
            _withdraw(param.token, to, param.amount);
            if (param.token == wToken) outToken = Helper.ZERO_ADDRESS;
        }
        emit SwapIn(param.orderId, param.fromChain, param.token, param.amount, to, outToken, param.fromBytes);
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
        if (address(swapLimit) != Helper.ZERO_ADDRESS) swapLimit.checkLimit(amount, tochain, token);
    }

    function _getBaseGas(uint256 _chain, OutType _type) internal view returns (uint256) {
        uint256 gasLimit = baseGasLookup[_chain][_type];
        if (gasLimit == 0) {
            gasLimit = baseGasLookup[DEFAULT_CHAIN][_type];
        }

        return gasLimit;
    }

    function _getTokenNativeFee(address _token, uint256 _toChain) internal view returns (uint256) {
        uint256 fee = nativeFees[_token][_toChain];
        if (fee == 0) {
            fee = nativeFees[_token][DEFAULT_CHAIN];
        }

        return fee;
    }

    function getMessageFee(
        address _token,
        uint256 _gasLimit,
        uint256 _toChain
    ) public view virtual returns (uint256 fee) {
        if (isOmniToken(_token)) {
            address feeToken;
            (feeToken, fee) = IMORC20(getOmniProxy(_token)).estimateFee(_toChain, _gasLimit);
            require(feeToken == Helper.ZERO_ADDRESS, "unsupported fee token");
        } else {
            (fee, ) = mos.getMessageFee(_toChain, Helper.ZERO_ADDRESS, _gasLimit);
        }
    }

    function _chargeNativeFee(address _token, uint256 _amount, uint256 _toChain) internal virtual returns (uint256) {
        if (nativeFeeReceiver == Helper.ZERO_ADDRESS) {
            return 0;
        }
        uint256 fee = _getTokenNativeFee(_token, _toChain);
        if (fee != 0) {
            Helper._transfer(selfChainId, Helper.ZERO_ADDRESS, nativeFeeReceiver, fee);
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
        require(hasRole(UPGRADER_ROLE, msg.sender), "Bridge: only Admin can upgrade");
    }

    function getImplementation() external view returns (address) {
        return _getImplementation();
    }
}
