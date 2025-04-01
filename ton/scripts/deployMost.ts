import { Address, toNano } from '@ton/core';
import { compile, NetworkProvider, sleep } from '@ton/blueprint';
import { Most } from '../wrappers/Most';
import { buildJettonContent, Jetton } from '../wrappers/Jetton';

/**
 *
 *   most: 'EQD5ghWOQ_rXUcdMnPBIRnYyszXXJ3Qsh1XXvjBaefrq0yzF',
 *
 * @param provider
 */
export async function run(provider: NetworkProvider) {
    const ui = provider.ui();
    const most = provider.open(
        Most.createFromConfig(
            {
                orderNonce: 0,
            },
            await compile('Most'),
        ),
    );

    await most.sendDeploy(provider.sender(), toNano('0.07'));

    await provider.waitForDeploy(most.address);

    let counter = await most.getOrderNonce();
    if (counter !== 0) {
        ui.setActionPrompt('Deploy most failed!');
        return;
    }

    console.log('Most deployed at:', most.address);

    return;
    // 2. Deploy Jetton with Most as admin
    const jettonWalletCode = await compile('JettonWallet');

    const content = buildJettonContent({
        name: 'Butter Jetton',
        symbol: 'BUTTER',
        description: 'Test Butter Jetton',
        decimals: 9,
    });

    const mostAddress = Address.parse('kQBEEl1eSCkVpK4bWa6E6poeVCTuQNvzTj-U6l_klL3ESMxw');
    const jetton = provider.open(
        Jetton.createFromConfig(
            {
                // adminAddress: most.address, // Set Most contract as admin
                adminAddress: mostAddress, // Set Most contract as admin
                content: content,
                walletCode: jettonWalletCode,
            },
            await compile('JettonMinter'),
        ),
    );

    await jetton.sendDeploy(provider.sender(), toNano('0.1'));
    await provider.waitForDeploy(jetton.address);

    console.log('Jetton deployed at:', jetton.address);

    // Print deployment info
    console.log('Deployment completed!');
    console.log({
        most: most.address.toString(),
        jetton: jetton.address.toString(),
    });
}
