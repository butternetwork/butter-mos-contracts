// SPDX-License-Identifier: MIT

pragma solidity 0.8.25;

import {IButterBridgeV3} from "../interface/IButterBridgeV3.sol";
import {IMOSV3} from "../interface/IMOSV3.sol";
import {IMintableToken} from "../interface/IMintableToken.sol";
import {IMapoExecutor} from "../interface/IMapoExecutor.sol";
import {ISwapOutLimit} from "../interface/ISwapOutLimit.sol";
import {IButterReceiver} from "../interface/IButterReceiver.sol";
import {IFeeService} from "../interface/IFeeService.sol";
import {ERC1967Utils} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Utils.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {PausableUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import {ReentrancyGuardUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
// import {AccessControlEnumerableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/extensions/AccessControlEnumerableUpgradeable.sol";
import {AccessManagedUpgradeable} from "@openzeppelin/contracts-upgradeable/access/manager/AccessManagedUpgradeable.sol";
import {EvmDecoder} from "../lib/EvmDecoder.sol";
import {MessageInEvent} from "../lib/Types.sol";
import {Helper} from "../lib/Helper.sol";

abstract contract BridgeAbstract is
    UUPSUpgradeable,
    PausableUpgradeable,
    ReentrancyGuardUpgradeable,
    AccessManagedUpgradeable,
    //AccessControlEnumerableUpgradeable,
    IButterBridgeV3,
    IMOSV3
{
    address internal constant ZERO_ADDRESS = address(0);
    uint256 constant MINTABLE_TOKEN = 0x01;

    //bytes32 public constant MANAGER_ROLE = keccak256("MANAGER_ROLE");
    //bytes32 public constant UPGRADER_ROLE = keccak256("UPGRADER_ROLE");

    uint256 public immutable selfChainId = block.chainid;

    uint256 private nonce;

    address internal wToken;
    // address internal butterRouter;
    IFeeService internal feeService;
    ISwapOutLimit internal swapLimit;

    mapping(address => uint256) public trustList;

    mapping(bytes32 => uint256) public orderList;

    mapping(address => uint256) public tokenFeatureList;
    mapping(uint256 => mapping(address => uint256)) public tokenMappingList;

    // service fee or bridge fee
    // address => (token => amount)
    mapping(address => mapping(address => uint256)) public feeList;

    error order_exist();
    error invalid_order_Id();
    error invalid_bridge_log();
    error invalid_pack_version();
    error in_amount_low();

    error token_not_registered();
    error zero_address();
    error not_contract();
    error zero_amount();
    error invalid_mos_contract();
    // error invalid_message_fee();
    error length_mismatching();
    error bridge_same_chain();
    error only_upgrade_role();
    error not_support_value();
    error not_support_target_chain();
    error unsupported_message_type();
    error retry_verify_fail();

    event SetContract(uint256 t, address addr);
    event RegisterToken(address token, uint256 toChain, bool enable);
    event UpdateToken(address token, uint256 feature);
    event UpdateTrust(address trustAddress, bool enable);
    event WithdrawFee(address receiver, address token, uint256 amount);
    event GasInfo(bytes32 indexed orderId, uint256 indexed executingGas, uint256 indexed executedGas);

    event MessageTransfer(
        address initiator,
        address referrer,
        address sender,
        bytes32 orderId,
        bytes32 transferId,
        address feeToken,
        uint256 fee
    );

    receive() external payable {}

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(address _wToken, address _defaultAdmin) public initializer {
        _checkAddress(_wToken);
        _checkAddress(_defaultAdmin);
        __Pausable_init();
        __ReentrancyGuard_init();
        __AccessManaged_init(_defaultAdmin);
        wToken = _wToken;
    }

    // --------------------------------------------- manage ----------------------------------------------
    function trigger() external restricted {
        paused() ? _unpause() : _pause();
    }

    function registerTokenChains(address _token, uint256[] memory _toChains, bool _enable) external restricted {
        if (!Helper._isContract(_token)) revert not_contract();
        for (uint256 i = 0; i < _toChains.length; i++) {
            uint256 toChain = _toChains[i];
            uint256 enable = _enable ? 0x01 : 0x00;
            tokenMappingList[toChain][_token] = enable;
            emit RegisterToken(_token, toChain, _enable);
        }
    }

    function updateTokens(address[] calldata _tokens, uint256 _feature) external restricted {
        for (uint256 i = 0; i < _tokens.length; i++) {
            tokenFeatureList[_tokens[i]] = _feature;
            emit UpdateToken(_tokens[i], _feature);
        }
    }

    function setTrustAddress(address _addr, bool _enable) external restricted {
        uint256 enable = _enable ? 0x01 : 0x00;
        trustList[_addr] = enable;
        emit UpdateTrust(_addr, _enable);
    }

    // --------------------------------------------- external view -------------------------------------------
    function isMintable(address _token) external view returns (bool) {
        return _isMintable(_token);
    }

    function getOrderStatus(
        uint256,
        uint256 _blockNum,
        bytes32 _orderId
    ) external view virtual override returns (bool exists, bool verifiable, uint256 nodeType) {}

    function getMessageFee(
        uint256 _toChain,
        address _feeToken,
        uint256 _gasLimit
    ) external view returns (uint256 fee, address receiver) {
        (fee, receiver) = _getMessageFee(_toChain, _feeToken, _gasLimit);
    }

    // --------------------------------------------- external ---------------------------------------------
    function withdrawFee(address receiver, address token) external payable {
        uint256 amount = feeList[receiver][token];
        if (amount > 0) {
            _tokenTransferOut(token, receiver, amount, true, false);
        }
        emit WithdrawFee(receiver, token, amount);
    }

    function transferOut(
        uint256 _toChain,
        bytes memory _messageData,
        address _feeToken
    ) external payable virtual override returns (bytes32 orderId) {}

    function swapOutToken(
        address _sender, // initiator address
        address _token, // src token
        bytes memory _to,
        uint256 _amount,
        uint256 _toChain, // target chain id
        bytes calldata _swapData
    ) external payable virtual override returns (bytes32 orderId) {}

    function depositToken(
        address _token,
        address to,
        uint256 _amount
    ) external payable virtual returns (bytes32 orderId) {}

    function retryMessageIn(
        uint256 _fromChain,
        bytes32 _orderId,
        address _token,
        uint256 _amount,
        bytes calldata _fromAddress,
        bytes calldata _swapData,
        bytes calldata _retryMessage
    ) external virtual {}

    // --------------------------------------------- internal ---------------------------------------------

    function _transferOut(
        uint256 _fromChain,
        uint256 _toChain,
        bytes calldata _messageData,
        address _feeToken
    ) internal virtual returns (MessageData memory msgData) {
        if (_toChain == _fromChain) revert bridge_same_chain();

        msgData = abi.decode(_messageData, (MessageData));
        if (msgData.value != 0) revert not_support_value();
        if (msgData.msgType != MessageType.MESSAGE) revert unsupported_message_type();

        (uint256 amount, address receiverFeeAddress) = _getMessageFee(_toChain, _feeToken, msgData.gasLimit);

        _tokenTransferIn(_feeToken, msg.sender, amount, false, false);
        feeList[receiverFeeAddress][_feeToken] += amount;
    }

    function _messageIn(MessageInEvent memory _inEvent, bool _gasleft) internal {
        address to = Helper._fromBytes(_inEvent.to);
        uint256 gasLimit = _inEvent.gasLimit;

        uint256 executingGas = gasleft();
        if (_gasleft) {
            gasLimit = executingGas;
        }
        if (!Helper._isContract(to)) {
            return _storeMessageData(_inEvent, bytes("NotContract"));
        }

        try
            IMapoExecutor(to).mapoExecute{gas: gasLimit}(
                _inEvent.fromChain,
                _inEvent.toChain,
                _inEvent.from,
                _inEvent.orderId,
                _inEvent.swapData
            )
        {
            emit MessageIn(
                _inEvent.orderId,
                _inEvent.fromChain,
                ZERO_ADDRESS,
                0,
                to,
                _inEvent.from,
                bytes(""),
                true,
                bytes("")
            );
        } catch (bytes memory reason) {
            emit GasInfo(_inEvent.orderId, executingGas, gasleft());
            _storeMessageData(_inEvent, reason);
        }
    }

    function _swapIn(MessageInEvent memory _inEvent) internal {
        address outToken = _inEvent.token;
        address to = Helper._fromBytes(_inEvent.to);
        if (_inEvent.swapData.length > 0 && Helper._isContract(to)) {
            // if swap params is not empty, then we need to do swap on current chain
            _tokenTransferOut(_inEvent.token, to, _inEvent.amount, false, false);
            try
                IButterReceiver(to).onReceived(
                    _inEvent.orderId,
                    _inEvent.token,
                    _inEvent.amount,
                    _inEvent.fromChain,
                    _inEvent.from,
                    _inEvent.swapData
                )
            {} catch {}
        } else {
            // transfer token if swap did not happen
            _tokenTransferOut(_inEvent.token, to, _inEvent.amount, true, false);
            if (_inEvent.token == wToken) outToken = ZERO_ADDRESS;
        }
        emit MessageIn(
            _inEvent.orderId,
            _inEvent.fromChain,
            outToken,
            _inEvent.amount,
            to,
            _inEvent.from,
            bytes(""),
            true,
            bytes("")
        );
    }

    function _tokenTransferIn(
        address _token,
        address _from,
        uint256 _amount,
        bool _wrap,
        bool _checkBurn
    ) internal returns (address inToken) {
        inToken = _token;
        if (_token == ZERO_ADDRESS) {
            if (msg.value < _amount) revert in_amount_low();
            if (_wrap) {
                Helper._safeDeposit(wToken, _amount);
                inToken = wToken;
            }
        } else {
            Helper._safeTransferFrom(_token, _from, address(this), _amount);
            if (_checkBurn) {
                _checkAndBurn(_token, _amount);
            }
        }
    }

    function _tokenTransferOut(
        address _token,
        address _receiver,
        uint256 _amount,
        bool _unwrap,
        bool _checkMint
    ) internal {
        if (_token == ZERO_ADDRESS) {
            Helper._safeTransferNative(_receiver, _amount);
        } else if (_token == wToken && _unwrap) {
            Helper._safeWithdraw(wToken, _amount);
            Helper._safeTransferNative(_receiver, _amount);
        } else {
            if (block.chainid == 728126428 && _token == 0xa614f803B6FD780986A42c78Ec9c7f77e6DeD13C) {
                // Tron USDT
                _token.call(abi.encodeWithSelector(0xa9059cbb, _receiver, _amount));
            } else {
                if (_checkMint) {
                    _checkAndMint(_token, _amount);
                }
                Helper._safeTransfer(_token, _receiver, _amount);
            }
        }
    }

    function _notifyLightClient(uint256 _chainId) internal virtual {}

    // messageType,fromChain,toChain,gasLimit,mos,to,token,amount,swapData
    function _messageOut(
        bool _relay,
        address _initiator,
        address _sender,
        MessageInEvent memory _inEvent
    ) internal returns (bytes32 orderId) {
        uint256 header = EvmDecoder.encodeMessageHeader(_relay, _inEvent.messageType);
        if (_inEvent.messageType == uint8(MessageType.BRIDGE)) {
            // todo: add transfer limit check
            // _checkLimit(_amount, _toChain, _token);
            _checkBridgeable(_inEvent.token, _inEvent.toChain);
        }
        if (_inEvent.toChain == _inEvent.fromChain) revert bridge_same_chain();

        address initiator = (trustList[_sender] == 0x01) ? _initiator : _sender;

        uint256 chainAndGasLimit = _getChainAndGasLimit(_inEvent.fromChain, _inEvent.toChain, _inEvent.gasLimit);

        orderId = _getOrderId(_inEvent.fromChain, _inEvent.toChain, _sender, _inEvent.to);

        bytes memory payload = abi.encode(
            header,
            _inEvent.mos,
            _inEvent.token,
            _inEvent.amount,
            initiator,
            _sender,
            _inEvent.to,
            _inEvent.swapData
        );

        emit MessageOut(orderId, chainAndGasLimit, payload);

        _notifyLightClient(_inEvent.toChain);
    }

    function _storeMessageData(MessageInEvent memory _inEvent, bytes memory _reason) internal {
        orderList[_inEvent.orderId] = uint256(
            keccak256(
                abi.encodePacked(
                    _inEvent.messageType,
                    _inEvent.fromChain,
                    _inEvent.toChain,
                    _inEvent.token,
                    _inEvent.amount,
                    _inEvent.gasLimit,
                    _inEvent.from,
                    _inEvent.to,
                    _inEvent.swapData
                )
            )
        );
        bytes memory payload = abi.encode(
            _inEvent.messageType,
            _inEvent.toChain,
            _inEvent.gasLimit,
            _inEvent.to,
            _inEvent.swapData
        );
        emit MessageIn(
            _inEvent.orderId,
            _inEvent.fromChain,
            _inEvent.token,
            _inEvent.amount,
            Helper._fromBytes(_inEvent.to),
            _inEvent.from,
            payload,
            false,
            _reason
        );
    }

    function _getStoredMessage(
        uint256 _fromChain,
        bytes32 _orderId,
        address _token,
        uint256 _amount,
        bytes calldata _fromAddress,
        bytes calldata _swapData
    ) internal returns (MessageInEvent memory inEvent) {
        (inEvent.messageType, inEvent.toChain, inEvent.gasLimit, inEvent.to, inEvent.swapData) = abi.decode(
            _swapData,
            (uint8, uint256, uint256, bytes, bytes)
        );

        bytes32 retryHash = keccak256(
            abi.encodePacked(
                inEvent.messageType,
                _fromChain,
                inEvent.toChain,
                _token,
                _amount,
                inEvent.gasLimit,
                _fromAddress,
                inEvent.to,
                inEvent.swapData
            )
        );
        if (uint256(retryHash) != orderList[_orderId]) revert retry_verify_fail();

        inEvent.fromChain = _fromChain;
        inEvent.orderId = _orderId;
        inEvent.token = _token;
        inEvent.amount = _amount;
        inEvent.from = _fromAddress;

        orderList[_orderId] = 0x01;
    }

    function _getOrderId(
        uint256 _fromChain,
        uint256 _toChain,
        address _from,
        bytes memory _to
    ) internal returns (bytes32) {
        return keccak256(abi.encodePacked(address(this), nonce++, _fromChain, _toChain, _from, _to));
    }

    function _getMessageFee(
        uint256 _toChain,
        address _feeToken,
        uint256 _gasLimit
    ) internal view returns (uint256 amount, address receiverAddress) {
        (amount, receiverAddress) = feeService.getServiceMessageFee(_toChain, _feeToken, _gasLimit);
        if (amount == 0) revert not_support_target_chain();
    }

    function _checkAddress(address _address) internal pure {
        if (_address == ZERO_ADDRESS) revert zero_address();
    }

    function _checkBridgeable(address _token, uint256 _chainId) internal view {
        if ((tokenMappingList[_chainId][_token] & 0x0F) != 0x01) revert token_not_registered();
    }

    function _checkAndBurn(address _token, uint256 _amount) internal {
        if (_isMintable(_token)) {
            IMintableToken(_token).burn(_amount);
        }
    }

    function _checkAndMint(address _token, uint256 _amount) internal {
        if (_isMintable(_token)) {
            IMintableToken(_token).mint(address(this), _amount);
        }
    }

    function _isMintable(address _token) internal view returns (bool) {
        return (tokenFeatureList[_token] & MINTABLE_TOKEN) == MINTABLE_TOKEN;
    }

    function _checkLimit(uint256 amount, uint256 tochain, address token) internal {
        if (address(swapLimit) != ZERO_ADDRESS) swapLimit.checkLimit(amount, tochain, token);
    }

    function _checkOrder(bytes32 _orderId) internal {
        if (orderList[_orderId] >= 0x01) revert order_exist();
        orderList[_orderId] = 0x01;
    }

    function _getChainAndGasLimit(
        uint256 _fromChain,
        uint256 _toChain,
        uint256 _gasLimit
    ) internal pure returns (uint256 chainAndGasLimit) {
        chainAndGasLimit = ((_fromChain << 192) | (_toChain << 128) | _gasLimit);
    }

    /** UUPS *********************************************************/
    function _authorizeUpgrade(address) internal override restricted {
        // if (!hasRole(UPGRADER_ROLE, msg.sender)) revert only_upgrade_role();
    }

    function getImplementation() external view returns (address) {
        return ERC1967Utils.getImplementation();
        // return _getImplementation();
    }
}
