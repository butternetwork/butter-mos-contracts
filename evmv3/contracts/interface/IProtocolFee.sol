// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

interface IProtocolFee {
    enum FeeType {
        DEV,        // 0
        BUYBACK,    // 1
        RESERVE,    // 2
        STAKER      // 3
    }

    function getCumulativeFee(FeeType feeType, address token) external view returns (uint256);

    function getProtocolFee(address token, uint256 amount) external view returns (uint256);

    function getClaimable(FeeType feeType, address token) external view returns (uint256);

}
