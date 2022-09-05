// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

contract SimpleStorage {
    string value;

    function getValue() public view returns (string memory) {
        return value;
    }

    function setValue(string memory val) public {
        value = val;
    }
}