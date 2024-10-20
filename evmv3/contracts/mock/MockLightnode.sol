// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "@mapprotocol/protocol/contracts/interface/ILightVerifier.sol";

contract MockLightnode is ILightVerifier {
    function notifyLightClient(address _from, bytes memory _data) external override {}

    function verifyProofDataWithCache(
        bytes memory _receiptProof
    ) external override returns (bool success, string memory message, bytes memory logs) {}

    function verifyProofDataWithCache(
        bool _cache,
        uint256 _logIndex,
        bytes memory _receiptProofBytes
    ) external override returns (bool success, string memory message, txLog memory log) {
        success = true;
        message = "";
        log = abi.decode(_receiptProofBytes, (txLog));
    }

    function verifyProofData(
        bytes memory _receiptProof
    ) external view override returns (bool success, string memory message, bytes memory logs) {}

    function verifyProofData(
        uint256 _logIndex,
        bytes memory _receiptProof
    ) external view override returns (bool success, string memory message, txLog memory log) {
        success = true;
        message = "";
        log = abi.decode(_receiptProof, (txLog));
    }

    function verifiableHeaderRange() external view override returns (uint256, uint256) {}

    function isVerifiable(uint256 _blockHeight, bytes32 _hash) external view override returns (bool) {}

    function nodeType() external view override returns (uint256) {}
}
