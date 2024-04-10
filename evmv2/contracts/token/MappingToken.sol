// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import "./BridgeToken.sol";

contract MappingToken is BridgeToken, ERC20Permit {
    uint8 private immutable _decimals;

    constructor(
        string memory name_,
        string memory symbol_,
        uint8 decimals_,
        address _admin
    ) ERC20(name_, symbol_) ERC20Permit(name_) {
        require(_admin != address(0), "address_0");
        _grantRole(DEFAULT_ADMIN_ROLE, _admin);
        _grantRole(MANAGER_ROLE, _admin);
        //_grantRole(MINTER_ROLE, msg.sender);
        _decimals = decimals_;
    }

    function decimals() public view override returns (uint8) {
        return _decimals;
    }

    function _beforeTokenTransfer(
        address from,
        address to,
        uint256 amount
    ) internal virtual override(ERC20, BridgeToken) {
        BridgeToken._beforeTokenTransfer(from, to, amount);
    }
}
