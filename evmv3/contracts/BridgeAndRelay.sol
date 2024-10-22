// SPDX-License-Identifier: MIT

pragma solidity 0.8.25;

import "./interface/IVaultTokenV3.sol";
import "./abstract/BridgeAbstract.sol";
import "./interface/IMintableToken.sol";
import "./interface/ITokenRegisterV3.sol";
import "./lib/EvmDecoder.sol";
import "./lib/NearDecoder.sol";
import "./interface/IRelayExecutor.sol";
import {MessageOutEvent} from "./lib/Types.sol";
import "@mapprotocol/protocol/contracts/interface/ILightVerifier.sol";
import "@mapprotocol/protocol/contracts/interface/ILightClientManager.sol";

contract BridgeAndRelay is BridgeAbstract {
    struct Rate {
        uint64 rate;
        address receiver;
    }

    enum ChainType {
        NULL,
        EVM,
        NEAR,
        TON,
        SOLANA
    }

    uint256 constant MAX_BASE_POINT = 10000;
    uint256 constant PACK_VERSION = 0x10;

    ITokenRegisterV3 public tokenRegister;
    ILightClientManager public lightClientManager;

    mapping(uint256 => bytes) public mosContracts;
    mapping(uint256 => ChainType) public chainTypes;
    //id : 0 VToken  1:relayer
    mapping(uint256 => Rate) public distributeRate;

    error invalid_chain_id();
    error unknown_log();
    error chain_type_error();
    error invalid_rate_id();
    error vault_token_not_registered();
    error invalid_vault_token();
    error invalid_rate_value();
    error out_token_not_registered();

    event SetLightClientManager(address lightClient);
    // event SetTokenRegister(address tokenRegister);
    event RegisterChain(uint256 chainId, bytes bridge, ChainType chainType);
    event SetDistributeRate(uint256 id, address to, uint256 rate);
    event CollectFee(
        bytes32 indexed orderId,
        address indexed token,
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

    function setServiceContract(uint256 _t, address _addr) external onlyRole(MANAGER_ROLE) {
        _checkAddress(_addr);
        if (_t == 0) {
            wToken = _addr;
        } else if (_t == 1) {
            lightClientManager = ILightClientManager(_addr);
        } else if (_t == 2) {
            feeService = IFeeService(_addr);
        } else if (_t == 3) {
            butterRouter = _addr;
        } else if (_t == 4) {
            tokenRegister = ITokenRegisterV3(_addr);
        } else {
            swapLimit = ISwapOutLimit(_addr);
        }
        emit SetContract(_t, _addr);
    }

    function registerChain(
        uint256[] calldata _chainIds,
        bytes[] calldata _addresses,
        ChainType _type
    ) external onlyRole(MANAGER_ROLE) {
        uint256 len = _chainIds.length;
        if (len != _addresses.length) revert length_mismatching();
        for (uint256 i = 0; i < len; i++) {
            mosContracts[_chainIds[i]] = _addresses[i];
            chainTypes[_chainIds[i]] = _type;
            emit RegisterChain(_chainIds[i], _addresses[i], _type);
        }
    }

    function setDistributeRate(uint256 _id, address _to, uint256 _rate) external onlyRole(MANAGER_ROLE) {
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
        } else if (_type == 3) {
            return butterRouter;
        } else if (_type == 4) {
            return address(tokenRegister);
        } else {
            return address(swapLimit);
        }
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

    function getBridgeTokenInfo(
        uint256 _fromChain,
        uint256 _toChain,
        bytes memory _fromToken
    ) external view returns (bytes memory toChainToken, uint8 decimals, bool mintable) {
        return tokenRegister.getTargetToken(_fromChain, _toChain, _fromToken);
    }

    function getBridgeFeeInfo(
        bytes memory _caller,
        bytes memory _fromToken,
        uint256 _fromChain,
        uint256 _fromAmount,
        uint256 _toChain,
        bool _withSwap
    ) external view returns (uint256 fromChainFee, uint256 toChainAmount, uint256 vaultBalance) {
        return tokenRegister.getBridgeFeeInfoV3(_caller, _fromToken, _fromChain, _fromAmount, _toChain, _withSwap);
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
        _tokenTransferOut(token, msg.sender, amount, true, false);
        emit Withdraw(token, msg.sender, _vaultAmount, amount);
    }

    function transferOut(
        uint256 _toChain,
        bytes memory _messageData,
        address _feeToken
    ) external payable override returns (bytes32 orderId) {
        uint256 fromChain = selfChainId;
        MessageData memory msgData = _transferOut(fromChain, _toChain, _messageData, _feeToken);

        orderId = _messageOut(
            msgData.relay,
            MessageType.MESSAGE,
            msgData.gasLimit,
            msg.sender,
            ZERO_ADDRESS,
            0,
            ZERO_ADDRESS,
            _toChain,
            msgData.target,
            msgData.payload
        );

        _emitMessageRelay(
            uint8(MessageType.MESSAGE),
            orderId,
            fromChain,
            _toChain,
            _toBytes(ZERO_ADDRESS),
            0,
            msgData.target,
            _toBytes(msg.sender),
            msgData.payload
        );

        return orderId;
    }

    function depositToken(
        address _token,
        address _to,
        uint256 _amount
    ) external payable override nonReentrant whenNotPaused returns (bytes32 orderId) {
        address from = msg.sender;
        address token = _tokenTransferIn(_token, from, _amount, true, false);
        _deposit(token, _toBytes(from), _to, _amount, orderId, selfChainId);
    }

    function swapOutToken(
        address _initiator, // initiator address
        address _token, // src token
        bytes memory _to,
        uint256 _amount,
        uint256 _toChain, // target chain id
        bytes calldata _bridgeData
    ) external payable override nonReentrant whenNotPaused returns (bytes32 orderId) {
        if (_amount == 0) revert zero_amount();
        address from = msg.sender;
        address bridgeToken = _tokenTransferIn(_token, from, _amount, true, false);

        BridgeParam memory msgData = abi.decode(_bridgeData, (BridgeParam));

        bytes memory toToken = tokenRegister.getToChainToken(bridgeToken, _toChain);
        if (_checkBytes(toToken, bytes(""))) revert out_token_not_registered();

        orderId = _messageOut(
            false,
            MessageType.BRIDGE,
            msgData.gasLimit,
            _initiator,
            bridgeToken,
            _amount,
            ZERO_ADDRESS,
            _toChain,
            _to,
            msgData.swapData
        );

        (uint256 relayOutAmount, uint256 outAmount) = _collectFee(
            _toBytes(from),
            orderId,
            bridgeToken,
            _amount,
            selfChainId,
            _toChain,
            msgData.swapData.length != 0
        );

        _checkAndBurn(bridgeToken, relayOutAmount);

        _emitMessageRelay(
            uint8(MessageType.BRIDGE),
            orderId,
            selfChainId,
            _toChain,
            toToken,
            outAmount,
            _to,
            _toBytes(from),
            msgData.swapData
        );
    }

    function messageIn(
        uint256 _chainId,
        uint256 _logIndex,
        bytes32 _orderId,
        bytes memory _receiptProof
    ) external nonReentrant whenNotPaused {
        _checkOrder(_orderId);

        if (chainTypes[_chainId] == ChainType.EVM) {
            (bool success, string memory message, ILightVerifier.txLog memory log) = lightClientManager.verifyProofData(
                _chainId,
                _logIndex,
                _receiptProof
            );
            require(success, message);
            if (log.addr != _fromBytes(mosContracts[_chainId])) revert invalid_mos_contract();
            if (EvmDecoder.MESSAGE_OUT_TOPIC != log.topics[0]) revert invalid_bridge_log();
            (bool result, MessageOutEvent memory outEvent) = EvmDecoder.decodeMessageOut(log);
            if (!result) revert invalid_pack_version();
            _messageIn(_orderId, _chainId, outEvent);
        } else {
            (bool success, string memory message, bytes memory logArray) = lightClientManager.verifyProofData(
                _chainId,
                _receiptProof
            );
            require(success, message);
            if (chainTypes[_chainId] == ChainType.NEAR) {
                (bytes memory executorId, bytes32 topic, bytes memory log) = NearDecoder.getTopic(logArray, _logIndex);
                if (!_checkBytes(executorId, mosContracts[_chainId])) revert invalid_mos_contract();
                if (topic != NearDecoder.NEAR_SWAPOUT) revert invalid_bridge_log();
                MessageOutEvent memory outEvent = NearDecoder.decodeNearSwapLog(log);
                _messageIn(_orderId, _chainId, outEvent);
            } else {
                revert chain_type_error();
            }
        }
    }

    function retryMessageIn(
        uint256 _fromChain,
        bytes32 _orderId,
        address _token,
        uint256 _amount,
        bytes calldata _fromAddress,
        bytes calldata _payload
    ) external override nonReentrant whenNotPaused {
        MessageInEvent memory outEvent = _getStoredMessage(
            _fromChain,
            _orderId,
            _token,
            _amount,
            _fromAddress,
            _payload
        );

        if (outEvent.toChain == selfChainId) {
            _messageIn(outEvent, true);
        } else {
            _messageRelay(true, outEvent);
        }
    }

    function relayExecute(
        address _token,
        uint256 _amount,
        MessageInEvent calldata _outEvent
    ) external returns (address tokenOut, uint256 amountOut, bytes memory target, bytes memory newMessage) {
        require(msg.sender == address(this));
        (address to, bytes memory relayData) = abi.decode(_outEvent.swapData, (address, bytes));
        _tokenTransferOut(_token, to, _amount, false, false);
        (tokenOut, amountOut, target, newMessage) = IRelayExecutor(to).relayExecute(
            _outEvent.fromChain,
            _outEvent.toChain,
            _outEvent.orderId,
            _token,
            _amount,
            _outEvent.from,
            relayData
        );
        _tokenTransferIn(tokenOut, to, amountOut, false, false);
    }

    // --------------------------------------------- internal ----------------------------------------------
    function _messageIn(bytes32 _orderId, uint256 _chainId, MessageOutEvent memory _outEvent) internal {
        if (_orderId != _outEvent.orderId) revert invalid_order_Id();
        if (_fromBytes(_outEvent.mos) != address(this)) revert invalid_mos_contract();
        if (_chainId != _outEvent.fromChain) revert invalid_chain_id();

        address token;
        uint256 outAmount;
        if (_outEvent.messageType != uint8(MessageType.MESSAGE)) {
            (token, outAmount) = _swapInToken(_outEvent);
            if (_outEvent.messageType != uint8(MessageType.DEPOSIT)) {
                (, outAmount) = _collectFee(
                    _outEvent.from,
                    _outEvent.orderId,
                    token,
                    outAmount,
                    _outEvent.fromChain,
                    _outEvent.toChain,
                    _outEvent.swapData.length != 0
                );
            }
        }

        MessageInEvent memory _inEvent = MessageInEvent({
            messageType: _outEvent.messageType,
            fromChain: _outEvent.fromChain,
            toChain: _outEvent.toChain,
            orderId: _outEvent.orderId,
            mos: _fromBytes(_outEvent.mos),
            token: token,
            from: _outEvent.from,
            to: _outEvent.to,
            amount: outAmount,
            gasLimit: _outEvent.gasLimit,
            swapData: _outEvent.swapData
        });
        if (_outEvent.toChain == selfChainId) {
            if (_outEvent.messageType == uint8(MessageType.MESSAGE)) {
                _messageIn(_inEvent, true);
            } else if (_outEvent.messageType == uint8(MessageType.DEPOSIT)) {
                _deposit(
                    _inEvent.token,
                    _inEvent.from,
                    _fromBytes(_inEvent.to),
                    _inEvent.amount,
                    _inEvent.orderId,
                    _inEvent.fromChain
                );
            } else {
                _swapIn(_inEvent);
            }
        } else {
            _messageRelay(_outEvent.relay, _inEvent);
        }
    }

    function _messageRelay(bool _relay, MessageInEvent memory _inEvent) internal {
        address token = _inEvent.token;
        uint256 relayOutAmount = _inEvent.amount;
        if (_relay) {
            // todo: relay execute
            try this.relayExecute(_inEvent.token, _inEvent.amount, _inEvent) returns (
                address tokenOut,
                uint256 amountOut,
                bytes memory target,
                bytes memory newMessage
            ) {
                token = tokenOut;
                relayOutAmount = amountOut;
                _inEvent.to = target;
                _inEvent.swapData = newMessage;
            } catch (bytes memory reason) {
                _storeMessageData(_inEvent, reason);
                return;
            }
        }
        _notifyLightClient(_inEvent.toChain);
        bytes memory toChainToken;
        uint256 outAmount;
        if (_inEvent.messageType == uint8(MessageType.MESSAGE)) {
            toChainToken = _toBytes(ZERO_ADDRESS);
        } else {
            toChainToken = tokenRegister.getToChainToken(token, _inEvent.toChain);
            if (_checkBytes(toChainToken, bytes(""))) revert token_not_registered();
        }

        _checkAndBurn(token, relayOutAmount);
        outAmount = tokenRegister.getToChainAmount(token, relayOutAmount, _inEvent.toChain);
        _emitMessageRelay(
            _inEvent.messageType,
            _inEvent.orderId,
            _inEvent.fromChain,
            _inEvent.toChain,
            toChainToken,
            outAmount,
            _inEvent.to,
            _inEvent.from,
            _inEvent.swapData
        );
    }

    function _swapInToken(MessageOutEvent memory _outEvent) internal returns (address token, uint256 relayAmount) {
        token = tokenRegister.getRelayChainToken(_outEvent.fromChain, _outEvent.token);
        if (token == ZERO_ADDRESS) revert token_not_registered();
        relayAmount = tokenRegister.getRelayChainAmount(token, _outEvent.fromChain, _outEvent.amount);

        _checkAndMint(token, relayAmount);
    }

    function _emitMessageRelay(
        uint8 _type,
        bytes32 orderId,
        uint256 fromChain,
        uint256 toChain,
        bytes memory token,
        uint256 amount,
        bytes memory to,
        bytes memory from,
        bytes memory message
    ) internal {
        uint256 chainAndGasLimit = _getChainAndGasLimit(uint64(fromChain), uint64(toChain), uint64(0));
        bytes memory messageData;

        if (chainTypes[toChain] == ChainType.EVM) {
            uint256 header = EvmDecoder.encodeMessageHeader(false, _type);
            messageData = abi.encode(
                header,
                _fromBytes(mosContracts[toChain]),
                _fromBytes(token),
                amount,
                _fromBytes(to),
                from,
                message
            );
        } else {
            messageData = _pack(token, mosContracts[toChain], from, to, message, amount);
        }
        emit MessageRelay(orderId, chainAndGasLimit, messageData);
    }

    function _pack(
        bytes memory token,
        bytes memory mos,
        bytes memory from,
        bytes memory to,
        bytes memory swapData,
        uint256 amount
    ) internal pure returns (bytes memory packed) {
        uint256 word = _getWord(token.length, mos.length, from.length, to.length, swapData.length, amount);
        packed = abi.encodePacked(word, token, mos, from, to, swapData);
    }

    //   version (1 bytes)
    //   relay (1 bytes)
    //   token len (1 bytes)
    //   mos len (1 bytes)
    //   from len (1 bytes)
    //   to len (1 bytes)
    //   payload len (2 bytes)
    //   reserved (8 bytes)
    //   token amount (16 bytes)
    function _getWord(
        uint256 tokenLen,
        uint256 mosLen,
        uint256 fromLen,
        uint256 toLen,
        uint256 playloadLen,
        uint256 amount
    ) internal pure returns (uint256) {
        require(playloadLen <= type(uint16).max);
        require(amount <= type(uint128).max);
        require(toLen <= type(uint8).max);
        return ((PACK_VERSION << 248) |
            (tokenLen << 232) |
            (mosLen << 224) |
            (fromLen << 216) |
            (toLen << 208) |
            (playloadLen << 192) |
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
        address vaultToken = tokenRegister.getVaultToken(_token);
        if (vaultToken == ZERO_ADDRESS) revert vault_token_not_registered();
        IVaultTokenV3(vaultToken).deposit(_fromChain, _amount, _to);
        emit DepositIn(_fromChain, _token, _orderId, _from, _to, _amount);
    }

    function _collectFee(
        bytes memory _caller,
        bytes32 _orderId,
        address _token,
        uint256 _relayAmount,
        uint256 _fromChain,
        uint256 _toChain,
        bool _withSwap
    ) internal returns (uint256 relayOutAmount, uint256 outAmount) {
        address vaultToken = tokenRegister.getVaultToken(_token);
        if (vaultToken == ZERO_ADDRESS) revert vault_token_not_registered();

        uint256 proportionFee;
        uint256 excludeVaultFee = 0;
        uint256 totalFee;
        uint256 baseFee;

        (totalFee, baseFee, proportionFee) = tokenRegister.getTransferFeeV3(
            _caller,
            _token,
            _relayAmount,
            _fromChain,
            _toChain,
            _withSwap
        );
        if (_relayAmount >= totalFee) {
            relayOutAmount = _relayAmount - totalFee;
            outAmount = tokenRegister.getToChainAmount(_token, relayOutAmount, _toChain);
        } else if (_relayAmount >= baseFee) {
            proportionFee = _relayAmount - baseFee;
        } else {
            baseFee = _relayAmount;
            proportionFee = 0;
        }

        if (baseFee != 0) {
            address baseFeeReceiver = tokenRegister.getBaseFeeReceiver();
            feeList[baseFeeReceiver][_token] += baseFee;
            //_tokenTransferOut(_token, baseFeeReceiver, baseFee, true);
            excludeVaultFee += baseFee;
        }

        if (proportionFee > 0) {
            excludeVaultFee += _collectBridgeFee(_orderId, _token, baseFee, proportionFee);
        }

        IVaultTokenV3(vaultToken).transferToken(
            _fromChain,
            _relayAmount,
            _toChain,
            relayOutAmount,
            selfChainId,
            excludeVaultFee
        );
        return (relayOutAmount, outAmount);
    }

    function _collectBridgeFee(
        bytes32 _orderId,
        address _token,
        uint256 baseFee,
        uint256 proportionFee
    ) internal returns (uint256 excludeVaultFee) {
        uint256 messageFee;
        uint256 protocolFee;
        address receiver;

        excludeVaultFee = 0;

        // messenger fee
        (messageFee, receiver) = _getFee(1, proportionFee);
        if (messageFee != 0 && receiver != ZERO_ADDRESS) {
            feeList[receiver][_token] += messageFee;
            //_tokenTransferOut(_token, receiver, messageFee, true);

            excludeVaultFee += messageFee;
        }
        // protocol fee
        (protocolFee, receiver) = _getFee(2, proportionFee);
        if (protocolFee != 0 && receiver != ZERO_ADDRESS) {
            feeList[receiver][_token] += protocolFee;
            //_tokenTransferOut(_token, receiver, protocolFee, true);

            excludeVaultFee += protocolFee;
        }

        uint256 vaultFee = proportionFee - messageFee - protocolFee;

        emit CollectFee(_orderId, _token, baseFee, proportionFee, messageFee, vaultFee, protocolFee);
    }

    function _notifyLightClient(uint256 _chainId) internal override {
        lightClientManager.notifyLightClient(_chainId, address(this), bytes(""));
    }
}
