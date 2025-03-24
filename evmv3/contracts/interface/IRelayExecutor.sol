// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface IRelayExecutor {
    // @notice This is the configuration you need across the chain.
    // @param fromChain - Source chain id.
    // @param toChain - Target chain id.
    // @param orderId - Cross-chain message id.
    // @param token - Token address on relay chain.
    // @param amount - Token amount on relay chain.
    // @param caller - The address initiate transaction, executor might use `retryMessage` if caller is in whitelist.
    // @param fromAddress - The original account that initiate transaction on source chain.
    // @param message - Cross-chain data.
    // @param retryMessage - Modified cross-chain data, default is null.
    function relayExecute(
        uint256 fromChain,
        uint256 toChain,
        bytes32 orderId,
        address token,
        uint256 amount,
        address caller,
        bytes calldata fromAddress,
        bytes calldata message,
        bytes calldata retryMessage
    ) external payable returns (address tokenOut, uint256 amountOut, bytes memory target, bytes memory newMessage);
}
