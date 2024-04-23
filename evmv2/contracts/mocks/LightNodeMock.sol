// SPDX-License-Identifier: MIT

pragma solidity 0.8.20;

import "@mapprotocol/protocol/contracts/interface/ILightNode.sol";

contract LightNode {
    function verifyProofData(
        bytes memory _receiptProof
    ) external returns (bool success, string memory message, bytes memory logs) {
        return (true, "success", _receiptProof);
    }
}
