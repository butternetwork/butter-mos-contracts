// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

import "@openzeppelin/contracts/access/AccessControlEnumerable.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Pausable.sol";
import "../interface/IBridgeToken.sol";

abstract contract BridgeToken is ERC20Pausable, AccessControlEnumerable, IBridgeToken {
    bytes32 public constant MANAGER_ROLE = keccak256("MANAGER_ROLE");
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");

    struct CapInfo {
        uint256 cap;
        uint256 total;
    }
    mapping(address => bool) public blackList;
    mapping(address => CapInfo) public minterCap;

    function updateBlackList(address account, bool flag) external virtual override onlyRole(DEFAULT_ADMIN_ROLE) {
        blackList[account] = flag;
        emit UpdateBlackList(account, flag);
    }

    function setMinterCap(address minter, uint256 cap) external virtual override onlyRole(DEFAULT_ADMIN_ROLE) {
        minterCap[minter].cap = cap;
        emit UpdateMinterCap(minter, cap);
    }

    function mint(address to, uint256 amount) public virtual override onlyRole(MINTER_ROLE) {
        CapInfo storage s = minterCap[msg.sender];
        s.total += amount;
        require(s.total <= s.cap, "BridgeToken: minter cap exceeded");
        _mint(to, amount);
    }

    function burnFrom(address account, uint256 amount) public virtual override {
        if (hasRole(DEFAULT_ADMIN_ROLE, _msgSender())) {
            _burn(account, amount);
        } else {
            CapInfo storage s = minterCap[_msgSender()];
            if (s.cap > 0 || s.total > 0) {
                require(s.total >= amount, "BridgeToken: burn amount exceeds minter cap");
                unchecked {
                    s.total -= amount;
                }
            }
            _spendAllowance(account, _msgSender(), amount);
            _burn(account, amount);
        }
    }

    function burn(uint256 amount) public virtual override {
        _burn(_msgSender(), amount);
    }

    function pause() public virtual override onlyRole(MANAGER_ROLE) {
        _pause();
    }

    function unpause() public virtual override onlyRole(MANAGER_ROLE) {
        _unpause();
    }

    function getMinterCap(address minter) external view override returns (uint256) {
        return minterCap[minter].cap;
    }

    function isBlackListed(address account) external view override returns (bool) {
        return blackList[account];
    }

    function _beforeTokenTransfer(address from, address to, uint256 amount) internal virtual override {
        // exclude mint or burn
        if (!(to == address(0) || from == address(0))) {
            require(!blackList[from], "BridgeToken: blackListed");
        }
        super._beforeTokenTransfer(from, to, amount);
    }
}
