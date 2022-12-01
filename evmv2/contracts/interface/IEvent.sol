// SPDX-License-Identifier: MIT

pragma solidity 0.8.7;
struct SwapParam {
    uint256 amountIn;
    uint256 minAmountOut;
    bytes path; // 0xtokenin+0xtokenOut on evm, or tokenIn'X'tokenOut on near
    uint64 routerIndex; // pool id on near or router index on evm
}

struct SwapData {
    SwapParam[] swapParams;
    bytes targetToken;
    bytes toAddress;
}
    struct AccessParams {
        uint256[1]  amountInArr;
        uint256[1]  amountOutMinArr;
        bytes[1]    pathArr;
        address  payable  to;
        uint256    deadline;
        address[2]  input_Out_Addre;  // 0 -input  1- Out
        uint8[1]  routerIndex;
    }
interface IEvent {

    struct transferOutEvent {
        bytes token;
        bytes from;
        bytes32 orderId;
        uint256 fromChain;
        uint256 toChain;
        bytes to;
        uint256 amount;
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