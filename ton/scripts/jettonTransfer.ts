import { Address, toNano, beginCell} from '@ton/core';
import { JettonWallet } from '../wrappers/JettonWallet';
import { NetworkProvider, sleep } from '@ton/blueprint';
import { PayloadCodec } from '../utils/payload';

export async function run(provider: NetworkProvider, args: string[]) {
    const ui = provider.ui();

    const walletAddress = Address.parse(args.length > 0 ? args[0] : await ui.input('Jetton wallet address'));


    const jettonWallet = provider.open(JettonWallet.createFromAddress(walletAddress));


    const toAddress = Address.parse('0QCnQHksCw6zKzvJSRxa6ItqrQrt0QTxAU1aO47KGFelH6fM');


    const amount = toNano('0.13')

    const target = '93f46bff194047c851b516c214965070076f3b20'

    const t = beginCell().storeBuffer(Buffer.from(target, 'hex')).endCell();


    await jettonWallet.sendTransfer(provider.sender(), {
        value: toNano('0.5'), 
        toAddress: toAddress,
        amount: amount,
        responseAddress: Address.parse('0QBpLE9C87T96HD0BVzXxIMc3_pR5-bTPdihCGzA21NTjgp6'),
        forwardTonAmount: toNano('0.2'),
        relay: false,
        msgType: 3,
        toChain: 11155111n,
        initiator: Address.parse('0QBpLE9C87T96HD0BVzXxIMc3_pR5-bTPdihCGzA21NTjgp6'),
        target: t.beginParse(),
        gasLimit: 5000000,
        payload: beginCell().endCell(),  
    });

    
}