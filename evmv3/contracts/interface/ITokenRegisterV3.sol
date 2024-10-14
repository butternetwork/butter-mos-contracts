// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

interface ITokenRegisterV3 {
    // Get token address on target chain
    function getToChainToken(address _token, uint256 _toChain) external view returns (bytes memory _toChainToken);

    // Get token amount on target chain
    function getToChainAmount(address _token, uint256 _amount, uint256 _toChain) external view returns (uint256);

    // Get token and vault token address on relay chain
    function getRelayChainToken(uint256 _fromChain, bytes memory _fromToken) external view returns (address);

    // Get token amount on relay chain
    function getRelayChainAmount(address _token, uint256 _fromChain, uint256 _amount) external view returns (uint256);

    function getTargetToken(
        uint256 _fromChain,
        uint256 _toChain,
        bytes memory _fromToken
    ) external view returns (bytes memory toToken, uint8 decimals, bool mintable);

    function getTargetAmount(
        uint256 _fromChain,
        uint256 _toChain,
        bytes memory _fromToken,
        uint256 _amount
    ) external view returns (uint256 toAmount);

    function checkMintable(address _token) external view returns (bool);

    function getVaultToken(address _token) external view returns (address);

    // function getTokenFee(address _token, uint256 _amount, uint256 _toChain) external view returns (uint256);

    function getBaseFeeReceiver() external view returns (address);

    function getTransferFee(
        bytes memory _caller,
        address _token,
        uint256 _amount,
        uint256 _fromChain,
        uint256 _toChain,
        bool _withSwap
    ) external view returns (uint256 totalFee, uint256 baseFee, uint256 bridgeFee);

    // get token transfer fee, the larger one of tranfer in or transfer out fee
    function getTransferFeeV3(
        bytes memory _caller,
        address _token,
        uint256 _amount,
        uint256 _fromChain,
        uint256 _toChain,
        bool _withSwap
    ) external view returns (uint256 totalFee, uint256 baseFee, uint256 bridgeFee);

    function getBridgeFeeInfoV3(
        bytes memory _caller,
        bytes memory _fromToken,
        uint256 _fromChain,
        uint256 _fromAmount,
        uint256 _toChain,
        bool _withSwap
    ) external view returns (uint256 fromChainFee, uint256 toChainAmount, uint256 toChainVault);

    function getSourceFeeByTargetV3(
        bytes memory _caller,
        bytes memory _targetToken,
        uint256 _targetChain,
        uint256 _targetAmount,
        uint256 _fromChain,
        bool _withSwap
    )
        external
        view
        returns (uint256 fromChainFee, uint256 fromChainAmount, uint256 targetChainVault, bytes memory fromChainToken);
}
