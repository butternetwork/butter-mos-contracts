import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { Cell, toNano } from '@ton/core';
import { TargetExample } from '../wrappers/TargetExample';
import '@ton/test-utils';
import { compile } from '@ton/blueprint';

describe('TargetExample', () => {
    let code: Cell;

    beforeAll(async () => {
        code = await compile('TargetExample');
    });

    let blockchain: Blockchain;
    let deployer: SandboxContract<TreasuryContract>;
    let targetExample: SandboxContract<TargetExample>;

    beforeEach(async () => {
        blockchain = await Blockchain.create();

        targetExample = blockchain.openContract(
            TargetExample.createFromConfig(
                {
                    orderNonce: 0,
                },
                code,
            ),
        );

        deployer = await blockchain.treasury('deployer');

        const deployResult = await targetExample.sendDeploy(deployer.getSender(), toNano('0.05'));

        expect(deployResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: targetExample.address,
            deploy: true,
            success: true,
        });
    });

    it('should deploy', async () => {
        // the check is done inside beforeEach
        // blockchain and targetExample are ready to use
    });
});
