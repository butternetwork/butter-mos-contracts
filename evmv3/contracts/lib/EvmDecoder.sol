// SPDX-License-Identifier: MIT

pragma solidity 0.8.20;

import "@mapprotocol/protocol/contracts/interface/ILightVerifier.sol";
import { SwapOutEvent, DepositOutEvent } from "./Types.sol";

library EvmDecoder {
    bytes32 constant DEPOSITOUT_TOPIC =
        keccak256(bytes("DepositOut(uint256,uint256,bytes32,address,address,address,uint256)"));
    bytes32 constant MESSAGE_OUT_TOPIC =
        keccak256(bytes("MessageOut(bytes32,uint256,address,bytes)"));

    function decodeMessageOut(
        ILightVerifier.txLog memory log
    ) internal pure returns (SwapOutEvent memory outEvent) {
        uint256 chainAndGasLimit;
        address from;
        bytes memory messageData;
        (outEvent.orderId, chainAndGasLimit, from, messageData) = abi.decode(
            log.data,
            (bytes32, uint256, address, bytes)
        );
        outEvent.fromChain = chainAndGasLimit >> 192;
        outEvent.toChain = (chainAndGasLimit << 64) >> 192;
        outEvent.gasLimit = uint256(uint64(chainAndGasLimit));
        outEvent.from = abi.encodePacked(from);
        address mos;
        address token;
        (mos, token, outEvent.amount, outEvent.to, outEvent.swapData) = abi.decode(messageData, (address,address,uint256,bytes,bytes));
        outEvent.mosOrRelay = abi.encodePacked(mos);
        outEvent.token = abi.encodePacked(token);
    }

    function decodeDepositOutLog(
        ILightVerifier.txLog memory log
    ) internal pure returns (DepositOutEvent memory depositEvent) {
        depositEvent.fromChain = uint256(log.topics[1]);
        depositEvent.toChain = uint256(log.topics[2]);
        address token;
        address from;
        address to;
        address relay;
        (depositEvent.orderId, token,relay, from, to, depositEvent.amount) = abi.decode(
            log.data,
            (bytes32, address, address, address, address, uint256)
        );
        depositEvent.token = abi.encodePacked(token);
        depositEvent.from = abi.encodePacked(from);
        depositEvent.to = abi.encodePacked(to);
        depositEvent.mosOrRelay = abi.encodePacked(relay);
    }
}
