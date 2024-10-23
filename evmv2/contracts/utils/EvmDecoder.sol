// SPDX-License-Identifier: MIT

pragma solidity 0.8.20;

import "@mapprotocol/protocol/contracts/utils/Utils.sol";
import "@mapprotocol/protocol/contracts/interface/ILightVerifier.sol";
import "../interface/IEvent.sol";

library EvmDecoder {
    bytes32 constant MAP_DEPOSITOUT_TOPIC =
        keccak256(bytes("mapDepositOut(uint256,uint256,bytes32,address,bytes,address,uint256)"));
    bytes32 constant MAP_SWAPOUT_TOPIC =
        keccak256(bytes("mapSwapOut(uint256,uint256,bytes32,bytes,bytes,bytes,uint256,bytes)"));

    function decodeSwapOutLog(
        ILightVerifier.txLog memory log
    ) internal pure returns (IEvent.swapOutEvent memory outEvent) {
        outEvent.fromChain = uint256(log.topics[1]);
        outEvent.toChain = uint256(log.topics[2]);

        (outEvent.orderId, outEvent.token, outEvent.from, outEvent.to, outEvent.amount, outEvent.swapData) = abi.decode(
            log.data,
            (bytes32, bytes, bytes, bytes, uint256, bytes)
        );
    }

    function decodeDepositOutLog(
        ILightVerifier.txLog memory log
    ) internal pure returns (bytes memory executorId, IEvent.depositOutEvent memory depositEvent) {
        executorId = Utils.toBytes(log.addr);

        depositEvent.fromChain = uint256(log.topics[1]);
        depositEvent.toChain = uint256(log.topics[2]);

        address token;
        address toAddress;
        (depositEvent.orderId, token, depositEvent.from, toAddress, depositEvent.amount) = abi.decode(
            log.data,
            (bytes32, address, bytes, address, uint256)
        );

        depositEvent.token = Utils.toBytes(token);
        depositEvent.to = Utils.toBytes(toAddress);
    }
}
