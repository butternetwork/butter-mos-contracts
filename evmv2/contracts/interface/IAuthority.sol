// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

interface IAuthority {
    struct ExecuteParam {
        bytes32 id;
        address target;
        uint256 value;
        bytes payload;
    }

    function isAuthorized(address user, address target, bytes4 funSig) external view returns (bool);

    function execute(ExecuteParam calldata param) external payable;

    function executeBatch(ExecuteParam[] calldata params) external payable;

    function addControl(address target, bytes4 funSig, bytes32 role) external;
}
