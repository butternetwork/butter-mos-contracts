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

    const code = await compile('Bridge');

    await most.sendSetJettonMaster(provider.sender(), {
        value: toNano(0.06),
        jettonMasterAddress: Address.parse('EQBROyRu8MYXd7pEXDl-q6Dxoaz-AVN1A_LuqdmDG1GIc8Fs'),
    });

    ui.write('Waiting for send message...');

    ui.clearActionPrompt();
    ui.write('Bridge message out successfully!');
}
