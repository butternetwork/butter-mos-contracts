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
    struct InterTransferParam {
        uint256 toChainId;
        bytes toAddress;
        uint256 gasLimit;
        bytes refundAddress;
        bytes messageData;
        address feeToken;
        uint256 fee;
        address feePayer;
    }
    struct SwapOutParam {
        address from;
        bytes to;
        address token;
        uint256 amount;
        uint256 toChain;
        bytes swapData;
        uint256 gasLimit;
        uint256 relayGasLimit;
    }

    IMOSV3 public mos;
    address public wToken;
    ISwapOutLimit public swapLimit;
    address public nativeFeeReceiver;
    mapping(uint256 => bytes) public bridges;
    mapping(bytes32 => bool) public orderList;
    // token => chainId => native fee
    mapping(address => mapping(uint256 => uint256)) public nativeFees;

    event SetMapoService(IMOSV3 _mos);
    event SetWrappedToken(address wToken);
    event SetSwapLimit(ISwapOutLimit _swapLimit);
    event SetNativeFeeReceiver(address _receiver);
    event RegisterChain(uint256 _chainId, bytes _address);
    event SetNativeFee(address _token, uint256 _toChain, uint256 _amount);
    event CollectNativeFee(address _token, uint256 _toChain, uint256 amount);
    event InterTransferAndCall(address proxy, address token, uint256 amount);
    event SwapIn(address token, uint256 amount, address to, uint256 fromChain, bytes from);
    event ChargeNativeFee(address _token, uint256 _amount, uint256 fee, uint256 selfChainId, uint256 _tochain);
    event SwapOut(
        bytes32 orderId,
        uint256 tochain,
        address token,
        uint256 amount,
        address from,
        bytes to,
        uint256 gasLimit,
        uint256 relayGasLimit,
        uint256 messageFee,
        bytes swapData
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
        require(address(_swapLimit).isContract(), "mos is not contract");
        swapLimit = _swapLimit;
        emit SetSwapLimit(_swapLimit);
    }

    function setMapoService(IMOSV3 _mos) external onlyRole(MANAGE_ROLE) {
        require(address(_mos).isContract(), "mos is not contract");
        mos = _mos;
        emit SetMapoService(_mos);
    }

    function registerChain(uint256 _chainId, bytes memory _address) external onlyRole(MANAGE_ROLE) {
        bridges[_chainId] = _address;
        emit RegisterChain(_chainId, _address);
    }

    function setNativeFee(address _token, uint256 _toChain, uint256 _amount) external onlyRole(MANAGE_ROLE) {
        nativeFees[_token][_toChain] = _amount;
        emit SetNativeFee(_token, _toChain, _amount);
    }

    function setNativeFeeReceiver(address _receiver) external onlyRole(MANAGE_ROLE) checkAddress(_receiver) {
        nativeFeeReceiver = _receiver;
        emit SetNativeFeeReceiver(_receiver);
    }

    function trigger() external onlyRole(MANAGE_ROLE) {
        paused() ? _unpause() : _pause();
    }

    function isMintable(address _token) public view virtual returns (bool) {}

    function swapOut(SwapOutParam calldata param) external payable virtual nonReentrant whenNotPaused {}

    function interTransferAndCall(
        uint256 amount,
        address proxy,
        InterTransferParam calldata interTransferParam
    ) external payable nonReentrant whenNotPaused {
        require(amount != 0, "zero in");
        require(proxy != Helper.ZERO_ADDRESS, "zero addr");
        address token = IMORC20(proxy).token();

        uint256 value;
        // transfer token in
        if (Helper._isNative(token)) {
            require(msg.value == amount, "receive too low");
            value = amount;
        } else {
            IERC20Upgradeable(token).safeTransferFrom(msg.sender, address(this), amount);
            if (token != proxy) {
                IERC20Upgradeable(token).safeIncreaseAllowance(proxy, amount);
            }
        }
        // fee
        if (token == interTransferParam.feeToken) {
            // amount must > fee or overflow
            amount -= interTransferParam.fee;
        } else {
            if (Helper._isNative(interTransferParam.feeToken)) {
                require(msg.value == interTransferParam.fee, "fee mismatch");
                value = interTransferParam.fee;
            } else {
                require(interTransferParam.feePayer != Helper.ZERO_ADDRESS, "zero addr");
                IERC20Upgradeable(interTransferParam.feeToken).safeTransferFrom(
                    interTransferParam.feePayer,
                    address(this),
                    interTransferParam.fee
                );
                IERC20Upgradeable(interTransferParam.feeToken).safeIncreaseAllowance(proxy, interTransferParam.fee);
            }
        }
        // bridge
        if (interTransferParam.messageData.length != 0) {
            IMORC20(proxy).interTransferAndCall{value: value}(
                address(this),
                interTransferParam.toChainId,
                interTransferParam.toAddress,
                amount,
                interTransferParam.gasLimit,
                interTransferParam.refundAddress,
                interTransferParam.messageData
            );
        } else {
            IMORC20(proxy).interTransfer{value: value}(
                address(this),
                interTransferParam.toChainId,
                interTransferParam.toAddress,
                amount,
                interTransferParam.gasLimit
            );
        }
        emit InterTransferAndCall(proxy, token, amount);
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
        address proxy = msg.sender;
        address token = IMORC20(proxy).token();
        require(Helper._getBalance(token, address(this)) >= _amount, "receive too low");
        SwapInParam memory param;
        param.from = from;
        param.fromChain = _fromChain;
        param.orderId = _orderId;
        param.amount = _amount;
        (param.to, param.swapData) = abi.decode(_message, (address, bytes));
        _swapIn(param);
        return true;
    }

    function getNativeFeePrice(address _token, uint256 _amount, uint256 _tochain) external view returns (uint256) {
        return nativeFees[_token][_tochain];
    }

    function _tokenIn(
        uint256 toChain,
        uint256 amount,
        address token_,
        uint256 gasLimit,
        uint256 relayGasLimit,
        bool isSwap
    ) internal returns (address token, uint256 nativeFee, uint256 messageFee) {
        require(amount > 0, "Sending value is zero");
        token = token_;
        messageFee = getMessageFee(gasLimit, relayGasLimit, toChain);
        if (isSwap) nativeFee = _chargeNativeFee(token_, amount, toChain);
        if (Helper._isNative(token)) {
            require((amount + messageFee + nativeFee) == msg.value, "value and fee mismatching");
            Helper._safeDeposit(wToken, amount);
            token = wToken;
        } else {
            IERC20Upgradeable(token).safeTransferFrom(msg.sender, address(this), amount);
            require((messageFee + nativeFee) == msg.value, "fee mismatching");
            if (isMintable(token)) {
                IMintableToken(token).burn(amount);
            }
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
            if (param.token == wToken) {
                Helper._safeWithdraw(wToken, param.amount);
                AddressUpgradeable.sendValue(payable(param.to), param.amount);
            } else {
                Helper._transfer(selfChainId, param.token, param.to, param.amount);
            }
        }
        emit SwapIn(param.token, param.amount, param.to, param.fromChain, param.from);
    }

    function _checkBytes(bytes memory b1, bytes memory b2) internal pure returns (bool) {
        return keccak256(b1) == keccak256(b2);
    }

    function _checkLimit(uint256 amount, uint256 tochain, address token) internal {
        if (address(swapLimit) != address(0)) swapLimit.checkLimit(amount, tochain, token);
    }

    function getMessageFee(uint256 gasLimit, uint256 relayGasLimit, uint256 tochain) public virtual returns (uint256) {}

    function _chargeNativeFee(address _token, uint256 _amount, uint256 _tochain) internal virtual returns (uint256) {
        uint256 fee = nativeFees[_token][_tochain];
        if (fee != 0 && nativeFeeReceiver != address(0)) {
            Helper._transfer(selfChainId, address(0), nativeFeeReceiver, fee);
            emit ChargeNativeFee(_token, _amount, fee, selfChainId, _tochain);
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
