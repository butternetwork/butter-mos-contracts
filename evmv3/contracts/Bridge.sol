// SPDX-License-Identifier: MIT

pragma solidity 0.8.25;

import "./abstract/BridgeAbstract.sol";
import {ILightVerifier} from "@mapprotocol/protocol/contracts/interface/ILightVerifier.sol";
contract Bridge is BridgeAbstract {
    uint256 constant DEPOSIT_GAS = 200000;

    uint256 private relaySlot;

    ILightVerifier public lightNode;

    error invalid_relay_chain();
    error invalid_relay_contract();
    error invalid_to_chain();

    event SetRelay(uint256 _chainId, address _relay);

    // --------------------------------------------- manage ----------------------------------------------
    function setServiceContract(uint256 _t, address _addr) external restricted() {
        _checkAddress(_addr);
        if (_t == 0) {
            wToken = _addr;
        } else if (_t == 1) {
            lightNode = ILightVerifier(_addr);
        } else if (_t == 2) {
            feeService = IFeeService(_addr);
        } else if (_t == 5) {
            swapLimit = ISwapOutLimit(_addr);
        }

        emit SetContract(_t, _addr);
    }

    function setRelay(uint256 _chainId, address _relay) external restricted() {
        _checkAddress(_relay);

        relaySlot = (uint256(uint160(_relay)) << 96) | _chainId;

        emit SetRelay(_chainId, _relay);
    }

    // --------------------------------------------- external view -------------------------------------------
    function getServiceContract(uint256 _type) external view returns (address) {
        if (_type == 0) {
            return wToken;
        } else if (_type == 1) {
            return address(lightNode);
        } else if (_type == 2) {
            return address(feeService);
        } else if (_type == 5) {
            return address(swapLimit);
        }
        return ZERO_ADDRESS;
    }

    function getRelay() external view returns (uint256, address) {
        return _getRelay();
    }

    function getOrderStatus(
        uint256,
        uint256 _blockNum,
        bytes32 _orderId
    ) external view virtual override returns (bool exists, bool verifiable, uint256 nodeType) {
        exists = (orderList[_orderId] == 0x01);
        verifiable = lightNode.isVerifiable(_blockNum, bytes32(""));
        nodeType = lightNode.nodeType();
    }

    // --------------------------------------------- external ----------------------------------------------
    function transferOut(
        uint256 _toChain,
        bytes calldata _messageData,
        address _feeToken
    ) external payable override whenNotPaused returns (bytes32 orderId) {
        address sender = msg.sender;
        MessageInEvent memory inEvent;

        inEvent.messageType = uint8(MessageType.MESSAGE);
        inEvent.fromChain = selfChainId;
        inEvent.toChain = _toChain;
        (, inEvent.mos) = _getRelay();

        MessageData memory msgData = _transferOut(inEvent.fromChain, inEvent.toChain, _messageData, _feeToken);
        inEvent.to = msgData.target;
        inEvent.gasLimit = msgData.gasLimit;
        inEvent.swapData = msgData.payload;

        orderId = _messageOut(msgData.relay, sender, sender, inEvent);

        // todo: emit extra info
        //emit MessageTransfer(msg.sender, ZERO_ADDRESS, msg.sender, orderId, bytes32(0), _feeToken, 0);

        return orderId;
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

        address sender = msg.sender;
        MessageInEvent memory inEvent;

        inEvent.messageType = uint8(MessageType.BRIDGE);
        inEvent.fromChain = selfChainId;
        inEvent.toChain = _toChain;
        inEvent.to = _to;
        (, inEvent.mos) = _getRelay();
        inEvent.amount = _amount;
        inEvent.token = _tokenTransferIn(_token, sender, inEvent.amount, true, true);

        BridgeParam memory msgData;
        if (_bridgeData.length != 0) {
            msgData = abi.decode(_bridgeData, (BridgeParam));
        }
        inEvent.gasLimit = msgData.gasLimit;
        inEvent.swapData = msgData.swapData;

        orderId = _messageOut(msgData.relay, _initiator, sender,inEvent);
    }

    function depositToken(
        address _token,
        address _to,
        uint256 _amount
    ) external payable override nonReentrant whenNotPaused returns (bytes32 orderId) {
        if (_amount == 0) revert zero_amount();

        address sender = msg.sender;
        MessageInEvent memory inEvent;

        inEvent.messageType = uint8(MessageType.DEPOSIT);
        inEvent.fromChain = selfChainId;
        (inEvent.toChain, inEvent.mos) = _getRelay();
        inEvent.to = Helper._toBytes(_to);
        inEvent.amount = _amount;
        inEvent.token = _tokenTransferIn(_token, sender, inEvent.amount, true, true);

        inEvent.gasLimit = DEPOSIT_GAS;

        orderId = _messageOut(false, sender, sender,inEvent);
    }

    function messageIn(
        uint256 _chainId,
        uint256 _logIndex,
        bytes32 _orderId,
        bytes calldata _receiptProof
    ) external nonReentrant whenNotPaused {
        _checkOrder(_orderId);
        (uint256 relayChainId, address mosRelay) = _getRelay();
        if (relayChainId != _chainId) revert invalid_relay_chain();
        (bool success, string memory message, ILightVerifier.txLog memory log) = lightNode.verifyProofDataWithCache(
            false,
            _logIndex,
            _receiptProof
        );
        require(success, message);

        if (mosRelay != log.addr) revert invalid_relay_contract();
        if (EvmDecoder.MESSAGE_RELAY_TOPIC != log.topics[0]) revert invalid_bridge_log();

        (bool result, MessageInEvent memory outEvent) = EvmDecoder.decodeMessageRelay(log);
        if (!result) revert invalid_pack_version();

        if (outEvent.mos != address(this)) revert invalid_mos_contract();
        if (selfChainId != outEvent.toChain) revert invalid_to_chain();
        if (_orderId != outEvent.orderId) revert invalid_order_Id();

        if (MessageType(outEvent.messageType) == MessageType.MESSAGE) {
            _messageIn(outEvent, false);
        } else {
            // token bridge
            _checkAndMint(outEvent.token, outEvent.amount);
            _swapIn(outEvent);
        }
    }

    function retryMessageIn(
        uint256 _fromChain,
        bytes32 _orderId,
        address _token,
        uint256 _amount,
        bytes calldata _fromAddress,
        bytes calldata _payload,
        bytes calldata
    ) external override nonReentrant whenNotPaused {
        MessageInEvent memory outEvent = _getStoredMessage(
            _fromChain,
            _orderId,
            _token,
            _amount,
            _fromAddress,
            _payload
        );

        _messageIn(outEvent, true);
    }

    // --------------------------------------------- internal ----------------------------------------------

    function _notifyLightClient(uint256) internal override {
        lightNode.notifyLightClient(address(this), bytes(""));
    }

    function _getRelay() internal view returns (uint256 relayChainId, address relayContract) {
        uint256 relay = relaySlot;

        relayChainId = relay & 0xFFFFFFFFFFFFFFFF;
        relayContract = address(uint160(relay >> 96));
    }
}
