// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

interface IRootChainManager {
    function depositFor(address user, address rootToken, bytes calldata depositData) external;

    function feeToken() external view returns (address);

    function feeAmount() external view returns (uint256);
}
