import { Cell } from '@ton/core';
import { PayloadCodec } from './payload';

export const parseMessageOutEvent = (body: Cell) => {
    const slice = body.beginParse();
    const basic = slice.loadRef().beginParse();
    const relay = basic.loadUint(8);
    const msgType = basic.loadUint(8);
    const fromId = basic.loadUintBig(64);
    const toId = basic.loadUintBig(64);
    const gasLimit = basic.loadUintBig(64);
    const initiator = basic.loadUintBig(33 * 8);
    const sender = basic.loadUintBig(33 * 8);

    const ts = slice.loadRef().beginParse();
    const target = ts.loadStringTail();

    const payload = slice.loadRef();

    const meta = slice.loadRef().beginParse();
    const fullOrderIid = meta.loadUintBig(256);
    const mos = meta.loadUintBig(256);
    const token = meta.loadMaybeAddress();
    const tokenAmount = meta.loadUintBig(128);

    return {
        relay,
        msgType,
        fromId,
        toId,
        gasLimit,
        initiator,
        sender,
        target,
        payload,
        fullOrderIid,
        mos,
        token,
        tokenAmount,
    };
};
