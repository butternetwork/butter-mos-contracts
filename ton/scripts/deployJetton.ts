import { Address, toNano } from '@ton/core';
import { compile, NetworkProvider } from '@ton/blueprint';
import { Most } from '../wrappers/Most';
import { buildJettonContent, Jetton } from '../wrappers/Jetton';

/**
 *
 *   jetton: 'EQBROyRu8MYXd7pEXDl-q6Dxoaz-AVN1A_LuqdmDG1GIc8Fs'
 *
 * @param provider
 */
export async function run(provider: NetworkProvider) {
    const jettonWalletCode = await compile('JettonWallet');

    const content = buildJettonContent({
        name: 'Butter Jetton',
        symbol: 'BUTTER',
        description: 'Test Butter Jetton',
        decimals: 9,
    });

    const mostAddress = Address.parse('EQD5ghWOQ_rXUcdMnPBIRnYyszXXJ3Qsh1XXvjBaefrq0yzF');
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
}
