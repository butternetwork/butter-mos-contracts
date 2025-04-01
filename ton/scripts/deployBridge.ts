import { toNano } from '@ton/core';
import { Bridge } from '../wrappers/Bridge';
import { compile, NetworkProvider } from '@ton/blueprint';

export async function run(provider: NetworkProvider) {
    const orderNonce = Math.floor(Math.random() * 10000);
    const bridge = provider.open(
        Bridge.createFromConfig(
            { 
                orderNonce: 0, 
                owner: provider.sender().address!
             },
            await compile('Bridge'),
        ),
    );

    await bridge.sendDeploy(provider.sender(), toNano('0.08'));

    await provider.waitForDeploy(bridge.address);

    console.log('ID', await bridge.getOrderNonce());
}
