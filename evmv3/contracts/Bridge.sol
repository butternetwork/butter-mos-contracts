// SPDX-License-Identifier: MIT

pragma solidity 0.8.20;

import "./abstract/BridgeAbstract.sol";
import "./interface/IMintableToken.sol";
import { EVMSwapOutEvent } from "./lib/Types.sol";
import "@mapprotocol/protocol/contracts/interface/ILightVerifier.sol";

contract Bridge is BridgeAbstract {

    bytes32 constant MESSAGE_OUT_TOPIC =
        keccak256(bytes("MessageRelay(bytes32,uint256,bytes)"));


    uint256 public relayChainId;
    address public relayContract;
    ILightVerifier public lightNode;

    mapping(address => bool) public mintableTokens;
    mapping(uint256 => mapping(address => bool)) public tokenMappingList;

    error invalid_relay_contract();
    error invalid_mos_contract();
    error invalid_to_chain();
    error invalid_bridge_log();
    event SetLightClient(address lightNode);
    event SetRelay(uint256 _chainId, address _relay);
    event DepositOut(
        uint256 indexed fromChain,
        uint256 indexed toChain,
        bytes32 orderId,
        address token,
        address relay,
        address from,
        address to,
        uint256 amount
    );

    function setRelay( uint256 _chainId, address _relay) external onlyRole(MANAGER_ROLE) {
        _checkAddress(_relay);
        relayChainId = _chainId;
        relayContract = _relay;
        emit SetRelay(_chainId, _relay);
    }

    function setLightClient(address _lightNode) external onlyRole(MANAGER_ROLE) {
        _checkAddress(_lightNode);
        lightNode = ILightVerifier(_lightNode);
        emit SetLightClient(_lightNode);
    }

    function registerTokenChains(
        address _token,
        uint256[] memory _toChains,
        bool _enable,
        bool _mintAble
    ) external onlyRole(MANAGER_ROLE) {
        if(_isContract(_token)) revert not_contract();
        mintableTokens[_token] = _mintAble;
        for (uint256 i = 0; i < _toChains.length; i++) {
            uint256 toChain = _toChains[i];
            tokenMappingList[toChain][_token] = _enable;
            emit RegisterToken(_token, toChain, _enable, _mintAble);
        }
    }

    function swapOutToken(
        address _initiator, // initiator address
        address _token, // src token
        bytes memory _to,
        uint256 _amount,
        uint256 _toChain, // target chain id
        bytes calldata _bridgeData
    ) external payable override nonReentrant whenNotPaused returns (bytes32 orderId)
    {
        if (_amount == 0) revert zero_amount();
        address from = msg.sender;
        address bridgeToken = _transferIn(_token, from, _amount, true);

        orderId = _swapOut(
            bridgeToken,
            _to,
            _initiator,
            _amount,
            _toChain,
            _bridgeData
        );
    }

    function depositToken(
        address _token,
        address _to,
        uint256 _amount
    ) external payable override nonReentrant whenNotPaused returns (bytes32 orderId)
    {
        if (_amount == 0) revert zero_amount();
        address from = msg.sender;
        address bridgeToken = _transferIn(_token, from, _amount, true);
        orderId = _depositToken(bridgeToken, from, _to, _amount);
    }

    function bridgeIn(
        uint256 _chainId,
        uint256 _logIndex,
        bytes32 _orderId,
        bytes memory _receiptProof
    ) external override nonReentrant whenNotPaused {
        _checkOrder(_orderId);
        require(_chainId == relayChainId);
        (
            bool success,
            string memory message,
            ILightVerifier.txLog memory log
        ) = lightNode.verifyProofDataWithCache(false, _logIndex, _receiptProof);
        require(success, message);
        if (relayContract != log.addr) revert invalid_relay_contract();
        if (MESSAGE_OUT_TOPIC != log.topics[0]) revert invalid_bridge_log();
        EVMSwapOutEvent memory outEvent = _decodeMessageRelayLog(log);
        if (outEvent.mosOrRelay != address(this)) revert invalid_mos_contract();
        if (selfChainId != outEvent.toChain) revert invalid_to_chain();
        if (_orderId != outEvent.orderId) revert invalid_order_Id();
        if (outEvent.amount == 0) {
            // message bridge
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

    function _decodeMessageRelayLog(
        ILightVerifier.txLog memory log
    ) internal pure returns (EVMSwapOutEvent memory outEvent) {
        uint256 chainAndGasLimit;
        bytes memory messageData;
        (outEvent.orderId, chainAndGasLimit, messageData) = abi.decode(
            log.data,
            (bytes32, uint256, bytes)
        );
        outEvent.fromChain = chainAndGasLimit >> 192;
        outEvent.toChain = (chainAndGasLimit << 64) >> 192;
        outEvent.gasLimit = uint256(uint64(chainAndGasLimit));
        (
            outEvent.mosOrRelay,
            outEvent.token,
            outEvent.amount,
            outEvent.to,
            outEvent.from,
            outEvent.swapData
        ) = abi.decode(
            messageData,
            (address, address, uint256, address, bytes, bytes)
        );
    }

    function _depositToken(
        address _token,
        address _from,
        address _to,
        uint256 _amount
    ) internal returns (bytes32 orderId) {
        _checkBridgeable(_token, relayChainId);
        orderId = _getOrderId(_from, _toBytes(_to), relayChainId);
        _notifyLightClient(bytes(""));
        emit DepositOut(
            selfChainId,
            relayChainId,
            orderId,
            _token,
            relayContract,
            _from,
            _to,
            _amount
        );
    }

    function _swapOut(
        address _token, // src token
        bytes memory _to,
        address _from,
        uint256 _amount,
        uint256 _toChain, // target chain id
        bytes calldata _swapData
    ) internal returns (bytes32 orderId) {
        _checkLimit(_amount, _toChain, _token);
        _checkBridgeable(_token, _toChain);
        uint256 fromChain = selfChainId;
        if (_toChain == fromChain) revert bridge_same_chain();
        orderId = _getOrderId(_from, _to, _toChain);
        _from = (msg.sender == butterRouter) ? _from : msg.sender;
        _notifyLightClient(bytes(""));

        bytes memory messageData = abi.encode(
            relayContract,
            _token,
            _amount,
            _to,
            _swapData
        );
        _emitMessageOut(
            orderId,
            uint64(fromChain),
            uint64(_toChain),
            uint64(0),
            _from,
            messageData
        );
    }

    function _emitMessageOut(
        bytes32 _orderId, 
        uint64 _fromChain, 
        uint64 _toChain, 
        uint64 _gasLimit, 
        address _from, 
        bytes memory messageData
    ) internal {
        uint256 chainAndGasLimit = _getChainAndGasLimit(_fromChain, _toChain, _gasLimit);
        emit MessageOut(_orderId, chainAndGasLimit, _from, messageData);
    }

    function _checkBridgeable(address _token, uint256 _chainId) internal view {
        if(!tokenMappingList[_chainId][_token]) revert token_not_registered();
    }

    function isMintAble(address _token) internal view override returns(bool) {
        return mintableTokens[_token];
    }

    function _notifyLightClient(bytes memory _data) internal {
        lightNode.notifyLightClient(address(this), _data);
    }

    function transferOut(
        uint256 _toChain,
        bytes memory _messageData,
        address _feeToken
    ) external payable override returns (bytes32) {}
}
