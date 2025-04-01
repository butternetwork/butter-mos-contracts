import { Address, beginCell, toNano } from '@ton/core';
import { Bridge } from '../wrappers/Bridge';
import { compile, NetworkProvider, sleep } from '@ton/blueprint';
import { PayloadCodec } from '../utils/payload';

export async function run(provider: NetworkProvider, args: string[]) {
    const ui = provider.ui();

    const address = Address.parse(args.length > 0 ? args[0] : await ui.input('Bridge address'));

    if (!(await provider.isContractDeployed(address))) {
        ui.write(`Error: Contract at address ${address} is not deployed!`);
        return;
    }

    const bridge = provider.open(Bridge.createFromAddress(address));

    const code = await compile('Bridge');

    await bridge.sendTestMapoExecute(provider.sender(), {
        value: toNano(0.06),
    });

    ui.write('Waiting for send message...');

    ui.clearActionPrompt();
    ui.write('Bridge message out successfully!');
}
