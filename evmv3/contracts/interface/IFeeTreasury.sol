// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface IFeeTreasury {
    function feeList(address feeReceiver, address token) external view returns(uint256);

    function withdrawFee(address receiver, address token) external payable;
}