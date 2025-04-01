// wrappers/Jetton.ts
import { Address, beginCell, Cell, Contract, contractAddress, ContractProvider, Sender, SendMode } from '@ton/core';

export type JettonConfig = {
    adminAddress: Address; // most contract address
    content: Cell;
    walletCode: Cell;
};

export function jettonConfigToCell(config: JettonConfig): Cell {
    return beginCell()
        .storeCoins(0) // total_supply
        .storeAddress(config.adminAddress)
        .storeRef(config.content)
        .storeRef(config.walletCode)
        .endCell();
}

export function buildJettonContent(params: { name: string; symbol: string; description: string; decimals: number }) {
    return beginCell()
        .storeUint(0x00, 8) // onchain format
        .storeStringRefTail(
            JSON.stringify({
                name: params.name,
                symbol: params.symbol,
                description: params.description,
                decimals: params.decimals,
            }),
        )
        .endCell();
}

export class Jetton implements Contract {
    constructor(
        readonly address: Address,
        readonly init?: { code: Cell; data: Cell },
    ) {}

    static createFromAddress(address: Address) {
        return new Jetton(address);
    }

    static createFromConfig(config: JettonConfig, code: Cell, workchain = 0) {
        const data = jettonConfigToCell(config);
        const init = { code, data };
        return new Jetton(contractAddress(workchain, init), init);
    }

    async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().endCell(),
        });
    }
}
