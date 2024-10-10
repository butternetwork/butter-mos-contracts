// SPDX-License-Identifier: MIT

pragma solidity 0.8.20;

import "@mapprotocol/protocol/contracts/lib/RLPReader.sol";
import { SwapOutEvent, DepositOutEvent } from "./Types.sol";

library NearDecoder {
    using RLPReader for bytes;
    using RLPReader for RLPReader.RLPItem;
    
    bytes32 constant NEAR_DEPOSITOUT = 0x3ad224e3e42a516df08d1fca74990eac30205afb5287a46132a6975ce0b2cede;
    bytes32 constant NEAR_SWAPOUT = 0x525e2d5d6e874e1f98c7b3e9a12be276d31598c25f92fb38ce6af0c1591371c4;

    
    error invalid_input();
    error logs_length_too_low();
    error Invalid_extra_result_type();
    
    function getTopic(bytes memory logsHash,uint256 logIndex) internal pure returns (bytes memory executorId, bytes32 topic, bytes memory logs) {
        RLPReader.RLPItem[] memory ls = logsHash.toRlpItem().toList();
        if(ls.length < 2) revert logs_length_too_low();
        executorId = ls[0].toBytes();
        logs = ls[1].toList()[logIndex].toBytes();
        bytes memory temp = splitExtra(logs);
        topic = keccak256(temp);
    }
    function decodeNearSwapLog(
        bytes memory log
    ) internal pure returns (SwapOutEvent memory _outEvent) {
        bytes memory logByts = hexStrToBytes(log);
        RLPReader.RLPItem[] memory logList = logByts.toRlpItem().toList();
        if(logList.length < 9) revert logs_length_too_low();
        _outEvent = SwapOutEvent({
            fromChain: logList[0].toUint(),
            toChain: logList[1].toUint(),
            orderId: bytes32(logList[2].toBytes()),
            token: logList[3].toBytes(),
            from: logList[4].toBytes(),
            to: logList[5].toBytes(),
            amount: logList[6].toUint(),
            swapData: logList[7].toBytes(),
            mosOrRelay: logList[8].toBytes(),
            gasLimit: 0
        });
    }

    function decodeNearDepositLog(
        bytes memory log
    ) internal pure returns (DepositOutEvent memory _outEvent) {
        bytes memory logByts = hexStrToBytes(log);
        RLPReader.RLPItem[] memory logList = logByts.toRlpItem().toList();
        if(logList.length < 8) revert logs_length_too_low();
        _outEvent = DepositOutEvent({
            fromChain: logList[0].toUint(),
            toChain: logList[1].toUint(),
            orderId: bytes32(logList[2].toBytes()),
            token: logList[3].toBytes(),
            from: logList[4].toBytes(),
            to: logList[5].toBytes(),
            amount: logList[6].toUint(),
            mosOrRelay: logList[7].toBytes()
        });
    }


    function splitExtra(bytes memory extra) internal pure returns (bytes memory newExtra) {
        if(extra.length < 64) revert Invalid_extra_result_type();
        newExtra = new bytes(64);
        for (uint256 i = 0; i < 64; i++) {
            newExtra[i] = extra[i];
        }
    }

    function hexStrToBytes(bytes memory _hexStr) internal pure returns (bytes memory) {
        //Check hex string is valid
        if (_hexStr.length % 2 != 0 || _hexStr.length < 4) {
            revert invalid_input();
        }

        bytes memory bytes_array = new bytes(_hexStr.length / 2 - 32);

        for (uint256 i = 64; i < _hexStr.length; i += 2) {
            uint8 tetrad1 = 16;
            uint8 tetrad2 = 16;

            //left digit
            if (uint8(_hexStr[i]) >= 48 && uint8(_hexStr[i]) <= 57) tetrad1 = uint8(_hexStr[i]) - 48;

            //right digit
            if (uint8(_hexStr[i + 1]) >= 48 && uint8(_hexStr[i + 1]) <= 57) tetrad2 = uint8(_hexStr[i + 1]) - 48;

            //left A->F
            if (uint8(_hexStr[i]) >= 65 && uint8(_hexStr[i]) <= 70) tetrad1 = uint8(_hexStr[i]) - 65 + 10;

            //right A->F
            if (uint8(_hexStr[i + 1]) >= 65 && uint8(_hexStr[i + 1]) <= 70) tetrad2 = uint8(_hexStr[i + 1]) - 65 + 10;

            //left a->f
            if (uint8(_hexStr[i]) >= 97 && uint8(_hexStr[i]) <= 102) tetrad1 = uint8(_hexStr[i]) - 97 + 10;

            //right a->f
            if (uint8(_hexStr[i + 1]) >= 97 && uint8(_hexStr[i + 1]) <= 102) tetrad2 = uint8(_hexStr[i + 1]) - 97 + 10;

            //Check all symbols are allowed
            if (tetrad1 == 16 || tetrad2 == 16) revert invalid_input();

            bytes_array[i / 2 - 32] = bytes1(16 * tetrad1 + tetrad2);
        }

        return bytes_array;
    }
}
