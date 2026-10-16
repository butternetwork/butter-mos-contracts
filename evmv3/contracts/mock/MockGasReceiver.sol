// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import {IMapoExecutor} from "../interface/IMapoExecutor.sol";

// Test-only receiver used to observe how much gas `_transferIn` actually forwards
// to `mapoExecute` when `_gasleft` is true (BridgeAndRelay's self-chain MESSAGE
// delivery path), versus the `gasLimit` the original cross-chain message specified.
contract MockGasReceiver is IMapoExecutor {
    uint256 public lastGasLeftOnEntry;

    function mapoExecute(
        uint256,
        uint256,
        bytes calldata,
        bytes32,
        bytes calldata
    ) external payable override returns (bytes memory newMessage) {
        lastGasLeftOnEntry = gasleft();
        return bytes("");
    }
}
