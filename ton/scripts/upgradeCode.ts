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

    //const counterBefore = await bridge.getOrderNonce();
    const codeHashBefore = await bridge.getCodeHash();
    ui.write('Old code hash: ' + codeHashBefore.toString());


    const code = await compile('Bridge');

    await bridge.sendUpgradeCode(provider.sender(), {
        value: toNano(0.2),
        code,
    });

    ui.write('Waiting for upgrade bridge...');

    // let counterAfter = await bridge.getOrderNonce();
    // let attempt = 1;
    // while (counterAfter === counterBefore) {
    //     ui.setActionPrompt(`Attempt ${attempt}`);
    //     await sleep(2000);
    //     counterAfter = await bridge.getOrderNonce();
    //     attempt++;
    // }
    let newCodeHash = await bridge.getCodeHash();
    let attempt = 1;
    while (newCodeHash === codeHashBefore) {
        ui.setActionPrompt(`Attempt ${attempt}`);
        await sleep(2000);
        newCodeHash = await bridge.getCodeHash();
        attempt++;
    }

    ui.clearActionPrompt();
    ui.write('Final code hash: ' + newCodeHash.toString());
    ui.write('Bridge message out successfully!');
}
