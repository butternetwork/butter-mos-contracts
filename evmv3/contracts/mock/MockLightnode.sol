// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "@mapprotocol/protocol/contracts/interface/ILightVerifier.sol";

contract MockLightnode is ILightVerifier {
    bool public verificationResult = true;
    string public verificationMessage = "";
    txLog public mockLog;
    
    function setVerificationResult(bool _result, string memory _message, txLog memory _log) external {
        verificationResult = _result;
        verificationMessage = _message;
        mockLog = _log;
    }

    function notifyLightClient(address _from, bytes memory _data) external override {}

    function verifyProofDataWithCache(
        bytes memory _receiptProof
    ) external override returns (bool success, string memory message, bytes memory logs) {
        return (verificationResult, verificationMessage, "");
    }

    function verifyProofDataWithCache(
        bool,
        uint256,
        bytes memory _receiptProofBytes
    ) external override returns (bool success, string memory message, txLog memory log) {
        if (!verificationResult) {
            revert(verificationMessage);
        }
        success = verificationResult;
        message = verificationMessage;
        log = mockLog;
    }

    function verifyProofData(
        bytes memory _receiptProof
    ) external view override returns (bool success, string memory message, bytes memory logs) {
        return (verificationResult, verificationMessage, "");
    }

    function verifyProofData(
        uint256,
        bytes memory _receiptProof
    ) external view override returns (bool success, string memory message, txLog memory log) {
        if (!verificationResult) {
            revert(verificationMessage);
        }
        success = verificationResult;
        message = verificationMessage;
        log = mockLog;
    }

    function verifiableHeaderRange() external view override returns (uint256, uint256) {
        return (0, type(uint256).max);
    }

    function isVerifiable(uint256 _blockHeight, bytes32 _hash) external view override returns (bool) {
        return verificationResult;
    }

    function nodeType() external view override returns (uint256) {
        return 1;
    }
}
