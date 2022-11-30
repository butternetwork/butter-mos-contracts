// SPDX-License-Identifier: MIT

pragma solidity 0.8.7;

import "./IEvent.sol";

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
        uint256 amount,
        bytes token, // source chain token
        bytes from, // source chain from address
        uint256 indexed fromChain, // from chain
        uint256 indexed toChain, // to chain
        address mapTargetToken, // target token on map if source chain is not map
        SwapData swapData, // swap data, used on target chain dex.
        bytes32 orderId // order id
    );

    event mapSwapIn(
        uint256 indexed fromChain,
        uint256 indexed toChain,
        address token,
        bytes from,
        address toAddress,
        uint256 amountOut,
        bytes32 indexed orderId
    );

    event mapDepositOut(uint256 indexed fromChain, uint256 indexed toChain, bytes32 orderId,
        address token, bytes from, address to, uint256 amount);
}