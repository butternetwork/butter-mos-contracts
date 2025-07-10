// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "../interface/IMapoExecutor.sol";
import "../interface/IButterReceiver.sol";

contract MockReceiver is IMapoExecutor, IButterReceiver {
    event Executed(uint256 fromChain, uint256 toChain, bytes from, bytes32 orderId, bytes swapData);
    event OnReceived(bytes32 orderId, address srcToken, uint256 amount, uint256 fromChain, bytes from, bytes payload);

    function mapoExecute(
        uint256 _fromChain,
        uint256 _toChain,
        bytes calldata _fromAddress,
        bytes32 _orderId,
        bytes calldata _message
    ) external payable returns (bytes memory newMessage) {
        emit Executed(_fromChain, _toChain, _fromAddress, _orderId, _message);
        return bytes("");
    }

    function onReceived(
        bytes32 _orderId,
        address _srcToken,
        uint256 _amount,
        uint256 _fromChain,
        bytes calldata _from,
        bytes calldata _payload
    ) external {
        emit OnReceived(_orderId, _srcToken, _amount, _fromChain, _from, _payload);
    }
} 