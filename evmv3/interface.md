# Use butter to transfer an asset across blockchains.

## interface

    IButterBridgeV3

```solidity

interface IButterBridgeV3 {

    struct BridgeParam {
        uint256 gasLimit;
        bytes refundAddress;
        bytes swapData;
    }

    function swapOutToken(
        address _sender,   // user account send this transation
        address _token,    // src token
        bytes memory _to,  // receiver account (if _swapData not empty _to must contract who implement IButterReceiver)
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
        uint256 _toChain
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

```

IButterReceiver

```solidity
interface IButterReceiver {
    //_srcToken received token (wtoken or erc20 token)
    function onReceived(
        bytes32 _orderId,       // order Id
        address _srcToken,      // received token
        uint256 _amount,        // received token amount
        uint256 _fromChain,     // from chain
        bytes calldata _from,   // from account
        bytes calldata _payload // call data
    ) external;
}
```

First determine the swap native fee, then call swapOutToken() to transfer the asset to the destination chain.

```solidity
IButterBridgeV3(brdige).getNativeFee(
        address _token,
        uint256 _gasLimit, // gasLimit call IButterReceiver.onReceived() if not need call set 0
        uint256 _toChain
    )

```

then (pass native fee for value)

```solidity
IButterBridgeV3(brdige).swapOutToken(
        address _sender, // initiator address
        address _token,  // src token (zero address for native token)
        bytes memory _to,// receiver on target chain (if _swapData not empty _to must contract who implement IButterReceiver)
        uint256 _amount, // token amount 
        uint256 _toChain, // target chain id
        bytes calldata _swapData
    ) external payable 
```

_swapData  if need call contract on target chain    otherwise set '0x' for it

how to get _swapData ?

```js
let BridgeParam = {
        gasLimit: 100000, // gas limit called by IButterReceiver
        refundAddress: wallet.address, // for src token is OmniToken to receiver refund native fee on target chain
        swapData: swapData, // IButterReceiver -> onReceived -> _payload
    };
let _swapData = ethers.utils.defaultAbiCoder.encode(
        ["tuple(uint256,bytes,bytes)"],
        [[BridgeParam.gasLimit, BridgeParam.refundAddress, BridgeParam.swapData]]
    );
```

attention please  if  you want to call contract on target chain must make sure parameter _to is contract and implement IButterReceiver.
