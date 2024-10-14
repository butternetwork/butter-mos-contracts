// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface IButterBridgeV3 {
    struct BridgeParam {
        bool relay;
        address referrer;
        bytes32 transferId;
        uint256 gasLimit;
        bytes swapData;
    }

    function swapOutToken(
        address _initiator, // user account send this transaction
        address _token, // src token
        bytes memory _to, // receiver account
        uint256 _amount, // token amount
        uint256 _toChain, // target chain id
        bytes calldata _bridgeData
    ) external payable returns (bytes32 orderId);

    function depositToken(address _token, address _to, uint256 _amount) external payable returns (bytes32 orderId);

    event CollectFee(bytes32 indexed orderId, address indexed token, uint256 value);

    event MessageIn(
        bytes32 indexed orderId,
        uint256 indexed chainAndGasLimit, // fromChain (8 bytes) | toChain (8 bytes) | reserved (8 bytes) | gasLimit (8 bytes)
        address token,
        uint256 amount,
        address to,
        bytes from,
        bytes payload
    );

    event MessageOut(
        bytes32 indexed orderId,
        // fromChain (8 bytes) | toChain (8 bytes) | reserved (8 bytes) | gasLimit (8 bytes)
        uint256 indexed chainAndGasLimit,
        // address from,
        // abi.encode(version, mos, token, amount, from, bytes(to), bytes(message))
        bytes payload
    );

    event MessageRelay(
        bytes32 orderId,
        // fromChain (8 bytes) | toChain (8 bytes) | reserved (8 bytes) | gasLimit (8 bytes)
        uint256 chainAndGasLimit,
        bytes payload // abi.encode(version, mos, token, amount, to, bytes(from), bytes(message))
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
    event MessageRelayPacked(bytes32 orderId, uint256 chainAndGasLimit, bytes messageData);
}
