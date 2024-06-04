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
        address _sender,   // user account send this transation
        address _token,    // src token
        bytes memory _to,  // receiver account
        uint256 _amount,   // token amount
        uint256 _toChain,  // target chain id
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
        bytes32 indexed orderId, // orderId
        uint256 indexed tochain, // to chain
        address indexed token,   // token to across chain 
        uint256 amount,          // amount to transfer
        address from,            // account send this transation
        address caller,          // msg.sender call swapOutToken
        bytes to,                // account receiver on target chain
        bytes outToken,          // token bridge to target chain(token is native this maybe wtoken)
        uint256 gasLimit,        // gasLimit for call on target chain 
        uint256 messageFee       // native amount for pass message  
    );

    event SwapIn(
        bytes32 indexed orderId,  // orderId
        uint256 indexed fromChain,// from chain
        address indexed token,    // token received on target chain
        uint256 amount,           // target token amount 
        address to,               // account receiver on target chain  
        bytes from                // from chain account send this transation
    );
}
