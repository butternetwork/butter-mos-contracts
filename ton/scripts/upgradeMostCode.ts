import { Address, beginCell, toNano } from '@ton/core';
import { Bridge } from '../wrappers/Bridge';
import { compile, NetworkProvider, sleep } from '@ton/blueprint';
import { PayloadCodec } from '../utils/payload';
import { Most } from '../wrappers/Most';

export async function run(provider: NetworkProvider, args: string[]) {
    const ui = provider.ui();

    const address = Address.parse(args.length > 0 ? args[0] : await ui.input('Most address'));

    if (!(await provider.isContractDeployed(address))) {
        ui.write(`Error: Contract at address ${address} is not deployed!`);
        return;
    }

    const most = provider.open(Most.createFromAddress(address));

    const counterBefore = await most.getOrderNonce();

    const code = await compile('Most');

    await most.sendUpgradeCode(provider.sender(), {
        value: toNano(0.06),
        code,
    });

    ui.write('Waiting for upgrade bridge...');

    let counterAfter = await most.getOrderNonce();
    let attempt = 1;
    while (counterAfter === counterBefore) {
        ui.setActionPrompt(`Attempt ${attempt}`);
        await sleep(2000);
        counterAfter = await most.getOrderNonce();
        attempt++;
    }

    ui.clearActionPrompt();
    ui.write('Bridge message out successfully!');
}
