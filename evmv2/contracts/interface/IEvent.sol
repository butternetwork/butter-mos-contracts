// SPDX-License-Identifier: MIT

pragma solidity 0.8.7;
import "./IMOSV2.sol";

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
        bytes token;
        bytes from;
        bytes32 orderId;
        uint256 fromChain;
        uint256 toChain;
        bytes to;
        address mapTargetToken;
        bytes toChainTargetToken;
        SwapData swapData;
    }

    struct txLog {
        address addr;
        bytes[] topics;
        bytes data;
    }
}