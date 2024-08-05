// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface IButterBridgeV3 {
    struct BridgeParam {
        uint256 gasLimit;
        bytes refundAddress;
        bytes swapData;
    }

    function swapOutToken(
        address _sender, // user account send this transaction
        address _token, // src token
        bytes memory _to, // receiver account
        uint256 _amount, // token amount
        uint256 _toChain, // target chain id
        bytes calldata _bridgeData
    ) external payable returns (bytes32 orderId);

    function depositToken(address _token, address to, uint256 _amount) external payable;

    function getNativeFee(address _token, uint256 _gasLimit, uint256 _toChain) external view returns (uint256);

    event Relay(bytes32 orderId1, bytes32 orderId2);

    // todo: add native fee and base fee
    event CollectFee(bytes32 indexed orderId, address indexed token, uint256 value);

    event SwapOut(
        bytes32 indexed orderId, // orderId
        uint256 indexed tochain, // to chain
        address indexed token, // token to across chain
        uint256 amount, // amount to transfer
        address from, // account send this transaction
        address caller, // msg.sender call swapOutToken
        bytes to, // account receiver on target chain
        bytes outToken, // token bridge to target chain(token is native this maybe wtoken)
        uint256 gasLimit, // gasLimit for call on target chain
        uint256 messageFee // native amount for pass message
    );

    event SwapIn(
        bytes32 indexed orderId, // orderId
        uint256 indexed fromChain, // from chain
        address indexed token, // token received on target chain
        uint256 amount, // target token amount
        address to, // account receiver on target chain
        address outToken, //
        bytes from // from chain account send this transaction
    );
}
