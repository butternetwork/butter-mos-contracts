// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

interface IAuthority {
    function isAuthorized(address user, address target, bytes4 funSig) external view returns (bool);

    function getRole(address target, bytes4 funSig) external view returns (bytes32);

    function execute(address target, uint256 value, bytes calldata payload) external payable;

    function addControl(address target, bytes4 funSig, bytes32 role) external;
}
