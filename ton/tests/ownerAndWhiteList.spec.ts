import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { Cell, toNano } from '@ton/core';
import { Bridge } from '../wrappers/Bridge';
import '@ton/test-utils';
import { compile } from '@ton/blueprint';

describe('Bridge', () => {
    let code: Cell;
    let blockchain: Blockchain;
    let bridge: SandboxContract<Bridge>;
    let deployer: SandboxContract<TreasuryContract>;

    beforeAll(async () => {
        code = await compile('Bridge');
    });

    beforeEach(async () => {
        blockchain = await Blockchain.create();
        deployer = await blockchain.treasury('deployer');

        bridge = blockchain.openContract(
            Bridge.createFromConfig(
                { 
                    orderNonce: 0, 
                    owner: deployer.address
                 },
                code
            )
        );

        const deployResult = await bridge.sendDeploy(deployer.getSender(), toNano('0.05'));
        expect(deployResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: bridge.address,
            deploy: true,
        });
    });

    it('should deploy', async () => {
        const deployed = await blockchain.getContract(bridge.address);
        expect(deployed.account).toBeDefined();
    });

    it('should set correct owner after deploy', async () => {
        const nonce = await bridge.getOrderNonce();
        expect(nonce).toEqual(0);

        const owner = await bridge.getOwner();
        expect(owner).toEqualAddress(deployer.address);
    });

    it('should handle whitelist operations through upgrade', async () => {
       
        const testToken = await blockchain.treasury('testToken');
        
        await bridge.sendAddToWhitelist(deployer.getSender(), {
            value: toNano('0.05'),
            tokenAddress: testToken.address
        });

       
        let isWhitelisted = await bridge.getIsWhitelisted(testToken.address);
        console.log('Whitelist status:', isWhitelisted);  
        console.log('Token address:', testToken.address.toString()); 

        expect(isWhitelisted).toBe(true);

     
        const newCode = await compile('Bridge');
        await bridge.sendUpgradeCode(deployer.getSender(), {
            value: toNano('0.1'),
            code: newCode
        });

        
        await bridge.sendRemoveFromWhitelist(deployer.getSender(), {
            value: toNano('0.05'),
            tokenAddress: testToken.address
        });

        
        isWhitelisted = await bridge.getIsWhitelisted(testToken.address);
        console.log('Whitelist status1 :', isWhitelisted); 
        expect(isWhitelisted).toBe(false);

       
        await bridge.sendAddToWhitelist(deployer.getSender(), {
            value: toNano('0.05'),
            tokenAddress: testToken.address
        });

        
        isWhitelisted = await bridge.getIsWhitelisted(testToken.address);
        expect(isWhitelisted).toBe(true);

    
        const finalOwner = await bridge.getOwner();
        expect(finalOwner).toEqualAddress(deployer.address);
    });
});