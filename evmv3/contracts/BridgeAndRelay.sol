// SPDX-License-Identifier: MIT

pragma solidity 0.8.25;

import "./interface/IVaultTokenV3.sol";
import "./abstract/BridgeAbstract.sol";
import "./interface/ITokenRegisterV3.sol";
import "./interface/IDepositWhitelist.sol";
import "./lib/NearDecoder.sol";
import {NonEvmDecoder} from "./lib/NonEvmDecoder.sol";
import "./interface/IRelayExecutor.sol";
import {MessageOutEvent} from "./lib/Types.sol";
import "@mapprotocol/protocol/contracts/interface/ILightVerifier.sol";
import "@mapprotocol/protocol/contracts/interface/ILightClientManager.sol";

contract BridgeAndRelay is BridgeAbstract {

    address constant depositWhitelsit = 0x27172dA6b48DB586B5261ff90D6D1D5F2C1c1363;
    struct Rate {
        uint64 rate;
        address receiver;
    }

    enum ChainType {
        NULL,
        EVM,
        NEAR,
        TON,
        SOLANA,
        BTC,
        XRP
    }

    uint256 constant MAX_BASE_POINT = 10000;
    uint256 constant PACK_VERSION = 0x10;

    ITokenRegisterV3 public tokenRegister;
    ILightClientManager public lightClientManager;

    mapping(uint256 => bytes) public mosContracts;
    mapping(uint256 => ChainType) public chainTypes;
    //id : 0 VToken  1:relayer
    mapping(uint256 => Rate) public distributeRate;

    address private failedReceiver;

    error invalid_chain_id();
    error invalid_chain();
    //error unknown_log();
    error chain_type_error();
    error invalid_rate_id();
    error vault_token_not_registered();
    error invalid_vault_token();
    error invalid_rate_value();
    error out_token_not_registered();

    event RegisterChain(uint256 chainId, bytes bridge, ChainType chainType);
    event SetDistributeRate(uint256 id, address to, uint256 rate);
    event CollectFee(
        bytes32 indexed orderId,
        address indexed token,
        uint256 isFromChain,
        uint256 baseFee,
        uint256 bridgeFee,
        uint256 messageFee,
        uint256 vaultFee,
        uint256 protocolFee
    );
    event DepositIn(
        uint256 indexed fromChain,
        address indexed token,
        bytes32 indexed orderId,
        bytes from,
        address to,
        uint256 amount
    );

    event Withdraw(address token, address reicerver, uint256 vaultAmount, uint256 tokenAmount);

    // --------------------------------------------- manage ----------------------------------------------

    function setServiceContract(uint256 _t, address _addr) external restricted {
        _checkAddress(_addr);
        if (_t == 0) {
            wToken = _addr;
        } else if (_t == 1) {
            lightClientManager = ILightClientManager(_addr);
        } else if (_t == 2) {
            feeService = IFeeService(_addr);
        } else if (_t == 4) {
            tokenRegister = ITokenRegisterV3(_addr);
        } else if (_t == 5) {
            swapLimit = ISwapOutLimit(_addr);
        }
        emit SetContract(_t, _addr);
    }

    function setFailedReceiver(address _failedReceiver) external restricted {
        require(_failedReceiver != address(0));
        failedReceiver = _failedReceiver;
        emit SetFailedReceiver(_failedReceiver);
    }

    function getTransferOutFailedReceiver() public view override returns(address) {
        return failedReceiver;
    }


    function registerChain(
        uint256[] calldata _chainIds,
        bytes[] calldata _addresses,
        ChainType _type
    ) external restricted {
        uint256 len = _chainIds.length;
        if (len != _addresses.length) revert length_mismatching();
        for (uint256 i = 0; i < len; i++) {
            mosContracts[_chainIds[i]] = _addresses[i];
            chainTypes[_chainIds[i]] = _type;
            emit RegisterChain(_chainIds[i], _addresses[i], _type);
        }
    }

    function setDistributeRate(uint256 _id, address _to, uint256 _rate) external restricted {
        _checkAddress(_to);
        if (_id >= 3) revert invalid_rate_id();

        distributeRate[_id] = Rate(uint64(_rate), _to);

        if ((distributeRate[0].rate + distributeRate[1].rate + distributeRate[2].rate) > MAX_BASE_POINT)
            revert invalid_rate_value();
        emit SetDistributeRate(_id, _to, _rate);
    }

    // --------------------------------------------- external view -------------------------------------------
    function getServiceContract(uint256 _type) external view returns (address) {
        if (_type == 0) {
            return wToken;
        } else if (_type == 1) {
            return address(lightClientManager);
        } else if (_type == 2) {
            return address(feeService);
        } else if (_type == 4) {
            return address(tokenRegister);
        } else if (_type == 5) {
            return address(swapLimit);
        }
        return ZERO_ADDRESS;
    }

    function getOrderStatus(
        uint256 _chainId,
        uint256 _blockNum,
        bytes32 _orderId
    ) external view override returns (bool exists, bool verifiable, uint256 nodeType) {
        exists = (orderList[_orderId] == 0x01);
        verifiable = lightClientManager.isVerifiable(_chainId, _blockNum, bytes32(""));
        nodeType = lightClientManager.nodeType(_chainId);
    }

    //function getBridgeTokenList() external view returns (address[] memory) {
    //    return tokenRegister.getBridgeTokenList();
    //}

    function getBridgeTokenInfo(
        uint256 _fromChain,
        uint256 _toChain,
        bytes memory _fromToken
    ) external view returns (bytes memory toChainToken, uint8 decimals, bool mintable) {
        return tokenRegister.getTargetToken(_fromChain, _toChain, _fromToken);
    }

    function getBridgeTokenInfoV2(
        uint256 _fromChain,
        uint256 _toChain,
        bytes memory _fromToken
    ) external view returns (bytes memory toChainToken, uint8 decimals, bool mintable, uint256 vaultBalance) {
        return tokenRegister.getTargetTokenV2(_fromChain, _toChain, _fromToken);
    }

    function getBridgeFeeInfo(
        bytes memory _caller,
        bytes memory _fromToken,
        address _bridgeToken,
        uint256 _fromChain,
        uint256 _fromAmount,
        uint256 _toChain,
        bool _withSwap
    ) external view returns (uint256 fromChainFee, uint256 vaultBalance) {
        return
            tokenRegister.getBridgeFeeInfoV3(
                _caller,
                _fromToken,
                _bridgeToken,
                _fromChain,
                _fromAmount,
                _toChain,
                _withSwap
            );
    }

    function getSourceFeeByTarget(
        bytes memory _caller,
        bytes memory _targetToken,
        uint256 _targetChain,
        uint256 _targetAmount,
        uint256 _fromChain,
        bool _withSwap
    )
        external
        view
        returns (uint256 fromChainFee, uint256 toChainAmount, uint256 vaultBalance, bytes memory fromChainToken)
    {
        return
            tokenRegister.getSourceFeeByTargetV3(
                _caller,
                _targetToken,
                _targetChain,
                _targetAmount,
                _fromChain,
                _withSwap
            );
    }

    // --------------------------------------------- external ----------------------------------------------
    function withdraw(address _vaultToken, uint256 _vaultAmount) external whenNotPaused {
        if (_vaultToken == ZERO_ADDRESS) revert vault_token_not_registered();
        address token = IVaultTokenV3(_vaultToken).getTokenAddress();
        address vaultToken = tokenRegister.getVaultToken(token);
        if (_vaultToken != vaultToken) revert invalid_vault_token();
        uint256 amount = IVaultTokenV3(vaultToken).getTokenAmount(_vaultAmount);
        IVaultTokenV3(vaultToken).withdraw(selfChainId, _vaultAmount, msg.sender);
        _tokenTransferOut(token, msg.sender, amount, true);
        emit Withdraw(token, msg.sender, _vaultAmount, amount);
    }

    function transferOut(
        uint256 _toChain,
        bytes calldata _messageData,
        address _feeToken
    ) external payable override returns (bytes32 orderId) {
        address sender = msg.sender;
        MessageInEvent memory inEvent;

        inEvent.messageType = uint8(MessageType.MESSAGE);
        inEvent.fromChain = selfChainId;
        inEvent.toChain = _toChain;
        inEvent.mos = Helper._fromBytes(mosContracts[_toChain]);

        MessageData memory msgData = _transferOut(inEvent.fromChain, inEvent.toChain, _messageData, _feeToken);
        inEvent.to = msgData.target;
        inEvent.gasLimit = msgData.gasLimit;

        // messageType,fromChain,toChain,gasLimit,to
        inEvent.orderId = _messageOut(false, msgData.relay, sender, sender, inEvent);

        inEvent.from = Helper._toBytes(sender);
        inEvent.swapData = msgData.payload;
        // messageType,orderId,fromChain,toChain,gasLimit,to,from,swapData
        _emitMessageRelay(inEvent, Helper._toBytes(ZERO_ADDRESS), 0);

        return inEvent.orderId;
    }

    function depositToken(
        address _token,
        address _to,
        uint256 _amount
    ) external payable override nonReentrant whenNotPaused returns (bytes32 orderId) {
        address from = msg.sender;
        address token = _tokenTransferIn(_token, from, _amount, true, false);
        _deposit(token, Helper._toBytes(from), _to, _amount, orderId, selfChainId);
    }

    function swapOutToken(
        address _initiator, // initiator address
        address _token, // src token
        bytes memory _to,
        uint256 _amount,
        uint256 _toChain, // target chain id
        bytes calldata _bridgeData
    ) external payable override nonReentrant whenNotPaused returns (bytes32) {
        if (_amount == 0) revert zero_amount();

        address sender = msg.sender;
        MessageInEvent memory inEvent;

        inEvent.messageType = uint8(MessageType.BRIDGE);
        inEvent.fromChain = selfChainId;
        inEvent.toChain = _toChain;
        // set to check whether the chain has mos
        inEvent.mos = Helper._fromBytes(mosContracts[_toChain]);

        inEvent.to = _to;
        inEvent.amount = _amount;
        inEvent.token = _tokenTransferIn(_token, sender, inEvent.amount, true, false);

        BridgeParam memory msgData;
        if (_bridgeData.length != 0) {
            msgData = abi.decode(_bridgeData, (BridgeParam));
        }
        inEvent.gasLimit = msgData.gasLimit;
        // _checkBridgeable(inEvent.token, inEvent.toChain);
        // todo: add transfer limit check
        // _checkLimit(_amount, _toChain, _token);

        // emit MessageOut
        // messageType,fromChain,toChain,gasLimit,token,amount,to
        inEvent.orderId = _messageOut(false, false, _initiator, sender, inEvent);

        inEvent.swapData = msgData.swapData;
        inEvent.from = Helper._toBytes(sender);

        address caller = (trustList[sender] == 0x01) ? _initiator : sender;
        bytes memory initiator = Helper._toBytes(caller);

        inEvent.amount = _collectFromFee(initiator, inEvent);
        if (inEvent.amount == 0) {
            revert in_amount_low();
        }

        _swapRelay(true, msgData.relay, initiator, inEvent, bytes(""));

        return inEvent.orderId;
    }

    function messageIn(
        uint256 _chainId,
        uint256 _logParam,
        bytes32 _orderId,
        bytes memory _receiptProof
    ) external nonReentrant whenNotPaused {
        _checkOrder(_orderId);

        uint256 logIndex = _logParam & 0xFFFF;
        bool revertError = ((_logParam >> 16) & 0xFF != 0x0);
        if (chainTypes[_chainId] == ChainType.EVM) {
            (bool success, string memory message, ILightVerifier.txLog memory log) = lightClientManager.verifyProofData(
                _chainId,
                logIndex,
                _receiptProof
            );
            require(success, message);
            if (log.addr != Helper._fromBytes(mosContracts[_chainId])) revert invalid_mos_contract();
            if (EvmDecoder.MESSAGE_OUT_TOPIC != log.topics[0]) revert invalid_bridge_log();
            (bool result, MessageOutEvent memory outEvent) = EvmDecoder.decodeMessageOut(log);
            if (!result) revert invalid_pack_version();
            _messageIn(revertError, _orderId, _chainId, outEvent);
        } else {
            (bool success, string memory message, bytes memory logArray) = lightClientManager.verifyProofData(
                _chainId,
                _receiptProof
            );
            require(success, message);
            if (chainTypes[_chainId] == ChainType.NEAR) {
                (bytes memory executorId, bytes32 topic, bytes memory log) = NearDecoder.getTopic(logArray, logIndex);
                if (!Helper._checkBytes(executorId, mosContracts[_chainId])) revert invalid_mos_contract();
                if (topic != NearDecoder.NEAR_SWAPOUT) revert invalid_bridge_log();
                MessageOutEvent memory outEvent = NearDecoder.decodeNearSwapLog(log);
                _messageIn(revertError, _orderId, _chainId, outEvent);
            } else {
                (bytes memory addr, bytes memory topic, bytes memory log) = NonEvmDecoder.getTopic(logArray);
                if (!Helper._checkBytes(addr, mosContracts[_chainId])) revert invalid_mos_contract();
                if (!Helper._checkBytes(topic, _getChainTopic(chainTypes[_chainId]))) revert invalid_bridge_log();
                MessageOutEvent memory outEvent = NonEvmDecoder.decodeMessageOut(log);
                _messageIn(revertError, _orderId, _chainId, outEvent);
            }
        }
    }

    function retryMessageIn(
        uint256 _chainAndGas,
        bytes32 _orderId,
        address _token,
        uint256 _amount,
        bytes calldata _fromAddress,
        bytes calldata _payload,
        bytes calldata _retryMessage
    ) external override nonReentrant whenNotPaused {
        (bytes memory initiator, MessageInEvent memory outEvent) = _getStoredMessage(
            _chainAndGas,
            _orderId,
            _token,
            _amount,
            _fromAddress,
            _payload
        );

        if (outEvent.messageType == uint8(MessageType.MESSAGE)) {
            return _transferRelay(true, true, initiator, outEvent, _retryMessage);
        }

        _swapRelay(true, true, initiator, outEvent, _retryMessage);
    }

    function relayExecute(
        address _token,
        uint256 _amount,
        address _caller,
        MessageInEvent calldata _outEvent,
        bytes calldata _retryMessage
    ) external returns (address tokenOut, uint256 amountOut, bytes memory target, bytes memory newMessage) {
        require(msg.sender == address(this));
        address to = Helper._fromBytes(_outEvent.to);
        if (_amount > 0) _tokenTransferOut(_token, to, _amount, false);
        (tokenOut, amountOut, target, newMessage) = IRelayExecutor(to).relayExecute(
            _outEvent.fromChain,
            _outEvent.toChain,
            _outEvent.orderId,
            _token,
            _amount,
            _caller,
            _outEvent.from,
            _outEvent.swapData,
            _retryMessage
        );
        if (amountOut > 0) _tokenTransferIn(tokenOut, to, amountOut, false, false);
    }

    // --------------------------------------------- internal ----------------------------------------------
    function _messageIn(
        bool _revertError,
        bytes32 _orderId,
        uint256 _chainId,
        MessageOutEvent memory _outEvent
    ) internal {
        if (_orderId != _outEvent.orderId) revert invalid_order_Id();
        if (Helper._fromBytes(_outEvent.mos) != address(this)) revert invalid_mos_contract();
        if (_chainId != _outEvent.fromChain) revert invalid_chain_id();

        MessageInEvent memory inEvent = _swapInToken(_outEvent);
        if (inEvent.messageType == uint8(MessageType.MESSAGE)) {
            return _transferRelay(_revertError, _outEvent.relay, _outEvent.initiator, inEvent, bytes(""));
        } else if (inEvent.messageType == uint8(MessageType.DEPOSIT)) {
            return
                _deposit(
                    inEvent.token,
                    inEvent.from,
                    Helper._fromBytes(inEvent.to),
                    inEvent.amount,
                    inEvent.orderId,
                    inEvent.fromChain
                );
        }

        inEvent.amount = _collectFromFee(_outEvent.initiator, inEvent);
        if (inEvent.amount == 0) {
            if (_revertError) {
                revert insufficient_token();
            }
            return _emitMessageIn(_outEvent.initiator, inEvent, false, 0, "InsufficientToken");
        }

        _swapRelay(_revertError, _outEvent.relay, _outEvent.initiator, inEvent, bytes(""));
    }

    // process message on relay chain
    function _transferRelay(
        bool _revertError,
        bool _relay,
        bytes memory _initiator,
        MessageInEvent memory _inEvent,
        bytes memory _retryMessage
    ) internal {
        if (_inEvent.toChain == selfChainId) {
            return _transferIn(_inEvent, true, _revertError);
        }

        if (_relay) {
            bool result;
            (result, , , , _inEvent.swapData) = _relayExecute(_revertError, _initiator, _inEvent, _retryMessage);
            if (!result) {
                return;
            }
        }

        _emitMessageRelay(_inEvent, Helper._toBytes(ZERO_ADDRESS), 0);
    }

    // swap process on relay chain
    // a. check and relay execute
    // b. collect to chain fee
    // c. swapIn or swapRelay
    function _swapRelay(
        bool _revertError,
        bool _relay,
        bytes memory _initiator,
        MessageInEvent memory _inEvent,
        bytes memory _retryMessage
    ) internal {
        if (_relay && _inEvent.swapData.length != 0) {
            bool result;
            (result, _inEvent.token, _inEvent.amount, _inEvent.to, _inEvent.swapData) = _relayExecute(
                _revertError,
                _initiator,
                _inEvent,
                _retryMessage
            );
            if (!result) {
                return;
            }
        }
        //if bridge from relay chain _checkBridgeable
        if(_inEvent.fromChain == selfChainId) _checkBridgeable(_inEvent.token, _inEvent.toChain);
        // collect to chain fee
        _inEvent.amount = _collectTochainFee(_initiator, _inEvent);
        if (_inEvent.amount == 0) {
            if (_revertError) {
                revert insufficient_token();
            } else {
                return _emitMessageIn(_initiator, _inEvent, false, 0, "InsufficientToken");
            }
        }

        if (_inEvent.toChain == selfChainId) {
            return _swapIn(_inEvent);
        }
        bytes memory toToken = tokenRegister.getToChainToken(_inEvent.token, _inEvent.toChain);
        if (Helper._checkBytes(toToken, bytes(""))) revert out_token_not_registered();

        uint256 toAmount = tokenRegister.getToChainAmount(_inEvent.token, _inEvent.amount, _inEvent.toChain);

        _checkAndBurn(_inEvent.token, _inEvent.amount);

        // messageType,orderId,fromChain,toChain,gasLimit,to,from,swapData
        _emitMessageRelay(_inEvent, toToken, toAmount);
    }

    // MessageOutEvent to MessageInEvent with relay chain token and amount
    function _swapInToken(MessageOutEvent memory _outEvent) internal returns (MessageInEvent memory inEvent) {
        if (_outEvent.messageType != uint8(MessageType.MESSAGE)) {
            inEvent.token = tokenRegister.getRelayChainToken(_outEvent.fromChain, _outEvent.token);
            if (inEvent.token == ZERO_ADDRESS) revert token_not_registered();
            inEvent.amount = tokenRegister.getRelayChainAmount(inEvent.token, _outEvent.fromChain, _outEvent.amount);

            _checkAndMint(inEvent.token, inEvent.amount);
        }

        inEvent.messageType = _outEvent.messageType;
        inEvent.fromChain = _outEvent.fromChain;
        inEvent.toChain = _outEvent.toChain;
        inEvent.orderId = _outEvent.orderId;
        inEvent.mos = Helper._fromBytes(_outEvent.mos);
        inEvent.from = _outEvent.from;
        inEvent.to = _outEvent.to;
        inEvent.gasLimit = _outEvent.gasLimit;
        inEvent.swapData = _outEvent.swapData;
    }

    // emit MessageRelay and NotifyClient
    // messageType,orderId,fromChain,toChain,gasLimit,to,from,swapData
    function _emitMessageRelay(MessageInEvent memory _inEvent, bytes memory token, uint256 amount) internal {
        uint256 chainAndGasLimit = _getChainAndGasLimit(
            uint64(_inEvent.fromChain),
            uint64(_inEvent.toChain),
            uint64(_inEvent.gasLimit)
        );

        if (Helper._checkBytes(mosContracts[_inEvent.toChain], bytes(""))) revert invalid_mos_contract();

        bytes memory messageData;
        if (chainTypes[_inEvent.toChain] == ChainType.NULL) {
            revert invalid_chain();
        } else if (chainTypes[_inEvent.toChain] == ChainType.EVM) {
            uint256 header = EvmDecoder.encodeMessageHeader(false, _inEvent.messageType);
            // abi.encode((version | messageType), mos, token, amount, to, bytes(from), bytes(message))
            messageData = abi.encode(
                header,
                Helper._fromBytes(mosContracts[_inEvent.toChain]),
                Helper._fromBytes(token),
                amount,
                Helper._fromBytes(_inEvent.to),
                _inEvent.from,
                _inEvent.swapData
            );
        } else {
            messageData = _pack(
                _inEvent.messageType,
                token,
                mosContracts[_inEvent.toChain],
                _inEvent.from,
                _inEvent.to,
                _inEvent.swapData,
                amount
            );
        }

        emit MessageRelay(_inEvent.orderId, chainAndGasLimit, messageData);

        _notifyLightClient(_inEvent.toChain);
    }

    function _getChainTopic(ChainType _chainType) internal pure returns (bytes memory topic) {
        if (_chainType == ChainType.TON) {
            topic = NonEvmDecoder.TON_TOPIC;
        } else if (_chainType == ChainType.SOLANA) {
            topic = NonEvmDecoder.SOLANA_TOPIC;
        } else {
            topic = NonEvmDecoder.DEFAULT_NO_EVM_TOPIC;
        }
    }

    function _relayExecute(
        bool _revert,
        bytes memory _initiator,
        MessageInEvent memory _inEvent,
        bytes memory _retryMessage
    )
        internal
        returns (bool result, address tokenOut, uint256 amountOut, bytes memory target, bytes memory newMessage)
    {
        if (_revert) {
            (tokenOut, amountOut, target, newMessage) = this.relayExecute(
                _inEvent.token,
                _inEvent.amount,
                msg.sender,
                _inEvent,
                _retryMessage
            );
            return (true, tokenOut, amountOut, target, newMessage);
        }
        uint256 gasLeft = gasleft();
        try this.relayExecute(_inEvent.token, _inEvent.amount, msg.sender, _inEvent, _retryMessage) returns (
            address execTokenOut,
            uint256 execAmountOut,
            bytes memory execTarget,
            bytes memory execMessage
        ) {
            tokenOut = execTokenOut;
            amountOut = execAmountOut;
            target = execTarget;
            newMessage = execMessage;
        } catch Error(string memory reason) {
            _emitMessageIn(_initiator, _inEvent, false, gasLeft, bytes(reason));
            return (false, tokenOut, amountOut, target, newMessage);
        } catch (bytes memory reason) {
            _emitMessageIn(_initiator, _inEvent, false, gasLeft, reason);
            return (false, tokenOut, amountOut, target, newMessage);
        }
        return (true, tokenOut, amountOut, target, newMessage);
    }

    function _pack(
        uint8 messageType,
        bytes memory token,
        bytes memory mos,
        bytes memory from,
        bytes memory to,
        bytes memory swapData,
        uint256 amount
    ) internal pure returns (bytes memory packed) {
        uint256 word = _getWord(
            uint256(messageType),
            token.length,
            mos.length,
            from.length,
            to.length,
            swapData.length,
            amount
        );
        packed = abi.encodePacked(word, token, mos, from, to, swapData);
    }

    //   version (1 bytes)
    //   messageType (1 bytes)
    //   token len (1 bytes)
    //   mos len (1 bytes)
    //   from len (1 bytes)
    //   to len (1 bytes)
    //   payload len (2 bytes)
    //   reserved (8 bytes)
    //   token amount (16 bytes)
    function _getWord(
        uint256 messageType,
        uint256 tokenLen,
        uint256 mosLen,
        uint256 fromLen,
        uint256 toLen,
        uint256 payloadLen,
        uint256 amount
    ) internal pure returns (uint256) {
        require(payloadLen <= type(uint16).max);
        require(amount <= type(uint128).max);
        require(toLen <= type(uint8).max);
        return ((PACK_VERSION << 248) |
            (messageType << 240) |
            (tokenLen << 232) |
            (mosLen << 224) |
            (fromLen << 216) |
            (toLen << 208) |
            (payloadLen << 192) |
            amount);
    }

    function _getFee(uint256 _id, uint256 _amount) internal view returns (uint256, address) {
        Rate memory rate = distributeRate[_id];
        return (((_amount * rate.rate) / MAX_BASE_POINT), rate.receiver);
    }

    function _deposit(
        address _token,
        bytes memory _from,
        address _to,
        uint256 _amount,
        bytes32 _orderId,
        uint256 _fromChain
    ) internal {
        if(IDepositWhitelist(depositWhitelsit).checkTokenAmountAndWhitelist(_token, _to, _amount)){
            address vaultToken = tokenRegister.getVaultToken(_token);
            if (vaultToken == ZERO_ADDRESS) revert vault_token_not_registered();
            IVaultTokenV3(vaultToken).deposit(_fromChain, _amount, _to);
            emit DepositIn(_fromChain, _token, _orderId, _from, _to, _amount);
        } else {
            //if deposit from relay chain revert
            require(_orderId != bytes32(""));
            _tokenTransferOut(_token, _to, _amount, true);
        }

        uint256 chainAndGasLimit = _getChainAndGasLimit(_fromChain, selfChainId, 0);
        if (_orderId != bytes32("")) {
            emit MessageIn(_orderId, chainAndGasLimit, _token, _amount, _to, _from, bytes(""), true, bytes(""));
        }
    }

    function _collectFromFee(bytes memory _caller, MessageInEvent memory _event) internal returns (uint256 outAmount) {
        uint256 proportionFee = tokenRegister.getTransferInFee(_caller, _event.token, _event.amount, _event.fromChain);
        // if (proportionFee == 0) {
        //     return _event.amount;
        // }
        if (_event.amount > proportionFee) {
            outAmount = _event.amount - proportionFee;
        } else {
            proportionFee = _event.amount;
            outAmount = 0;
        }
        uint256 fromAmount = (_event.fromChain == selfChainId) ? 0 : _event.amount;
        _collectBridgeFee(_event, 0, proportionFee, fromAmount, 0, true);
    }

    // _toChainOnly: only collect toChain fee then when setting `true`,
    //               as swapping on relay chain, fromChain token and toChain token are different
    function _collectTochainFee(
        bytes memory _caller,
        MessageInEvent memory _event
    ) internal returns (uint256 outAmount) {
        uint256 proportionFee;
        uint256 baseFee;
        (, baseFee, proportionFee) = tokenRegister.getTransferOutFee(
            _caller,
            _event.token,
            _event.amount,
            _event.fromChain,
            _event.toChain,
            _event.swapData.length != 0
        );
        if (_event.amount > baseFee + proportionFee) {
            outAmount = _event.amount - baseFee - proportionFee;
        } else if (_event.amount >= baseFee) {
            proportionFee = _event.amount - baseFee;
        } else {
            baseFee = _event.amount;
            proportionFee = 0;
        }
        uint256 fromAmount = (_event.fromChain == selfChainId) ? _event.amount : 0;
        _collectBridgeFee(_event, baseFee, proportionFee, fromAmount, outAmount, false);
    }

    function _collectBridgeFee(
        MessageInEvent memory _event,
        uint256 _baseFee,
        uint256 _proportionFee,
        uint256 _fromAmount,
        uint256 _outAmount,
        bool _fromChainOnly
    ) internal {
        uint256 messageFee;
        uint256 protocolFee;
        uint256 vaultFee;

        if (_proportionFee > 0) {
            address receiver;
            // messenger fee (bridge fee)
            (messageFee, receiver) = _getFee(1, _proportionFee);
            if (messageFee != 0 && receiver != ZERO_ADDRESS) {
                feeList[receiver][_event.token] += messageFee;
            }
            // protocol fee
            (protocolFee, receiver) = _getFee(2, _proportionFee);
            if (protocolFee != 0 && receiver != ZERO_ADDRESS) {
                feeList[receiver][_event.token] += protocolFee;
            }
            vaultFee = _proportionFee - messageFee - protocolFee;
        }
        if (_baseFee > 0) {
            address baseFeeReceiver = tokenRegister.getBaseFeeReceiver();
            feeList[baseFeeReceiver][_event.token] += _baseFee;
        }

        uint256 isFromChain = _fromChainOnly ? 1 : 0;
        if (_baseFee + _proportionFee > 0) {
            emit CollectFee(
                _event.orderId,
                _event.token,
                isFromChain,
                _baseFee,
                _proportionFee,
                messageFee,
                vaultFee,
                protocolFee
            );
        }

        address vaultToken = tokenRegister.getVaultToken(_event.token);
        if (vaultToken == ZERO_ADDRESS) revert vault_token_not_registered();

        IVaultTokenV3(vaultToken).updateVault(
            _event.fromChain,
            _fromAmount,
            _event.toChain,
            _outAmount,
            selfChainId,
            vaultFee
        );
    }

    function _notifyLightClient(uint256 _chainId) internal override {
        lightClientManager.notifyLightClient(_chainId, address(this), bytes(""));
    }
}
