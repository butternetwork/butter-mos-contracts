// SPDX-License-Identifier: MIT

pragma solidity 0.8.20;

import "./abstract/BridgeAbstract.sol";
import "./interface/IMintableToken.sol";
import "./lib/EvmDecoder.sol";
import "@mapprotocol/protocol/contracts/interface/ILightVerifier.sol";
contract Bridge is BridgeAbstract {
    uint256 constant DEPOSIT_GAS = 200000;

    uint256 private relaySlot;

    ILightVerifier public lightNode;

    error invalid_relay_chain();
    error invalid_relay_contract();
    error invalid_to_chain();

    event SetLightClient(address lightNode);
    event SetRelay(uint256 _chainId, address _relay);

    // --------------------------------------------- manage ----------------------------------------------
    function setContract(uint256 _t, address _addr) external onlyRole(MANAGER_ROLE) {
        _checkAddress(_addr);
        if (_t == 0) {
            wToken = _addr;
        } else if (_t == 1) {
            lightNode = ILightVerifier(_addr);
        } else if (_t == 2) {
            feeService = IFeeService(_addr);
        } else if (_t == 3) {
            butterRouter = _addr;
        } else {
            swapLimit = ISwapOutLimit(_addr);
        }
        emit SetContract(_t, _addr);
    }

    function setRelay(uint256 _chainId, address _relay) external onlyRole(MANAGER_ROLE) {
        _checkAddress(_relay);

        relaySlot = (uint256(uint160(_relay)) << 96) | _chainId;

        emit SetRelay(_chainId, _relay);
    }

    // --------------------------------------------- external view -------------------------------------------
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
        bytes memory _messageData,
        address _feeToken
    ) external payable override whenNotPaused returns (bytes32 orderId) {
        uint256 fromChain = selfChainId;

        (, address mosRelay) = _getRelay();

        MessageData memory msgData = _transferOut(fromChain, _toChain, _messageData, _feeToken);

        orderId = _messageOut(
            msgData.relay,
            MessageType.MESSAGE,
            msgData.gasLimit,
            msg.sender,
            ZERO_ADDRESS,
            0,
            mosRelay,
            _toChain,
            msgData.target,
            msgData.payload
        );

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

        address from = msg.sender;
        address bridgeToken = _tokenTransferIn(_token, from, _amount, true);

        (, address mosRelay) = _getRelay();
        BridgeParam memory msgData = abi.decode(_bridgeData, (BridgeParam));

        orderId = _messageOut(
            msgData.relay,
            MessageType.BRIDGE,
            msgData.gasLimit,
            _initiator,
            bridgeToken,
            _amount,
            mosRelay,
            _toChain,
            _to,
            msgData.swapData
        );
    }

    function depositToken(
        address _token,
        address _to,
        uint256 _amount
    ) external payable override nonReentrant whenNotPaused returns (bytes32 orderId) {
        if (_amount == 0) revert zero_amount();

        (uint256 relayChainId, address mosRelay) = _getRelay();

        address from = msg.sender;
        address bridgeToken = _tokenTransferIn(_token, from, _amount, true);

        orderId = _messageOut(
            false,
            MessageType.DEPOSIT,
            DEPOSIT_GAS,
            from,
            bridgeToken,
            _amount,
            mosRelay,
            relayChainId,
            _toBytes(_to),
            bytes("")
        );
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
            _swapIn(outEvent);
        }
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
