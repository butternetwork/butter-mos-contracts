// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "@mapprotocol/protocol/contracts/interface/ILightClientManager.sol";

contract MockLightnodeManager is ILightClientManager {
    function updateBlockHeader(uint256 _chainId, bytes memory _blockHeader) external override {}

    function updateLightClient(uint256 _chainId, bytes memory _data) external override {}

    function notifyLightClient(uint256 _chainId, address _from, bytes memory _data) external override {}

    function verifyProofDataWithCache(
        uint256 _chainId,
        bytes memory _receiptProof
    ) external override returns (bool success, string memory message, bytes memory logs) {}

    function verifyProofData(
        uint256 _chainId,
        bytes memory _receiptProof
    ) external view override returns (bool success, string memory message, bytes memory logs) {}

    function clientState(uint256 _chainId) external view override returns (bytes memory) {}

    function headerHeight(uint256 _chainId) external view override returns (uint256) {}

    function verifiableHeaderRange(uint256 _chainId) external view override returns (uint256, uint256) {}

    function finalizedState(uint256 _chainId, bytes memory _data) external view override returns (bytes memory) {}

    function isVerifiable(
        uint256 _chainId,
        uint256 _blockHeight,
        bytes32 _hash
    ) external view override returns (bool) {}

    function nodeType(uint256 _chainId) external view override returns (uint256) {}

    function verifyProofDataWithCache(
        uint256 _chainId,
        bool _cache,
        uint256 _logIndex,
        bytes calldata _receiptProofBytes
    ) external override returns (bool success, string memory message, ILightVerifier.txLog memory log) {}

    function verifyProofData(
        uint256,
        uint256,
        bytes calldata _receiptProof
    ) external view override returns (bool success, string memory message, ILightVerifier.txLog memory log) {
        success = true;
        message = "";
        log = abi.decode(_receiptProof, (ILightVerifier.txLog));
    }
}
