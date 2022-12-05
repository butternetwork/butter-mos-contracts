// SPDX-License-Identifier: MIT

pragma solidity 0.8.7;

library ButterLib {
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

    struct ButterCoreSwapParam {
        uint256[]  amountInArr;
        bytes[]    paramsArr;
        uint32[]  routerIndex;
        address[2]  inputOutAddre; // 0 -input  1- Out
    }

}