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

    event SetRelay(uint256 _chainId, address _relay);

    event Deposit(
        bytes32 orderId,
        address token,
        address from,
        address to,
        uint256 amount,
        uint256 gasLimit,
        uint256 messageFee
    );

    function setRelay(uint256 _chainId, address _relay) external onlyRole(MANAGE_ROLE) checkAddress(_relay) {
        relayChainId = _chainId;
        relayContract = _relay;
        emit SetRelay(_chainId, _relay);
    }

    function swapOutToken(
        address _sender, // initiator address
        address _token,     // src token
        bytes memory _to,
        uint256 _amount,
        uint256 _toChain, // target chain id
        bytes calldata _swapData
    ) external virtual nonReentrant whenNotPaused returns (bytes32 orderId) {
        require(_toChain != selfChainId, "Cannot swap to self chain");
        SwapOutParam memory param;
        param.gasLimit = baseGasLookup[_toChain][OutType.SWAP];
        if (_swapData.length != 0) {
            BridgeParam memory bridge = abi.decode(_swapData, (BridgeParam));
            param.gasLimit += bridge.gasLimit;
            param.refundAddress = bridge.refundAddress;
            param.swapData = bridge.swapData;
        }
        uint256 messageFee;
        (param.token, , messageFee) = _tokenIn(_toChain, _amount, _token, param.gasLimit, true);
        _checkLimit(_amount, _toChain, _token);
        _checkBridgeable(param.token, _toChain);

        if (isOmniToken(param.token)) {
            param.toChain = _toChain;
            param.amount = _amount;
            param.from = _sender;
            param.to = _to;
            orderId = _interTransferAndCall(param, abi.encodePacked(relayContract));
        } else {
            bytes memory payload = abi.encode(
                param.gasLimit,
                abi.encodePacked(_token),
                _amount,
                abi.encodePacked(_sender),
                _to,
                _swapData
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
            orderId = mos.transferOut{value: messageFee}(_toChain, abi.encode(messageData), Helper.ZERO_ADDRESS);
        }
        emit SwapOut(
            orderId,
            _toChain,
            _token,
            abi.encodePacked(param.token),
            _amount,
            _sender,
            _to,
            param.gasLimit,
            messageFee
        );
    }


    function deposit(address _token, address _to, uint256 _amount) external payable nonReentrant whenNotPaused {
        uint256 gasLimit = baseGasLookup[relayChainId][OutType.DEPOSIT];
        (address token, , uint256 messageFee) = _tokenIn(relayChainId, _amount, _token, gasLimit, false);
        _checkBridgeable(token, relayChainId);
        bytes memory payload = abi.encode(
            abi.encodePacked(token),
            _amount,
            abi.encodePacked(msg.sender),
            _to
        );
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
    ) external override nonReentrant checkOrder(_orderId) returns (bytes memory newMessage) {
        require(msg.sender == address(mos), "only mos");
        require(_toChain == selfChainId, "invalid to chain");
        require(_fromBytes(_fromAddress) == relayContract, "invalid from");
        SwapInParam memory param;
        param.fromChain = _fromChain;
        param.orderId = _orderId;
        bytes memory token;
        uint256 amount;
        bytes memory to;
        (token, param.amount, to, param.from, param.swapData) = abi.decode(
            _message,
            (bytes, uint256, bytes, bytes, bytes)
        );
        param.token = _fromBytes(token);
        param.to = _fromBytes(to);
        _checkAndMint(param.token, amount);
        _swapIn(param);
        return bytes("");
    }


}
