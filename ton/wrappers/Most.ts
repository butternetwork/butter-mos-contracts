import {
    Address,
    beginCell,
    BitBuilder,
    Cell,
    Contract,
    contractAddress,
    ContractProvider,
    Sender,
    SendMode,
} from '@ton/core';
import { Opcodes } from './Bridge';
import { PayloadCodec } from '../utils/payload';

export type MostConfig = {
    orderNonce: number;
};

export function mostConfigToCell(config: MostConfig): Cell {
    return beginCell()
        .storeUint(config.orderNonce, 256)
        .storeAddress(Address.parse('EQBAYsrbNBd0v2nWTis0lWhWHktMEELC9MCBYo1oJltLsI3U'))
        .endCell();
}

export class Most implements Contract {
    constructor(
        readonly address: Address,
        readonly init?: { code: Cell; data: Cell },
    ) {}

    static createFromAddress(address: Address) {
        return new Most(address);
    }

    static createFromConfig(config: MostConfig, code: Cell, workchain = 0) {
        const data = mostConfigToCell(config);
        const init = { code, data };
        return new Most(contractAddress(workchain, init), init);
    }

    async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().endCell(),
        });
    }

    async sendUpgradeCode(
        provider: ContractProvider,
        via: Sender,
        opts: {
            value: bigint;
            code: Cell;
        },
    ) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().storeUint(Opcodes.upgradeCode, 32).storeUint(0, 64).storeRef(opts.code).endCell(),
        });
    }

    async sendMapoExecute(
        provider: ContractProvider,
        via: Sender,
        opts: {
            value: bigint;
        },
    ) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(Opcodes.mapoExecute, 32)
                .storeUint(0, 64)
                .storeUint(1, 64)
                .storeUint(64, 64)
                .storeAddress(Address.parse('EQBAYsrbNBd0v2nWTis0lWhWHktMEELC9MCBYo1oJltLsI3U'))
                .storeUint(10020, 256)
                .storeRef(
                    new PayloadCodec().encode(
                        '0x1de78eb8658305a581b2f1610c96707b0204d5cba6a782b313672045fa5a87c800000000000000000000000000000000000000000000000000000000000000400000000000000000000000000000000000000000000000000000000000000120000000000000000000000000000000000000000000000000000000000000008000000000000000000000000000000000000000000000000000000000000000c0000000000000000000000000000000000000000000000000016345785d8a00000000000000000000000000000000000000000000000000000000000000000012000000000000000000000000000000000000000000000000000000000000001449d6dae5d59b3af296df35bdc565371c8a563ef6000000000000000000000000000000000000000000000000000000000000000000000000000000000000002100692c4f42f3b4fde870f4055cd7c4831cdffa51e7e6d33dd8a1086cc0db53538e00000000000000000000000000000000000000000000000000000000000000',
                    ),
                )
                .endCell(),
        });
    }

    async sendSetJettonMaster(
        provider: ContractProvider,
        via: Sender,
        opts: {
            value: bigint;
            jettonMasterAddress: Address;
        },
    ) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(Opcodes.setJettonMaster, 32) // You'll need to add this opcode
                .storeUint(0, 64)
                .storeAddress(opts.jettonMasterAddress)
                .endCell(),
        });
    }
    async getOrderNonce(provider: ContractProvider) {
        const result = await provider.get('get_order_nonce', []);
        return result.stack.readNumber();
    }
}
