    // SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "./interface/IMAPToken.sol";

contract BNear is ERC20 {
    constructor() ERC20("USD Circle", "USDC"){
        _mint(msg.sender, 100000000000000000000000000000000);
    }

}