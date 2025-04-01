import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { Cell, toNano } from '@ton/core';
import { TargetExample } from '../wrappers/TargetExample';
import '@ton/test-utils';
import { compile } from '@ton/blueprint';
import { Most } from '../wrappers/Most';

describe('Most', () => {
    let code: Cell;

    beforeAll(async () => {
        code = await compile('Most');
    });

    let blockchain: Blockchain;
    let deployer: SandboxContract<TreasuryContract>;
    let most: SandboxContract<Most>;

    beforeEach(async () => {
        blockchain = await Blockchain.create();

        most = blockchain.openContract(
            Most.createFromConfig(
                {
                    orderNonce: 0,
                },
                code,
            ),
        );

        deployer = await blockchain.treasury('deployer');

        const deployResult = await most.sendDeploy(deployer.getSender(), toNano('0.05'));

        expect(deployResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: most.address,
            deploy: true,
            success: true,
        });
    });

    it('should deploy', async () => {
        // the check is done inside beforeEach
        // blockchain and targetExample are ready to use
        most.sendMapoExecute(deployer.getSender(), {
            value: toNano(0.1),
        });
    });
});
