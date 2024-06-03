// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface IButterBridgeV3 {
    enum OutType {
        SWAP,
        DEPOSIT,
        INTER_TRANSFER
    }

    struct BridgeParam {
        uint256 gasLimit;
        bytes refundAddress;
        bytes swapData;
    }

    function swapOutToken(
        address _sender,
        address _token, // src token
        bytes memory _to,
        uint256 _amount,
        uint256 _toChain, // target chain id
        bytes calldata _swapData
    ) external payable returns (bytes32 orderId);

    function depositToken(address _token, address to, uint256 _amount) external payable;

    function getOrderStatus(
        uint256 _chainId,
        uint256 _blockNum,
        bytes32 _orderId
    ) external view returns (bool exists, bool verifiable, uint256 nodeType);

    function getNativeFee(
        address _token,
        uint256 _gasLimit,
        uint256 _toChain,
        OutType _outType
    ) external view returns (uint256);

    event Relay(bytes32 orderId1, bytes32 orderId2);

    event CollectFee(bytes32 indexed orderId, address indexed token, uint256 value);

    event DepositOut(
        uint256 indexed fromChain,
        uint256 indexed toChain,
        bytes32 orderId,
        address token,
        bytes from,
        address to,
        uint256 amount
    );

    event SwapOut(
        uint256 indexed fromChain, // from chain
        uint256 indexed toChain, // to chain
        bytes32 orderId, // order id
        bytes token, // token to transfer
        bytes from, // source chain from address
        bytes to,
        uint256 amount,
        bytes swapData // swap data, used on target chain dex.
    );

    event SwapIn(
        uint256 indexed fromChain,
        uint256 indexed toChain,
        bytes32 indexed orderId,
        address token,
        bytes from,
        address toAddress,
        uint256 amountOut
    );
}
