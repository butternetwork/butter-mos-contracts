// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;


interface IEvent {

    struct swapOutEvent {
        uint256 fromChain;
        uint256 toChain;
        bytes32 orderId;
        bytes token; // token to transfer
        bytes from;
        bytes to;
        uint256 amount;
        bytes swapData;
    }

    struct txLog {
        address addr;
        bytes[] topics;
        bytes data;
    }
}