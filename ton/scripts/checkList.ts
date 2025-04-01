import { Address } from '@ton/core';
import { Bridge } from '../wrappers/Bridge';
import { JettonWallet } from '../wrappers/JettonWallet';
import { NetworkProvider } from '@ton/blueprint';


export async function run(provider: NetworkProvider, args: string[]) {
    const ui = provider.ui();

    const address = Address.parse(args.length > 0 ? args[0] : await ui.input('Bridge address'));

    if (!(await provider.isContractDeployed(address))) {
        ui.write(`Error: Contract at address ${address} is not deployed!`);
        return;
    }

    const bridge = provider.open(Bridge.createFromAddress(address));

    const owner = await bridge.getOwner();
    ui.write('Current owner: ' + owner.toString());

    const JettonAddress = Address.parse('0QAhX0qNDld48iKKbQYZXu6zPJyOBKEUbTUn4TAg_KWYH1i3')
    const wallet = provider.open(JettonWallet.createFromAddress(JettonAddress))

    const newBridgeBalance = (await wallet.getWalletData()).balance;
    console.log('New bridge balance:', newBridgeBalance);

    const tokenAddress = Address.parse('0QAhX0qNDld48iKKbQYZXu6zPJyOBKEUbTUn4TAg_KWYH1i3');

    const isWhitelisted = await bridge.getIsWhitelisted(tokenAddress);

    ui.write('Is whitelisted: ' + isWhitelisted);

}