// SPDX-License-Identifier: MIT
pragma solidity 0.8.7;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";


contract RootERC20 is ERC20 {
    constructor(string memory name_, string memory symbol_) ERC20(name_, symbol_)
    {
        uint256 amount = 10**10 * (10**18);
        _mint(msg.sender, amount);
    }

}
