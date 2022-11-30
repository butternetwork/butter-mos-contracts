// SPDX-License-Identifier: MIT

pragma solidity 0.8.7;


struct AccessParams {
    uint256[]  amountInArr;
    uint256[]  amountOutMinArr;
    bytes[]    pathArr;
    address  payable  to;
    uint256    deadline;
    address[2]  input_Out_Addre;  // 0 -input  1- Out
    uint8[]  routerIndex;
}

interface IButterCore {
    function multiSwap(AccessParams calldata params) external payable;
}