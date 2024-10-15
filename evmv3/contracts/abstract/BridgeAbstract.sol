// SPDX-License-Identifier: MIT

pragma solidity 0.8.20;

import "../interface/IButterBridgeV3.sol";
import "../interface/IMOSV3.sol";
import "../interface/IMintableToken.sol";
import "../interface/IMapoExecutor.sol";
import "../interface/ISwapOutLimit.sol";
import "../interface/IButterReceiver.sol";
import "../interface/IFeeService.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlEnumerableUpgradeable.sol";
import {EvmDecoder} from "../lib/EvmDecoder.sol";
import {EVMSwapOutEvent} from "../lib/Types.sol";
import "@mapprotocol/protocol/contracts/utils/Utils.sol";

abstract contract BridgeAbstract is
    UUPSUpgradeable,
    PausableUpgradeable,
    ReentrancyGuardUpgradeable,
    AccessControlEnumerableUpgradeable,
    IButterBridgeV3,
    IMOSV3
{
    uint256 constant MINTABLE_TOKEN = 0x01;

    bytes32 public constant MANAGER_ROLE = keccak256("MANAGER_ROLE");
    bytes32 public constant UPGRADER_ROLE = keccak256("UPGRADER_ROLE");

    uint256 public immutable selfChainId = block.chainid;

    uint256 private nonce;
    address private wToken;
    address private butterRouter;
    ISwapOutLimit public swapLimit;
    IFeeService public feeService;

    mapping(bytes32 => uint256) public orderList;

    mapping(address => mapping(uint256 => mapping(bytes => bool))) public callerList;

    mapping(bytes32 => bytes32) public storedMessageList;

    //
    mapping(address => uint256) public tokenFeatureList;
    mapping(uint256 => mapping(address => uint256)) public tokenMappingList;

    error order_exist();
    error invalid_order_Id();
    error invalid_bridge_log();
    error invalid_pack_version();
    error in_amount_low();
    error token_call_failed();
    error token_not_registered();
    error zero_address();
    error not_contract();
    error zero_amount();
    error bridge_same_chain();
    error only_upgrade_role();
    event SetContract(uint256 _t, address _addr);
    event RegisterToken(address _token, uint256 _toChain, bool _enable);
    event UpdateToken(address token, address _omniProxy, uint96 feature);
    event GasInfo(bytes32 indexed orderId,uint256 indexed executingGas,uint256 indexed executedGas);

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
        __AccessControlEnumerable_init();
        _grantRole(DEFAULT_ADMIN_ROLE, _defaultAdmin);
        _grantRole(MANAGER_ROLE, _defaultAdmin);
        _grantRole(UPGRADER_ROLE, _defaultAdmin);
        wToken = _wToken;
    }

    function setContract(uint256 _t, address _addr) external onlyRole(MANAGER_ROLE) {
        if (_addr == address(0)) revert zero_address();
        if (_t == 0) {
            wToken = _addr;
        } else if (_t == 1) {
            swapLimit = ISwapOutLimit(_addr);
        } else {
            butterRouter = _addr;
        }
        emit SetContract(_t, _addr);
    }

    function trigger() external onlyRole(MANAGER_ROLE) {
        paused() ? _unpause() : _pause();
    }

    function registerTokenChains(
        address _token,
        uint256[] memory _toChains,
        bool _enable
    ) external onlyRole(MANAGER_ROLE) {
        require(_isContract(_token), "token is not contract");
        for (uint256 i = 0; i < _toChains.length; i++) {
            uint256 toChain = _toChains[i];
            uint256 enable = _enable ? 0x01 : 0x00;
            tokenMappingList[toChain][_token] = enable;
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

    function _swapIn(
        bytes32 _orderId,
        address _token,
        address _to,
        uint256 _amount,
        uint256 _fromChain,
        bytes memory _from,
        bytes memory _swapData
    ) internal {
        address outToken = _token;
        if (_swapData.length > 0 && _isContract(_to)) {
            // if swap params is not empty, then we need to do swap on current chain
            _transferOut(_token, _to, _amount, false);
            try IButterReceiver(_to).onReceived(_orderId, _token, _amount, _fromChain, _from, _swapData) {} catch {}
        } else {
            // transfer token if swap did not happen
            _transferOut(_token, _to, _amount, true);
            if (_token == wToken) outToken = address(0);
        }
        emit MessageIn(_orderId, _fromChain, outToken, _amount, _to, _from, bytes(""));
    }

    function _transferIn(
        address _token,
        address _from,
        uint256 _amount,
        bool _wrap
    ) internal returns (address inToken) {
        inToken = _token;
        if (_token == address(0)) {
            if (msg.value < _amount) revert in_amount_low();
            if (_wrap) {
                _safeDeposit(wToken, _amount);
                inToken = wToken;
            }
        } else {
            _safeTransferFrom(_token, _from, address(this), _amount);
            _checkAndBurn(_token, _amount);
        }
    }

    function _transferOut(address _token, address _receiver, uint256 _amount, bool _unwrap) internal {
        if (_token == wToken && _unwrap) {
            _safeWithdraw(wToken, _amount);
            _safeTransferNative(_receiver, _amount);
        } else {
            if (selfChainId == 728126428 && _token == 0xa614f803B6FD780986A42c78Ec9c7f77e6DeD13C) {
                // Tron USDT
                _token.call(abi.encodeWithSelector(0xa9059cbb, _receiver, _amount));
            } else {
                _checkAndMint(_token, _amount);
                _safeTransfer(_token, _receiver, _amount);
            }
        }
    }

    function _notifyLightClient(uint256 _chainId, bytes memory _data) internal virtual {}

    function _messageOut(
        MessageType _type,
        address _from,
        address _token, // src token
        uint256 _amount,
        address _mos,
        uint256 _toChain, // target chain id
        bytes memory _to,
        BridgeParam memory _bridge
    ) internal returns (bytes32 orderId) {
        uint256 header = EvmDecoder.encodeMessageHeader(_bridge.relay, uint8(_type));

        if (_type == MessageType.BRIDGE) {
            _checkLimit(_amount, _toChain, _token);
            _checkBridgeable(_token, _toChain);
        }

        uint256 fromChain = selfChainId;
        if (_toChain == fromChain) revert bridge_same_chain();

        address from = (msg.sender == butterRouter) ? _from : msg.sender;

        uint256 chainAndGasLimit = _getChainAndGasLimit(fromChain, _toChain, _bridge.gasLimit);

        orderId = _getOrderId(fromChain, _toChain, from, _to);

        bytes memory messageData = abi.encode(header, _mos, _token, _amount, from, _to, _bridge.swapData);

        emit MessageOut(orderId, chainAndGasLimit, messageData);

        _notifyLightClient(_toChain, bytes(""));
    }

    function _messageIn(
        EVMSwapOutEvent memory _outEvent,
        MessageData memory _msgData,
        bool _gasleft,
        bool _revert
    ) internal {
        if(_revert){
            _retryExecute(_outEvent, _msgData);
            emit MessageIn(
                _outEvent.orderId,
                _outEvent.fromChain,
                address(0),
                0,
                Utils.fromBytes(_msgData.target),
                _outEvent.from,
                bytes("")
            );
//            emit MessageIn(
//                _outEvent.fromChain,
//                _outEvent.toChain,
//                _outEvent.orderId,
//                _outEvent.fromAddress,
//                bytes(""),
//                true,
//                bytes("")
//            );
        } else {
            uint256 executingGas = gasleft();
            (bool success, bytes memory returnData) = _messageExecute(_outEvent, _msgData, _gasleft);
            emit GasInfo(_outEvent.orderId,executingGas,gasleft());
            if (success) {
                emit MessageIn(
                    _outEvent.orderId,
                    _outEvent.fromChain,
                    address(0),
                    0,
                    Utils.fromBytes(_msgData.target),
                    _outEvent.from,
                    bytes("")
                );
            } else {
                _storeMessageData(_outEvent, returnData);
            }
        }
    }

    function _retryExecute(
        EVMSwapOutEvent memory _outEvent,
        MessageData memory _msgData
    ) internal returns(bytes memory returnData){
        address target = Utils.fromBytes(_msgData.target);
        require(AddressUpgradeable.isContract(target),"NotContract");
        if (_msgData.msgType == MessageType.CALLDATA) {
            require(callerList[target][_outEvent.fromChain][_outEvent.from],"InvalidCaller");
            bool success;
            (success, returnData) = target.call(_msgData.payload);
            require(success,"MOSV3: retry call failed");
        } else if (_msgData.msgType == MessageType.MESSAGE) {
            returnData = IMapoExecutor(target).mapoExecute(
                _outEvent.fromChain,
                _outEvent.toChain,
                _outEvent.from,
                _outEvent.orderId,
                _msgData.payload
            );
        } else {
            require(false, "InvalidMessageType");
        }
    }

    function _messageExecute(
        EVMSwapOutEvent memory _outEvent,
        MessageData memory _msgData,
        bool _gasleft
    ) internal returns (bool, bytes memory) {
        uint256 gasLimit = _msgData.gasLimit;
        if (_gasleft) {
            gasLimit = gasleft();
        }
        address target = Utils.fromBytes(_msgData.target);
        if (!AddressUpgradeable.isContract(target)) {
            return (false, bytes("NotContract"));
        }
        if (_msgData.msgType == MessageType.CALLDATA) {
            if (!callerList[target][_outEvent.fromChain][_outEvent.from]) {
                return (false, bytes("InvalidCaller"));
            }
            (bool success, bytes memory returnData) = target.call{gas: gasLimit}(_msgData.payload);
            if (!success) {
                return (false, returnData);
            } else {
                if (_msgData.relay) {
                    bytes memory data = abi.decode(returnData, (bytes));
                    return (true, data);
                } else {
                    return (true, returnData);
                }
            }
        } else if (_msgData.msgType == MessageType.MESSAGE) {
            try
            IMapoExecutor(target).mapoExecute{gas: gasLimit}(
                _outEvent.fromChain,
                _outEvent.toChain,
                _outEvent.from,
                _outEvent.orderId,
                _msgData.payload
            )
            returns (bytes memory returnData) {
                return (true, returnData);
            } catch (bytes memory reason) {
                return (false, reason);
            }
        } else {
            return (false, bytes("InvalidMessageType"));
        }
    }

    function _storeMessageData(EVMSwapOutEvent memory _outEvent, bytes memory _reason) internal {
        if(_outEvent.toChain == selfChainId){
            storedMessageList[_outEvent.orderId] = keccak256(
                abi.encodePacked(_outEvent.fromChain, _outEvent.from, _outEvent.swapData)
            );
        }else{
            storedMessageList[_outEvent.orderId] = keccak256(
                abi.encodePacked(_outEvent.fromChain, _outEvent.toChain,_outEvent.from, _outEvent.swapData)
            );
        }
        emit MessageIn(
            _outEvent.orderId,
            _outEvent.fromChain,
            address(0),
            0,
            _outEvent.to,
            _outEvent.from,
            _reason
        );
    }

    function _getOrderId(
        uint256 _fromChain,
        uint256 _toChain,
        address _from,
        bytes memory _to
    ) internal returns (bytes32) {
        return keccak256(abi.encodePacked(address(this), nonce++, _fromChain, _toChain, _from, _to));
    }

    function _checkAddress(address _address) internal pure {
        if (_address == address(0)) revert zero_address();
    }

    function _checkBridgeable(address _token, uint256 _chainId) internal view {
        require((tokenMappingList[_chainId][_token] & 0x0F) == 0x01, "token not registered");
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
        if (address(swapLimit) != address(0)) swapLimit.checkLimit(amount, tochain, token);
    }

    function _checkOrder(bytes32 _orderId) internal {
        if (orderList[_orderId] == 0x01) revert order_exist();
        orderList[_orderId] = 0x01;
    }

    function _getChainAndGasLimit(
        uint256 _fromChain,
        uint256 _toChain,
        uint256 _gasLimit
    ) internal pure returns (uint256 chainAndGasLimit) {
        chainAndGasLimit = ((_fromChain << 192) | (_toChain << 128) | _gasLimit);
    }

    // --------------------------------------------- utils ----------------------------------------------
    function _checkBytes(bytes memory b1, bytes memory b2) internal pure returns (bool) {
        return keccak256(b1) == keccak256(b2);
    }

    function _toBytes(address _a) internal pure returns (bytes memory) {
        return abi.encodePacked(_a);
    }

    function _fromBytes(bytes memory bys) internal pure returns (address addr) {
        assembly {
            addr := mload(add(bys, 20))
        }
    }

    function _safeTransfer(address token, address to, uint256 value) internal {
        // bytes4(keccak256(bytes('transfer(address,uint256)')));
        (bool success, bytes memory data) = token.call(abi.encodeWithSelector(0xa9059cbb, to, value));
        _checkCallResult(success, data);
    }

    function _safeTransferFrom(address token, address from, address to, uint256 value) internal {
        // bytes4(keccak256(bytes('transferFrom(address,address,uint256)')));
        (bool success, bytes memory data) = token.call(abi.encodeWithSelector(0x23b872dd, from, to, value));
        _checkCallResult(success, data);
    }

    function _safeTransferNative(address to, uint256 value) internal {
        (bool success, ) = to.call{value: value}(bytes(""));
        _checkCallResult(success, bytes(""));
    }

    function _safeWithdraw(address _wToken, uint _value) internal {
        (bool success, bytes memory data) = _wToken.call(abi.encodeWithSelector(0x2e1a7d4d, _value));
        _checkCallResult(success, data);
    }

    function _safeDeposit(address _wToken, uint _value) internal {
        (bool success, bytes memory data) = _wToken.call{value: _value}(abi.encodeWithSelector(0xd0e30db0));
        _checkCallResult(success, data);
    }

    function _checkCallResult(bool _success, bytes memory _data) internal pure {
        if (!_success || (_data.length != 0 && !abi.decode(_data, (bool)))) revert token_call_failed();
    }

    function _isContract(address _addr) internal view returns (bool) {
        return _addr.code.length != 0;
    }

    function _getMessageFee(
        uint256 _toChain,
        address _feeToken,
        uint256 _gasLimit
    ) internal view returns (uint256 amount, address receiverAddress) {

        (amount, receiverAddress) = feeService.getServiceMessageFee(_toChain, _feeToken,_gasLimit);
        require(amount > 0, "MOSV3: not support target chain");

    }


    /** UUPS *********************************************************/
    function _authorizeUpgrade(address) internal view override {
        if (!hasRole(UPGRADER_ROLE, msg.sender)) revert only_upgrade_role();
    }

    function getImplementation() external view returns (address) {
        return _getImplementation();
    }
}
