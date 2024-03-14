// SPDX-License-Identifier: MIT

pragma solidity 0.8.7;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

import "@mapprotocol/protocol/contracts/interface/ILightClientManager.sol";
import "@mapprotocol/protocol/contracts/interface/ILightNode.sol";

contract LightClientManager is ILightClientManager, Ownable {
    mapping(uint256 => address) public lightClientContract;
    mapping(uint256 => address) public updateBlockContract;

    function updateLightClient(uint256 _chainId, bytes memory _data) external override {}

    function updateBlockHeader(uint256 _chainId, bytes memory _blockHeader) external override {
        require(updateBlockContract[_chainId] != address(0), "not register");
        ILightNode lightNode = ILightNode(updateBlockContract[_chainId]);
        lightNode.updateBlockHeader(_blockHeader);
    }

    function verifyProofData(
        uint256 _chainId,
        bytes memory _receiptProof
    ) external view override returns (bool success, string memory message, bytes memory logs) {
        //        require(lightClientContract[_chainId] != address(0), "not register");
        //        ILightNode lightNode = ILightNode(lightClientContract[_chainId]);
        //        return lightNode.verifyProofData(_receiptProof);
        if (_chainId == 888) {
            return (false, "fail", _receiptProof);
        } else {
            return (true, "success", _receiptProof);
        }
    }

    function headerHeight(uint256 _chainId) external view override returns (uint256) {
        require(lightClientContract[_chainId] != address(0), "not register");
        ILightNode lightNode = ILightNode(updateBlockContract[_chainId]);
        if (_chainId == 34434) {
            uint256 number = lightNode.headerHeight();
            return number;
        } else {
            return lightNode.headerHeight();
        }
    }

    function verifiableHeaderRange(uint256 _chainId) external view override returns (uint256, uint256) {
        return (0, 0);
    }

    function clientState(uint256 _chainId) external view override returns (bytes memory) {
        return bytes("");
    }

    function finalizedState(uint256 _chainId, bytes memory _data) external view override returns (bytes memory) {
        return bytes("");
    }

    function nodeType(uint256 _chainId) external view override returns (uint256) {
        return 0;
    }

    function notifyLightClient(uint256 _chainId,  address _from, bytes memory _data) external override {}

    function isVerifiable(uint256 _chainId, uint256 _blockHeight, bytes32 _hash) external view override returns (bool) {
        return false;
    }

    function verifyProofDataWithCache(
        uint256 _chainId,
        bytes memory _receiptProof
    ) external override returns (bool success, string memory message, bytes memory logs) {}
}
