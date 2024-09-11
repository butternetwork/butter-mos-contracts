// SPDX-License-Identifier: MIT

pragma solidity 0.8.20;

import "@mapprotocol/protocol/contracts/utils/Utils.sol";
import "@mapprotocol/protocol/contracts/lib/RLPReader.sol";
import "../interface/IEvent.sol";

library EvmDecoder {
    using RLPReader for bytes;
    using RLPReader for RLPReader.RLPItem;

    bytes32 constant MAP_DEPOSITOUT_TOPIC =
        keccak256(bytes("mapDepositOut(uint256,uint256,bytes32,address,bytes,address,uint256)"));
    bytes32 constant MAP_SWAPOUT_TOPIC =
        keccak256(bytes("mapSwapOut(uint256,uint256,bytes32,bytes,bytes,bytes,uint256,bytes)"));

    function decodeTxLogs(bytes memory logsHash) internal pure returns (IEvent.txLog[] memory _txLogs) {
        RLPReader.RLPItem[] memory ls = logsHash.toRlpItem().toList();
        _txLogs = new IEvent.txLog[](ls.length);
        for (uint256 i = 0; i < ls.length; i++) {
            _txLogs[i] = _decodeTxLog(ls[i]);
        }
    }

    function decodeTxLog(bytes memory logsHash, uint256 logIndex) internal pure returns (IEvent.txLog memory _txLog) {
        RLPReader.RLPItem memory ls = logsHash.toRlpItem().safeGetItemByIndex(logIndex);
        _txLog = _decodeTxLog(ls);
    }

    function _decodeTxLog(RLPReader.RLPItem memory item) private pure returns (IEvent.txLog memory _txLog) {
        RLPReader.RLPItem[] memory items = item.toList();
        require(items.length >= 3, "log length to low");
        RLPReader.RLPItem[] memory firstItemList = items[1].toList();
        bytes32[] memory topic = new bytes32[](firstItemList.length);
        for (uint256 j = 0; j < firstItemList.length; j++) {
            topic[j] = firstItemList[j].toBytes32();
        }
        _txLog = IEvent.txLog({addr: items[0].toAddress(), topics: topic, data: items[2].unsafeToBytes()});
    }

    function decodeSwapOutLog(
        IEvent.txLog memory log
    ) internal pure returns (IEvent.swapOutEvent memory outEvent) {
        // executorId = Utils.toBytes(log.addr);
        //outEvent.fromChain = abi.decode(log.topics[1], (uint256));
        //outEvent.toChain = abi.decode(log.topics[2], (uint256));
        outEvent.fromChain = uint256(log.topics[1]);
        outEvent.toChain = uint256(log.topics[2]);

        (outEvent.orderId, outEvent.token, outEvent.from, outEvent.to, outEvent.amount, outEvent.swapData) = abi.decode(
            log.data,
            (bytes32, bytes, bytes, bytes, uint256, bytes)
        );
    }

    function decodeDepositOutLog(
        IEvent.txLog memory log
    ) internal pure returns (bytes memory executorId, IEvent.depositOutEvent memory depositEvent) {
        executorId = Utils.toBytes(log.addr);

        //depositEvent.fromChain = abi.decode(log.topics[1], (uint256));
        //depositEvent.toChain = abi.decode(log.topics[2], (uint256));
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
