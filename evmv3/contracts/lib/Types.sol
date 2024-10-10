// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

    struct DepositOutEvent {
        bytes token;
        bytes from;
        bytes32 orderId;
        uint256 fromChain;
        uint256 toChain;
        bytes mosOrRelay;
        bytes to;
        uint256 amount;
    }

    struct SwapOutEvent {
        uint256 fromChain;
        uint256 toChain;
        bytes32 orderId;
        bytes mosOrRelay;
        bytes token; // token to transfer
        bytes from;
        bytes to;
        uint256 amount;
        uint256 gasLimit;
        bytes swapData;
    }


    struct EVMSwapOutEvent {
        uint256 fromChain;
        uint256 toChain;
        bytes32 orderId;
        address mosOrRelay;
        address token; // token to transfer
        bytes from;
        address to;
        uint256 amount;
        uint256 gasLimit;
        bytes swapData;
    }