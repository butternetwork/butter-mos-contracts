// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface IButterBridgeV3 {

    function swapOutToken(
        address _sender, // user account send this transaction
        address _token, // src token
        bytes memory _to, // receiver account
        uint256 _amount, // token amount
        uint256 _toChain, // target chain id
        bytes calldata _bridgeData
    ) external payable returns (bytes32 orderId);

    function depositToken(address _token, address _to, uint256 _amount) external payable returns (bytes32 orderId);

    function transferOut(
        uint256 _toChain,
        bytes memory _messageData,
        address _feeToken
    ) external payable returns (bytes32);

    function bridgeIn(
        uint256 _chainId,
        uint256 _logIndex,
        bytes32 _orderId,
        bytes memory _receiptProof
    ) external;

    event CollectFee(bytes32 indexed orderId, address indexed token, uint256 value);

    event MessageOut(
        bytes32 orderId,
        // fromChain (8 bytes) | toChain (8 bytes) | reserved (8 bytes) | gasLimit (8 bytes)
        uint256 chainAndGasLimit, 
        address from,
        // abi.encode(address(mosRelay), address(token), amount, bytes(to), bytes(message))
        bytes messageData  
    );

    event MessageRelay(
        bytes32 orderId,
        // fromChain (8 bytes) | toChain (8 bytes) | reserved (8 bytes) | gasLimit (8 bytes)
        uint256 chainAndGasLimit,
        bytes messageData   // abi.encode(address(mos), address(token), amount, address(to), bytes(from), bytes(message))
    );

    //   packed message data
    //   version (1 bytes), majorVersion(4bit) | minorVersion(4bit), same major version means the same structure
    //   relay (1 bytes)
    //   token len (1 bytes)
    //   mos len (1 bytes)
    //   from len (1 bytes)
    //   to len (1 bytes)
    //   payload len (2 bytes)
    //   reserved (8 bytes)
    //   token amount (16 bytes)
    //
    //   token address (tokenLen bytes)
    //   mos target (targetLen bytes)
    //   from address (fromLen bytes)
    //   to address (toLen bytes)
    //   payload (payloadLen bytes)
    event MessageRelayPacked(
        bytes32 orderId,
        uint256 chainAndGasLimit,
        bytes messageData
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
