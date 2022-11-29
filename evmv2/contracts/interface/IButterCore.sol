// SPDX-License-Identifier: MIT

pragma solidity 0.8.7;

uint8 constant MAX_SWAP_ROUTE = 5;

struct AccessParams {
    uint256[MAX_SWAP_ROUTE]  amountInArr;
    uint256[MAX_SWAP_ROUTE]  amountOutMinArr;
    bytes[MAX_SWAP_ROUTE]    pathArr;
    address  payable  to;
    uint256    deadline;
    address[2]  input_Out_Addre;  // 0 -input  1- Out
    uint8[MAX_SWAP_ROUTE]  routerIndex;
}

interface IButterCore {
    function multiSwap(AccessParams calldata params) external payable;
}