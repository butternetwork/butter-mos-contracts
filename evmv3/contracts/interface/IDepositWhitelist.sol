// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface IDepositWhitelist {

    function checkTokenAmountAndWhitelist(address token, address user, uint256 amount) external returns(bool);
    function checkTokenAmountAndWhitelistView(address token, address user, uint256 amount) external view returns(bool);
}