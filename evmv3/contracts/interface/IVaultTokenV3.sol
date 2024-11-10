// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

interface IVaultTokenV3 {
    function deposit(uint256 _fromChain, uint256 _amount, address _to) external;

    function withdraw(uint256 _toChain, uint256 _vaultAmount, address _to) external;

    function totalVault() external view returns (uint256);

    // update vault amount
    // _fee: all fees except vault fee
    //      so the vault will add (_amount - _outAmout - _fee) tokens
    function transferToken(
        uint256 _fromChain,
        uint256 _amount,
        uint256 _toChain,
        uint256 _outAmount,
        uint256 _relayChain,
        uint256 _fee
    ) external;

    function updateVault(
        uint256 _fromChain,
        uint256 _amount,
        uint256 _toChain,
        uint256 _outAmount,
        uint256 _relayChain,
        uint256 _fee
    ) external;

    function getTokenAmount(uint256 _amount) external view returns (uint256);

    function getTokenAddress() external view returns (address);

    function allChains() external view returns (uint256[] memory);

    function getVaultByChainId(uint256 _chain) external view returns (int256);
}
