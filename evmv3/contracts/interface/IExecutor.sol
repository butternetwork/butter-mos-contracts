// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface IExecutor {
    function execute(
        uint256 _fromChain,
        uint256 _toChain,
        bytes32 _orderId,
        address _token,
        uint256 _amount,
        bytes calldata _fromAddress,
        bytes calldata _message
    ) external;
}
