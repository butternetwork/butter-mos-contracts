import { Address, beginCell, toNano } from '@ton/core';
import { Bridge } from '../wrappers/Bridge';
import { NetworkProvider } from '@ton/blueprint';

export async function run(provider: NetworkProvider, args: string[]) {
    const ui = provider.ui();

    const address = Address.parse(args.length > 0 ? args[0] : await ui.input('Bridge address'));

    if (!(await provider.isContractDeployed(address))) {
        ui.write(`Error: Contract at address ${address} is not deployed!`);
        return;
    }

    const bridge = provider.open(Bridge.createFromAddress(address));

    const recevier = Address.parse("0QAhX0qNDld48iKKbQYZXu6zPJyOBKEUbTUn4TAg_KWYH1i3")     
    
    await bridge.sendWithdraw(provider.sender(), {
        value: toNano('0.05'),
        jettonWalletAddress: recevier,
        amount:toNano('0.03')
    });
    

    ui.write('Withdraw jetton success.');
}