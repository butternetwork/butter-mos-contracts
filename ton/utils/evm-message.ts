// JS Encoder
import { Cell, beginCell } from '@ton/core';
import { PayloadCodec } from './payload';

export class MessageEncoder {
    encode(hexData: string): Cell {
        if (!hexData.startsWith('0x')) {
            throw new Error('Hex data must start with 0x');
        }

        // Remove 0x prefix
        const data = Buffer.from(hexData.slice(2), 'hex');

        // First 32 bytes: offset
        // Next 32 bytes: length
        const offset = data.subarray(0, 32);
        const length = data.subarray(32, 64);
        // Real message data starts from byte 64
        let pos = 64;

        // Build metadata cell with offset and length
        const metadataCell = beginCell()
            .storeBuffer(offset) // 32 bytes offset
            .storeBuffer(length); // 32 bytes length

        // Read header fields
        const version = data[pos++];
        const relay = data[pos++];
        const tokenLen = data[pos++];
        const mosLen = data[pos++];
        const fromLen = data[pos++];
        const toLen = data[pos++];
        const payloadLen = (data[pos++] << 8) | data[pos++]; // 2 bytes
        // console.table([version, relay, tokenLen, mosLen, fromLen, toLen, payloadLen]);

        // Read reserved (8 bytes)
        const reserved = data.subarray(pos, pos + 8);
        pos += 8;

        // Read token amount (16 bytes)
        const tokenAmount = data.subarray(pos, pos + 16);
        pos += 16;

        // Read addresses and payload
        const tokenAddr = data.subarray(pos, pos + tokenLen);
        pos += tokenLen;

        const mosTarget = data.subarray(pos, pos + mosLen);
        pos += mosLen;

        const fromAddr = data.subarray(pos, pos + fromLen);
        pos += fromLen;

        const toAddr = data.subarray(pos, pos + toLen);
        pos += toLen;

        const payload = data.subarray(pos, pos + payloadLen);

        // console.log('tokenAddr', tokenAddr.toString('hex'));
        // console.log('mosTarget', mosTarget.toString('hex'));
        // console.log('fromAddr', fromAddr.toString('hex'));
        // console.log('toAddr', toAddr.toString('hex'));

        // Build header cell
        const headerCell = beginCell()
            .storeUint(version, 8)
            .storeUint(relay, 8)
            .storeUint(tokenLen, 8)
            .storeUint(mosLen, 8)
            .storeUint(fromLen, 8)
            .storeUint(toLen, 8)
            .storeUint(payloadLen, 16)
            .storeBuffer(reserved) // 8 bytes reserved
            .storeBuffer(tokenAmount); // 16 bytes token amount

        // Build addresses cell
        const tokenMosCell = beginCell().storeBuffer(tokenAddr).storeBuffer(mosTarget);

        // Build from/to addresses cell
        const fromToCell = beginCell().storeBuffer(fromAddr).storeBuffer(toAddr);

        // Build payload cell
        const coder = new PayloadCodec();
        const payloadCell = coder.encode('0x' + payload.toString('hex'));

        // Link all cells together with metadata at root
        return beginCell()
            .storeRef(beginCell().storeRef(metadataCell).storeRef(headerCell).endCell())
            .storeRef(tokenMosCell)
            .storeRef(fromToCell)
            .storeRef(payloadCell)
            .endCell();
    }
}
