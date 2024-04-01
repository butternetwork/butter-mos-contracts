// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

interface IMAPOmnichainMange {
    struct ExecuteParam {
        bytes32 id;
        address target;
        uint256 value;
        bytes playload;
    }
    function execute(ExecuteParam calldata param) external payable;
    function executeBatch(ExecuteParam[] calldata params) external payable;
    function addToControl(address target,bytes4 funSig,bytes32 role) external;
}