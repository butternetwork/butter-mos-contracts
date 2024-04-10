// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface IBridgeToken {
    event UpdateBlackList(address account, bool flag);

    event UpdateMinterCap(address indexed minter, uint256 cap);

    function updateBlackList(address account, bool flag) external;

    function setMinterCap(address minter, uint256 cap) external;

    function mint(address to, uint256 amount) external;

    function burnFrom(address account, uint256 amount) external;

    function burn(uint256 amount) external;

    function pause() external;

    function unpause() external;

    function getMinterCap(address minter) external view returns (uint256);

    function isBlackListed(address account) external view returns (bool);
}
