// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";

contract MockFeeService is Ownable {
    mapping(uint256 => mapping(address => mapping(uint256 => uint256))) public messageFees; // chainId => token => gasLimit => fee
    mapping(uint256 => mapping(address => mapping(uint256 => address))) public feeReceivers; // chainId => token => gasLimit => receiver
    bool public shouldRevert = false;
    
    constructor() Ownable(msg.sender) {}
    
    function setServiceMessageFee(uint256 chainId, address token, uint256 gasLimit, uint256 fee, address receiver) external onlyOwner {
        messageFees[chainId][token][gasLimit] = fee;
        feeReceivers[chainId][token][gasLimit] = receiver;
    }
    
    function getServiceMessageFee(uint256 chainId, address token, uint256 gasLimit) external view returns (uint256 amount, address receiverAddress) {
        if (shouldRevert) {
            revert("MockFeeService: should revert");
        }
        
        amount = messageFees[chainId][token][gasLimit];
        receiverAddress = feeReceivers[chainId][token][gasLimit];
        
        // If no specific fee set, return zero (will cause not_support_target_chain error)
        if (amount == 0 && receiverAddress == address(0)) {
            amount = 0;
            receiverAddress = address(0);
        }
    }
    
    function setShouldRevert(bool _shouldRevert) external onlyOwner {
        shouldRevert = _shouldRevert;
    }
} 