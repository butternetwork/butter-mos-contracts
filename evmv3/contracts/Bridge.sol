// SPDX-License-Identifier: MIT

pragma solidity 0.8.20;

import "./abstract/BridgeAbstract.sol";
import "./interface/IMintableToken.sol";
import "./lib/EvmDecoder.sol";
import "@mapprotocol/protocol/contracts/interface/ILightVerifier.sol";

contract Bridge is BridgeAbstract {
    //uint256 public relayChainId;
    //address public relayContract;

    uint256 private relaySlot;

    ILightVerifier public lightNode;

    //mapping(address => bool) public mintableTokens;
    //mapping(uint256 => mapping(address => bool)) public tokenMappingList;

    error invalid_relay_chain();
    error invalid_relay_contract();
    error invalid_mos_contract();
    error invalid_to_chain();

    event SetLightClient(address lightNode);
    event SetRelay(uint256 _chainId, address _relay);
    event SetFeeService(address indexed feeServiceAddress);
    // event DepositOut(
    //     uint256 indexed fromChain,
    //     uint256 indexed toChain,
    //     bytes32 orderId,
    //     address token,
    //     address relay,
    //     address from,
    //     address to,
    //     uint256 amount
    // );

    function setRelay(uint256 _chainId, address _relay) external onlyRole(MANAGER_ROLE) {
        _checkAddress(_relay);

        relaySlot = uint256(uint160(_relay) << 96) | _chainId;

        emit SetRelay(_chainId, _relay);
    }

    function setLightClient(address _lightNode) external onlyRole(MANAGER_ROLE) {
        _checkAddress(_lightNode);
        lightNode = ILightVerifier(_lightNode);
        emit SetLightClient(_lightNode);
    }

    function setFeeService(address _feeServiceAddress) external onlyRole(MANAGER_ROLE)  {
        _checkAddress(_feeServiceAddress);
        feeService = IFeeService(_feeServiceAddress);
        emit SetFeeService(_feeServiceAddress);
    }

    /*
    function registerTokenChains(
        address _token,
        uint256[] memory _toChains,
        bool _enable,
        bool _mintAble
    ) external onlyRole(MANAGER_ROLE) {
        if (_isContract(_token)) revert not_contract();
        mintableTokens[_token] = _mintAble;
        for (uint256 i = 0; i < _toChains.length; i++) {
            uint256 toChain = _toChains[i];
            tokenMappingList[toChain][_token] = _enable;
            emit RegisterToken(_token, toChain, _enable, _mintAble);
        }
    }*/

    function getOrderStatus(
        uint256,
        uint256 _blockNum,
        bytes32 _orderId
    ) external view virtual override returns (bool exists, bool verifiable, uint256 nodeType) {
        exists = (orderList[_orderId] == 0x01);
        verifiable = lightNode.isVerifiable(_blockNum, bytes32(""));
        nodeType = lightNode.nodeType();
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

        BridgeParam memory msgData = abi.decode(_bridgeData, (BridgeParam));

        address from = msg.sender;
        address bridgeToken = _transferIn(_token, from, _amount, true);

        (, address mosRelay) = _getRelay();

        orderId = _messageOut(MessageType.BRIDGE, _initiator, bridgeToken, _amount, mosRelay, _toChain, _to, msgData);
    }

    function depositToken(
        address _token,
        address _to,
        uint256 _amount
    ) external payable override nonReentrant whenNotPaused returns (bytes32 orderId) {
        if (_amount == 0) revert zero_amount();

        (uint256 relayChainId, address mosRelay) = _getRelay();

        address from = msg.sender;
        address bridgeToken = _transferIn(_token, from, _amount, true);

        BridgeParam memory msgData;

        orderId = _messageOut(
            MessageType.DEPOSIT,
            from,
            bridgeToken,
            _amount,
            mosRelay,
            relayChainId,
            _toBytes(_to),
            msgData
        );
    }

    function transferOut(
        uint256 _toChain,
        bytes memory _messageData,
        address _feeToken
    ) external payable virtual whenNotPaused returns (bytes32 orderId) {
        uint256 fromChain = selfChainId;
        require(_toChain != fromChain, "MOSV3: only other chain");

        (, address mosRelay) = _getRelay();

        MessageData memory msgData = abi.decode(_messageData, (MessageData));
        require(msgData.value == 0, "MOSV3: not support msg value");

        require((msgData.msgType == MessageType.MESSAGE), "MOSV3: unsupported message type");

        // TODO: get fee
        (uint256 amount, address receiverFeeAddress) = _getMessageFee(_toChain, _feeToken, msgData.gasLimit);
        if (_feeToken == address(0)) {
            require(msg.value >= amount, "MOSV3: invalid message fee");
            if (msg.value > 0) {
                //payable(receiverFeeAddress).transfer(msg.value);
                _safeTransferNative(receiverFeeAddress,msg.value);
            }
        } else {
            //SafeERC20Upgradeable.safeTransferFrom(IERC20Upgradeable(_feeToken), msg.sender, receiverFeeAddress, amount);
            _safeTransferFrom(_feeToken, msg.sender, receiverFeeAddress, amount);
        }


        BridgeParam memory bridgeData;
        bridgeData.relay = msgData.relay;
        bridgeData.gasLimit = msgData.gasLimit;
        bridgeData.swapData = msgData.payload;
        orderId = _messageOut(
            MessageType.MESSAGE,
            msg.sender,
            address(0),
            0,
            mosRelay,
            _toChain,
            msgData.target,
            bridgeData
        );

        emit MessageTransfer(msg.sender, address(0), msg.sender, orderId, bytes32(0), _feeToken, 0);

        return orderId;
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
        if (EvmDecoder.MESSAGE_OUT_TOPIC != log.topics[0]) revert invalid_bridge_log();

        (bool result, EVMSwapOutEvent memory outEvent) = EvmDecoder.decodeMessageRelay(log);

        if (!result) revert invalid_pack_version();

        if (outEvent.mos != address(this)) revert invalid_mos_contract();
        if (selfChainId != outEvent.toChain) revert invalid_to_chain();
        if (_orderId != outEvent.orderId) revert invalid_order_Id();

        if (MessageType(outEvent.messageType) == MessageType.MESSAGE) {
            // todo: message
            MessageData memory msgData = abi.decode(outEvent.swapData, (MessageData));
            _messageIn(outEvent, msgData, false, false);

        } else {
            // token bridge
            _swapIn(
                outEvent.orderId,
                outEvent.token,
                outEvent.to,
                outEvent.amount,
                outEvent.fromChain,
                outEvent.from,
                outEvent.swapData
            );
        }
    }

    function _notifyLightClient(uint256, bytes memory _data) internal override {
        lightNode.notifyLightClient(address(this), _data);
    }

    function _getRelay() internal view returns (uint256 relayChainId, address relayContract) {
        uint256 relay = relaySlot;

        relayChainId = relay & 0xFFFFFFFFFFFFFFFF;
        relayContract = address(uint160(relay >> 96));
    }

}
