// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface IFlashSwap {
    function swap(
        address _tokenIn,
        address _tokenOut,
        uint256 _amountIn,
        uint256 _minOut,
        address _receiver
    ) external payable returns (uint256);

    function getAmountOut(
        address _tokenIn,
        address _tokenOut,
        uint256 _amountIn
    ) external view returns (uint256 amountOut);
}