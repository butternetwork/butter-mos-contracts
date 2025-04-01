import { Address, beginCell, Cell, Contract,contractAddress, ContractProvider, Sender, SendMode, toNano } from '@ton/core';

export class JettonMinter implements Contract {
    constructor(
        readonly address: Address,
        readonly init?: { code: Cell; data: Cell }
    ) {}

    static createFromAddress(address: Address) {
        return new JettonMinter(address);
    }


    static createFromConfig(config: {
        adminAddress: Address;
        content: Cell;
        jettonWalletCode: Cell;
    }, code: Cell) {
        const data = beginCell()
            .storeCoins(0)              // total_supply
            .storeAddress(config.adminAddress)  // admin_address
            .storeRef(config.content)    // content
            .storeRef(config.jettonWalletCode)  // jetton_wallet_code
            .endCell();

        return new JettonMinter(
            contractAddress(0, { code, data }),  
            { code, data }
        );
    }


    async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().endCell(),
        });
    }


    async sendMint(
        provider: ContractProvider,
        via: Sender,
        params: {
            value: bigint;
            to: Address;
            amount: bigint;
            forward_ton_amount: bigint;
            forward_payload: Cell;
        }
    ) {
      
        const master_msg = beginCell()
            .storeUint(0x178d4519, 32)     // op::internal_transfer = 0x178d4519
            .storeUint(0, 64)              // query_id
            .storeCoins(params.amount)      // amount of jettons
            .storeAddress(this.address)     // from_address (minter address)
            .storeAddress(params.to)        // response_address
            .storeCoins(0n)                 // forward_ton_amount
            .storeBit(0)                    // forward_payload in this slice
            .storeBit(0)                    // no forward_payload
            .endCell();
    
        await provider.internal(via, {
            value: params.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(21, 32)          // op::mint = 21
                .storeUint(0, 64)           // query_id
                .storeAddress(params.to)     // to
                .storeCoins(toNano('0.1'))  // amount of TONs to deploy wallet
                .storeRef(master_msg)       // master_msg with jetton amount
                .endCell(),
        });
    }


    async getWalletAddress(
        provider: ContractProvider,
        owner: Address
    ): Promise<Address> {
        const { stack } = await provider.get('get_wallet_address', [
            { type: 'slice', cell: beginCell().storeAddress(owner).endCell() }
        ]);
        return stack.readAddress();
    }


    async getMinterData(provider: ContractProvider) {
        const { stack } = await provider.get('get_jetton_data', []);
        return {
            totalSupply: stack.readBigNumber(),
            mintable: stack.readBoolean(),
            adminAddress: stack.readAddress(),
            content: stack.readCell(),
            walletCode: stack.readCell()
        };
    }

    async sendChangeAdmin(
        provider: ContractProvider,
        via: Sender,
        params: {
            value: bigint;
            newAdmin: Address;
        }
    ) {
        await provider.internal(via, {
            value: params.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(3, 32)           // op::change_admin = 3
                .storeUint(0, 64)           // query_id
                .storeAddress(params.newAdmin)
                .endCell(),
        });
    }

    async sendChangeContent(
        provider: ContractProvider,
        via: Sender,
        params: {
            value: bigint;
            content: Cell;
        }
    ) {
        await provider.internal(via, {
            value: params.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(4, 32)           // op::change_content = 4
                .storeUint(0, 64)           // query_id
                .storeRef(params.content)
                .endCell(),
        });
    }
}