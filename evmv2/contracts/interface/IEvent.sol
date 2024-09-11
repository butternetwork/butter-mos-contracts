// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

interface IEvent {
    struct depositOutEvent {
        bytes token;
        bytes from;
        bytes32 orderId;
        uint256 fromChain;
        uint256 toChain;
        bytes to;
        uint256 amount;
    }

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
        bytes32[] topics;
        bytes data;
    }
}
