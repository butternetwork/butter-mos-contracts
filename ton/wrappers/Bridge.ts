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
    Slice,
} from '@ton/core';

export type BridgeConfig = {
    orderNonce: number;
    owner: Address;
};

export function bridgeConfigToCell(config: BridgeConfig): Cell {

    return beginCell()
        .storeUint(config.orderNonce, 256)
        .storeDict(null)
        .storeAddress(config.owner)
        .endCell();
}

export const Opcodes = {
    increase: 0x7e8764ef,
    messageIn: 0xd5f86120,
    messageOut: 0x136a3529,
    upgradeCode: 0xdbfaf817,
    testMapoExecute: 0x104dd201,
    mapoExecute: 0xa5b6af5b,
    setJettonMaster: 0x3b29cf9f,
    addToWhitelist:0x2baeb864,
    removeFromWhitelist:0x2a09a583,
    withdrawJetton: 0xf3154fa1,
};

export class Bridge implements Contract {
    constructor(
        readonly address: Address,
        readonly init?: { code: Cell; data: Cell },
    ) {}

    static createFromAddress(address: Address) {
        return new Bridge(address);
    }

    static createFromConfig(config: BridgeConfig, code: Cell, workchain = 0) {
        const data = bridgeConfigToCell(config);
        const init = { code, data };
        return new Bridge(contractAddress(workchain, init), init);
    }

    async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().endCell(),
        });
    }

    async sendMessageIn(
        provider: ContractProvider,
        via: Sender,
        opts: {
            value: bigint;
            hash: bigint;
            v: bigint;
            r: bigint;
            s: bigint;
            receiptRoot: bigint;
            version: bigint;
            blockNum: number;
            chainId: number;
            addr: bigint;
            topics: bigint[];
            message: Cell;
            expectedAddress: bigint;
        },
    ) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(Opcodes.messageIn, 32)
                .storeUint(0, 64)
                .storeUint(opts.hash ?? 0, 256)
                .storeUint(opts.expectedAddress, 160)
                .storeUint(1, 8) // signature number
                .storeRef(
                    beginCell()
                        .storeRef(
                            beginCell().storeUint(opts.v, 8).storeUint(opts.r, 256).storeUint(opts.s, 256).endCell(),
                        )
                        .storeRef(
                            beginCell().storeUint(opts.v, 8).storeUint(opts.r, 256).storeUint(opts.s, 256).endCell(),
                        )
                        .storeRef(
                            beginCell().storeUint(opts.v, 8).storeUint(opts.r, 256).storeUint(opts.s, 256).endCell(),
                        )
                        .endCell(),
                )
                .storeRef(
                    beginCell() // meta: receiptRoot, version, blockNum, chainId
                        .storeUint(opts.receiptRoot, 256)
                        .storeUint(opts.version, 256)
                        .storeUint(opts.blockNum, 256)
                        .storeUint(opts.chainId, 64)
                        .endCell(),
                )
                .storeRef(
                    beginCell() // MessageRelayPacked
                        .storeUint(opts.addr, 256)
                        .storeRef(
                            beginCell()
                                .storeUint(opts.topics[0], 256)
                                .storeUint(opts.topics[1], 256)
                                .storeUint(opts.topics[2], 256)
                                .endCell(),
                        )
                        .storeRef(opts.message)
                        .endCell(),
                )
                .endCell(),
        });
    }

    async sendMessageOut(
        provider: ContractProvider,
        via: Sender,
        opts: {
            value: bigint;
            relay: boolean;
            msgType: number;
            toChain: bigint;
            target: Slice;
            payload: Cell;
            initiator: Address;
            gasLimit: number;
        },
    ) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(Opcodes.messageOut, 32)
                .storeUint(0, 64)
                .storeUint(opts.relay ? 1 : 0, 8)
                .storeUint(opts.msgType, 8)
                .storeUint(opts.toChain, 64)
                .storeAddress(opts.initiator)
                .storeSlice(opts.target)
                .storeUint(opts.gasLimit, 64)
                .storeRef(opts.payload)
                .endCell(),
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

    async sendTestMapoExecute(
        provider: ContractProvider,
        via: Sender,
        opts: {
            value: bigint;
        },
    ) {
        const builder = new BitBuilder();

        builder.writeUint(2, 2);

        builder.writeUint(0, 1);

        builder.writeInt(0, 8);

        const addressHex = '93f46bff194047c851b516c214965070076f3b207692f0a1675ddf1a172f2877';

        const addressBuffer = Buffer.from(addressHex, 'hex');
        builder.writeBuffer(addressBuffer);

        console.log(builder.length);

        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(Opcodes.testMapoExecute, 32)
                .storeUint(0, 64)
                .storeBits(builder.build())
                .storeUint(50000000, 64)
                .storeRef(beginCell().endCell())
                .endCell(),
        });
    }

    async sendAddToWhitelist(
        provider: ContractProvider,
        via: Sender,
        opts: {
            value: bigint;
            tokenAddress: Address;
        }
    ) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(Opcodes.addToWhitelist, 32)
                .storeUint(0, 64)
                .storeAddress(opts.tokenAddress)
                .endCell(),
        });
    }

    async sendRemoveFromWhitelist(
        provider: ContractProvider,
        via: Sender,
        opts: {
            value: bigint;
            tokenAddress: Address;
        }
    ) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(Opcodes.removeFromWhitelist, 32)
                .storeUint(0, 64)
                .storeAddress(opts.tokenAddress)
                .endCell(),
        });
    }

    async sendWithdraw(
        provider: ContractProvider,
        via: Sender,
        opts: {
            value: bigint;
            jettonWalletAddress: Address;
            amount: bigint;
        }
    ) {
        await provider.internal(via, {
            value: opts.value,
            body: beginCell()
                .storeUint(Opcodes.withdrawJetton, 32)
                .storeUint(0, 64)  // query id
                .storeAddress(opts.jettonWalletAddress)
                .storeCoins(opts.amount)
                .endCell(),
        });
    }

    async getOrderNonce(provider: ContractProvider) {
        const result = await provider.get('get_order_nonce', []);
        return result.stack.readNumber();
    }

    async getOwner(provider: ContractProvider) {
        const result = await provider.get('get_owner', []);
        return result.stack.readAddress();
    }

    async getIsWhitelisted(provider: ContractProvider, tokenAddress: Address) {
        const { stack } = await provider.get('is_whitelisted', [
            { type: 'slice', cell: beginCell().storeAddress(tokenAddress).endCell() }
        ]);
        return stack.readNumber() === -1;
    }


    async getCodeHash(provider: ContractProvider){
        const state = await provider.getState();
        if (state.state.type !== 'active') {
            return BigInt(0);
        }
        const codeCell = state.state.code;
        if (!codeCell || !Buffer.isBuffer(codeCell)) {
            return BigInt(0);
        }
        return BigInt('0x' + codeCell.toString('hex'));
    }
}
