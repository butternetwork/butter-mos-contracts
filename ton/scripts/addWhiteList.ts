import { Address, beginCell, toNano } from '@ton/core';
import { Bridge } from '../wrappers/Bridge';
import { JettonMinter } from '../wrappers/JettonMinter';
import { NetworkProvider } from '@ton/blueprint';

export async function run(provider: NetworkProvider, args: string[]) {
    const ui = provider.ui();

    const address = Address.parse(args.length > 0 ? args[0] : await ui.input('Bridge address'));

    if (!(await provider.isContractDeployed(address))) {
        ui.write(`Error: Contract at address ${address} is not deployed!`);
        return;
    }

    const bridge = provider.open(Bridge.createFromAddress(address));

    const jettonMaster = Address.parse('0QCmT6Rpx37RHKjlaFEFjjnPi7sIzhjfEvq8PWD1KbFcuAI7');

    const jettonMinter = provider.open(JettonMinter.createFromAddress(jettonMaster));

    const bridgeWallet = await jettonMinter.getWalletAddress(address)

    ui.write('address:' + bridgeWallet);

    ui.write('Adding address to whitelist...');
        
    
    await bridge.sendAddToWhitelist(provider.sender(), {
        value: toNano('0.05'),
        tokenAddress: bridgeWallet
    });

    // await bridge.sendRemoveFromWhitelist(provider.sender(), {
    //     value: toNano('0.05'),
    //     tokenAddress: bridgeWallet
    // });


    ui.write('Add to whitelist transaction sent.');
}