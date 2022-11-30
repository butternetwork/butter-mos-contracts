// SPDX-License-Identifier: MIT

pragma solidity 0.8.7;

struct SwapParam {
    uint amountIn;
    uint minAmountOut;
    bytes path;
    uint64 routerIndex;
}

struct SwapData {
        SwapParam[] swapParams;
        bytes targetToken;
        bytes toAddress;
}

interface IEvent {

    struct transferOutEvent {
        uint256 amount;
        bytes token;
        bytes from;
        bytes32 orderId;
        uint256 fromChain;
        uint256 toChain;
        bytes to;
        bytes toChainToken;
    }

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
        uint256 amount;
        bytes token;
        bytes from;
        uint256 fromChain;
        uint256 toChain;
        address mapTargetToken;
        SwapData swapData;
        bytes32 orderId;
    }

    struct txLog {
        address addr;
        bytes[] topics;
        bytes data;
    }
}