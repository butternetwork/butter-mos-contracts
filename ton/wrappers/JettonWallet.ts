import { Address, beginCell, Cell, Contract, ContractProvider, Sender, SendMode, toNano, Slice, } from '@ton/core';
import { Opcodes } from './Bridge';

export class JettonWallet implements Contract {
    constructor(
        readonly address: Address,
        readonly init?: { code: Cell; data: Cell }
    ) {}

    static createFromAddress(address: Address) {
        return new JettonWallet(address);
    }

    async sendTransfer(
        provider: ContractProvider,
        via: Sender,
        params: {
            value: bigint;
            toAddress: Address;
            amount: bigint;
            responseAddress: Address;
            forwardTonAmount: bigint;
            relay: boolean;
            msgType: number;
            toChain: bigint;
            initiator: Address;
            target: Slice;
            gasLimit: number;
            payload: Cell;
        }
    ) {

        await provider.internal(via, {
            value: params.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(0x0f8a7ea5, 32)    // op::transfer
                .storeUint(0, 64)             // query_id
                .storeCoins(params.amount)     
                .storeAddress(params.toAddress)
                .storeAddress(params.responseAddress)
                .storeBit(false)
                .storeCoins(params.forwardTonAmount)
                .storeBit(false)
                .storeRef(                               // forward_payload
                    beginCell()
                    .storeUint(Opcodes.messageOut, 32)
                    .storeUint(params.relay ? 1 : 0, 8)       // relay
                    .storeUint(params.msgType, 8)
                    .storeUint(params.toChain, 64)
                    .storeAddress(params.initiator)
                    .storeSlice(params.target)
                    .storeUint(params.gasLimit, 64)
                    .storeRef(params.payload)
                    .endCell()
                )            
                .endCell(),
        });
    }



    async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().endCell(),
        });
    }

    async getWalletData(provider: ContractProvider) {
        const { stack } = await provider.get('get_wallet_data', []);
        return {
            balance: stack.readBigNumber(),
            owner: stack.readAddress(),
            jettonMaster: stack.readAddress(),
            walletCode: stack.readCell()
        };
    }
}