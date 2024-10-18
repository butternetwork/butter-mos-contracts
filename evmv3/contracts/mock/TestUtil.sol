// SPDX-License-Identifier: MIT

pragma solidity 0.8.20;

import "../lib/EvmDecoder.sol";
import "hardhat/console.sol";
// import {MessageOutEvent, MessageInEvent} from "../lib/Types.sol";

contract TestUtil {
     function decodeMessageOut(
        ILightVerifier.txLog memory log
    ) external pure returns (bool result, MessageOutEvent memory outEvent) {
        (result, outEvent) = EvmDecoder.decodeMessageOut(log);
    }

    function decodeMessageRelay(
        ILightVerifier.txLog memory log
    ) external pure returns (bool result, MessageInEvent memory outEvent) {
        (result, outEvent) = EvmDecoder.decodeMessageRelay(log);
    }

    function getChainAndGasLimit(
        uint256 _fromChain,
        uint256 _toChain,
        uint256 _gasLimit
    ) external pure returns (bytes32 chainAndGasLimit) {
        chainAndGasLimit = bytes32(((_fromChain << 192) | (_toChain << 128) | _gasLimit));
    }

    function encodeTxLog(ILightVerifier.txLog memory log) external pure returns(bytes memory receiptProof){
          receiptProof = abi.encode(log);
    }
}