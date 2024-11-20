// SPDX-License-Identifier: MIT
pragma solidity 0.8.25;


import { MessageOutEvent } from "./Types.sol";


library IsomericDecoder {
    
    bytes constant internal SOLANA_TOPIC = "";
    bytes constant internal TON_TOPIC = "";

    function getTopic(bytes memory log) internal pure returns (bytes memory addr, bytes memory topic, bytes memory bytesLog){
        (addr, topic, bytesLog) = abi.decode(log, (bytes,bytes,bytes));
    }
    
    function decodeMessageOut(bytes memory bytesLog) internal pure returns (MessageOutEvent memory outEvent) {
        outEvent = abi.decode(bytesLog, (MessageOutEvent));
    }
}