import { toNano } from '@ton/core';
import { TargetExample } from '../wrappers/TargetExample';
import { compile, NetworkProvider } from '@ton/blueprint';

export async function run(provider: NetworkProvider) {
    const targetExample = provider.open(
        TargetExample.createFromConfig(
            {
                orderNonce: 0,
            },
            await compile('TargetExample'),
        ),
    );

    await targetExample.sendDeploy(provider.sender(), toNano('0.05'));

    await provider.waitForDeploy(targetExample.address);

    // run methods on `targetExample`
}
