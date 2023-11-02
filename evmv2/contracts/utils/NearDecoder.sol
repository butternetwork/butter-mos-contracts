// SPDX-License-Identifier: MIT

pragma solidity 0.8.7;

import "@mapprotocol/protocol/contracts/utils/Utils.sol";
import "@mapprotocol/protocol/contracts/lib/RLPReader.sol";
import "../interface/IEvent.sol";

library NearDecoder {
    using RLPReader for bytes;
    using RLPReader for RLPReader.RLPItem;

    bytes32 constant NEAR_DEPOSITOUT = 0x3ad224e3e42a516df08d1fca74990eac30205afb5287a46132a6975ce0b2cede;
    bytes32 constant NEAR_SWAPOUT = 0x525e2d5d6e874e1f98c7b3e9a12be276d31598c25f92fb38ce6af0c1591371c4;

    function decodeNearSwapLog(bytes memory logsHash)
        internal
        pure
        returns (bytes memory executorId, IEvent.swapOutEvent[] memory _outEvents)
    {
        RLPReader.RLPItem[] memory ls = logsHash.toRlpItem().toList();

        require(ls.length >= 2, "logsHash length to low");

        executorId = ls[0].toBytes();

        bytes[] memory logs = new bytes[](ls[1].toList().length);
        for (uint256 i = 0; i < ls[1].toList().length; i++) {
            logs[i] = ls[1].toList()[i].toBytes();
        }
        bytes memory log;

        _outEvents = new IEvent.swapOutEvent[](logs.length);
        for (uint256 i = 0; i < logs.length; i++) {
            bytes memory temp = Utils.splitExtra(logs[i]);
            if (keccak256(temp) == NEAR_SWAPOUT) {
                log = Utils.hexStrToBytes(logs[i]);
                RLPReader.RLPItem[] memory logList = log.toRlpItem().toList();

                require(logList.length >= 8, "logsHash length to low");

                IEvent.swapOutEvent memory _outEvent = IEvent.swapOutEvent({
                    fromChain: logList[0].toUint(),
                    toChain: logList[1].toUint(),
                    orderId: bytes32(logList[2].toBytes()),
                    token: logList[3].toBytes(),
                    from: logList[4].toBytes(),
                    to: logList[5].toBytes(),
                    amount: logList[6].toUint(),
                    swapData: logList[7].toBytes()
                });
                _outEvents[i] = _outEvent;
            }
        }
    }

    function decodeNearDepositLog(bytes memory logsHash)
        internal
        pure
        returns (bytes memory executorId, IEvent.depositOutEvent[] memory _outEvents)
    {
        RLPReader.RLPItem[] memory ls = logsHash.toRlpItem().toList();
        require(ls.length >= 2, "logsHash length to low");

        executorId = ls[0].toBytes();

        bytes[] memory logs = new bytes[](ls[1].toList().length);
        for (uint256 i = 0; i < ls[1].toList().length; i++) {
            logs[i] = ls[1].toList()[i].toBytes();
        }
        bytes memory log;

        _outEvents = new IEvent.depositOutEvent[](logs.length);

        for (uint256 i = 0; i < logs.length; i++) {
            bytes memory temp = Utils.splitExtra(logs[i]);
            if (keccak256(temp) == NEAR_DEPOSITOUT) {
                log = Utils.hexStrToBytes(logs[i]);
                RLPReader.RLPItem[] memory logList = log.toRlpItem().toList();

                require(logList.length >= 7, "logsHash length to low");

                IEvent.depositOutEvent memory _outEvent = IEvent.depositOutEvent({
                    fromChain: logList[0].toUint(),
                    toChain: logList[1].toUint(),
                    orderId: bytes32(logList[2].toBytes()),
                    token: logList[3].toBytes(),
                    from: logList[4].toBytes(),
                    to: logList[5].toBytes(),
                    amount: logList[6].toUint()
                });
                _outEvents[i] = _outEvent;
            }
        }
    }
}
