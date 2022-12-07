// SPDX-License-Identifier: MIT

pragma solidity 0.8.7;
import "../utils/ButterLib.sol";

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
        bytes token; // token to transfer
        bytes from;
        uint256 fromChain;
        uint256 toChain;
        address mapTargetToken;
        ButterLib.SwapData swapData;
        bytes32 orderId;
    }

    struct txLog {
        address addr;
        bytes[] topics;
        bytes data;
    }
}