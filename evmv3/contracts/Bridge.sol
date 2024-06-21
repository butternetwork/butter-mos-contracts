// SPDX-License-Identifier: MIT

pragma solidity 0.8.20;

import "./lib/Helper.sol";
import "./interface/IMOSV3.sol";
import "./abstract/BridgeAbstract.sol";
import "./interface/IMintableToken.sol";
import "@openzeppelin/contracts-upgradeable/utils/AddressUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";

contract Bridge is BridgeAbstract {
    using AddressUpgradeable for address;
    using SafeERC20Upgradeable for IERC20Upgradeable;

    uint256 public relayChainId;
    address public relayContract;
    mapping(uint256 => bytes) public bridges;

    event SetRelay(uint256 _chainId, address _relay);
    event RegisterChain(uint256 _chainId, bytes _address);
    event Deposit(
        bytes32 orderId,
        address token,
        address from,
        address to,
        uint256 amount,
        uint256 gasLimit,
        uint256 messageFee
    );

    function setRelay(uint256 _chainId, address _relay) external onlyRole(MANAGER_ROLE) checkAddress(_relay) {
        relayChainId = _chainId;
        relayContract = _relay;
        bridges[relayChainId] = abi.encodePacked(relayContract);
        emit SetRelay(_chainId, _relay);
    }

    function registerChain(uint256[] calldata _chainIds, bytes[] calldata _addresses) external onlyRole(MANAGER_ROLE) {
        uint256 len = _chainIds.length;
        require(len == _addresses.length, "length mismatching");
        for (uint256 i = 0; i < len; i++) {
            bridges[_chainIds[i]] = _addresses[i];
            emit RegisterChain(_chainIds[i], _addresses[i]);
        }
    }

    function swapOutToken(
        address _sender, // initiator address
        address _token, // src token
        bytes memory _to,
        uint256 _amount,
        uint256 _toChain, // target chain id
        bytes calldata _swapData
    ) external payable override nonReentrant whenNotPaused returns (bytes32 orderId) {
        require(_toChain != selfChainId, "Cannot swap to self chain");
        SwapOutParam memory param;
        param.from = _sender;
        param.to = _to;
        param.toChain = _toChain;
        param.amount = _amount;
        param.token = Helper._isNative(_token) ? wToken : _token;
        if (isOmniToken(param.token)) {
            param.gasLimit = _getBaseGas(_toChain, OutType.INTER_TRANSFER);
        } else {
            param.gasLimit = _getBaseGas(_toChain, OutType.SWAP);
        }
        if (_swapData.length != 0) {
            BridgeParam memory bridge = abi.decode(_swapData, (BridgeParam));
            param.gasLimit += bridge.gasLimit;
            param.refundAddress = bridge.refundAddress;
            param.swapData = bridge.swapData;
        }
        uint256 messageFee;
        (, , messageFee) = _tokenIn(param.toChain, param.amount, _token, param.gasLimit, true);
        _checkAndBurn(param.token, _amount);
        if (isOmniToken(param.token)) {
            orderId = _interTransferAndCall(param, bridges[_toChain], messageFee);
        } else {
            _checkBridgeable(param.token, param.toChain);
            _checkLimit(param.amount, param.toChain, param.token);
            bytes memory payload = abi.encode(
                param.gasLimit,
                abi.encodePacked(param.token),
                param.amount,
                abi.encodePacked(param.from),
                param.to,
                param.swapData
            );
            payload = abi.encode(OutType.SWAP, payload);
            IMOSV3.MessageData memory messageData = IMOSV3.MessageData({
                relay: (_toChain != relayChainId),
                msgType: IMOSV3.MessageType.MESSAGE,
                target: abi.encodePacked(relayContract),
                payload: payload,
                gasLimit: param.gasLimit,
                value: 0
            });
            orderId = mos.transferOut{value: messageFee}(param.toChain, abi.encode(messageData), Helper.ZERO_ADDRESS);
        }
        emit SwapOut(
            orderId,
            param.toChain,
            _token,
            param.amount,
            param.from,
            msg.sender,
            param.to,
            abi.encodePacked(param.token),
            param.gasLimit,
            messageFee
        );
    }

    function depositToken(
        address _token,
        address _to,
        uint256 _amount
    ) external payable override nonReentrant whenNotPaused {
        uint256 gasLimit = _getBaseGas(relayChainId, OutType.DEPOSIT);
        (address token, , uint256 messageFee) = _tokenIn(relayChainId, _amount, _token, gasLimit, false);
        _checkAndBurn(_token, _amount);
        _checkBridgeable(token, relayChainId);
        bytes memory payload = abi.encode(abi.encodePacked(token), _amount, abi.encodePacked(msg.sender), _to);
        payload = abi.encode(OutType.DEPOSIT, payload);
        IMOSV3.MessageData memory messageData = IMOSV3.MessageData({
            relay: false,
            msgType: IMOSV3.MessageType.MESSAGE,
            target: abi.encodePacked(relayContract),
            payload: payload,
            gasLimit: gasLimit,
            value: 0
        });
        bytes32 orderId = mos.transferOut{value: messageFee}(
            relayChainId,
            abi.encode(messageData),
            Helper.ZERO_ADDRESS
        );
        emit Deposit(orderId, _token, msg.sender, _to, _amount, gasLimit, messageFee);
    }

    function mapoExecute(
        uint256 _fromChain,
        uint256 _toChain,
        bytes calldata _fromAddress,
        bytes32 _orderId,
        bytes calldata _message
    ) external payable override nonReentrant checkOrder(_orderId) returns (bytes memory newMessage) {
        require(msg.sender == address(mos), "only mos");
        require(_toChain == selfChainId, "invalid to chain");
        require(_fromBytes(_fromAddress) == relayContract, "invalid from");
        SwapInParam memory param;
        param.fromChain = _fromChain;
        param.orderId = _orderId;
        bytes memory token;
        bytes memory to;
        (param.orderId, token, param.amount, to, param.from, param.swapData) = abi.decode(
            _message,
            (bytes32, bytes, uint256, bytes, bytes, bytes)
        );
        // TODO: check param.orderId
        param.token = _fromBytes(token);
        param.to = _fromBytes(to);
        _checkAndMint(param.token, param.amount);
        _swapIn(param);
        return bytes("");
    }

    function getDepositNativeFee(address _token) external view returns (uint256) {
        address token = Helper._isNative(_token) ? wToken : _token;
        uint256 gasLimit = _getBaseGas(relayChainId, OutType.DEPOSIT);
        return getMessageFee(token, gasLimit, relayChainId);
    }
}
