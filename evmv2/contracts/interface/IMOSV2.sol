// SPDX-License-Identifier: MIT

pragma solidity 0.8.7;

// here we specified the length of 5 cuz the miximum swap route is 5
uint8 constant MAX_SWAP_ROUTE_SIZE = 5;
struct SwapData {
    uint256[MAX_SWAP_ROUTE_SIZE] amountInArr;
    uint256[MAX_SWAP_ROUTE_SIZE] minAmountOutArr;
    bytes[MAX_SWAP_ROUTE_SIZE] pathArr; // 0xtokenin+0xtokenOut
    uint8[MAX_SWAP_ROUTE_SIZE] routerIndex; // 0 uniswa router addre, 1 sushi router
    bytes targetToken;
}

interface IMOSV2 {
    function transferOutToken(address _token, bytes memory _to, uint _amount, uint _toChain) external;
    function transferOutNative(bytes memory _to, uint _toChain) external payable;
    function depositToken(address _token, address to, uint _amount) external;
    function depositNative(address _to) external payable ;


    event mapTransferOut(uint256 indexed fromChain, uint256 indexed toChain, bytes32 orderId,
        bytes token, bytes from, bytes to, uint256 amount, bytes toChainToken);

    event mapTransferIn(uint256 indexed fromChain, uint256 indexed toChain, bytes32 orderId,
        address token, bytes from,  address to, uint256 amount);

    event mapSwapOut(
        bytes token, // source chain token
        bytes from, // source chain from address
        uint256 fromChain, // from chain
        uint256 toChain, // to chain
        bytes toAddress, // toAddress
        address mapTargetToken, // target token on map if source chain is not map
        SwapData swapData, // swap data, used on target chain dex.
        bytes32 orderId // order id
    );

    event mapSwapIn(
        address indexed toToken,
        bytes from,
        bytes32 indexed orderId,
        uint256 fromChain,
        address to,
        uint256 amountOut
    );

    event mapDepositOut(uint256 indexed fromChain, uint256 indexed toChain, bytes32 orderId,
        address token, bytes from, address to, uint256 amount);
}