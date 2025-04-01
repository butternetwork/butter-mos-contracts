import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { Address, beginCell, Cell, toNano } from '@ton/core';
import { JettonWallet } from '../wrappers/JettonWallet';
import { Bridge } from '../wrappers/Bridge';
import { JettonMinter } from '../wrappers/JettonMinter';
import '@ton/test-utils';
import { compile } from '@ton/blueprint';

describe('Withdraw Test', () => {
    let code: Cell;
    let blockchain: Blockchain;
    let jettonMinter: SandboxContract<JettonMinter>;
    let bridge: SandboxContract<Bridge>;
    let deployer: SandboxContract<TreasuryContract>;

    beforeAll(async () => {
        code = await compile('Bridge');
    });

    beforeEach(async () => {
        blockchain = await Blockchain.create();
        deployer = await blockchain.treasury('deployer');

        const jettonMinterCode = await compile('JettonMinter');
        jettonMinter = blockchain.openContract(
            JettonMinter.createFromConfig({
                adminAddress: deployer.address,
                content: beginCell().endCell(),
                jettonWalletCode: await compile('JettonWallet')
            }, jettonMinterCode)
        );
        await jettonMinter.sendDeploy(deployer.getSender(), toNano('1'));

        bridge = blockchain.openContract(
            Bridge.createFromConfig(
                {
                    orderNonce: 0,
                    owner: deployer.address
                },
                code
            )
        );
        await bridge.sendDeploy(deployer.getSender(), toNano('0.05'));

        await jettonMinter.sendMint(deployer.getSender(), {
            value: toNano('0.5'),
            to: bridge.address,
            amount: toNano('100'),
            forward_ton_amount: toNano('0.1'),
            forward_payload: beginCell().endCell()
        });
    });

    it('should withdraw jetton tokens to owner', async () => {

        await jettonMinter.sendMint(deployer.getSender(), {
            value: toNano('0.5'),
            to: deployer.address,  
            amount: toNano('1'),   
            forward_ton_amount: toNano('0.1'),
            forward_payload: beginCell().endCell()
        });
                
        const bridgeWalletAddress = await jettonMinter.getWalletAddress(bridge.address);
        const bridgeJettonWallet = blockchain.openContract(
            JettonWallet.createFromAddress(bridgeWalletAddress)
        );

        const initialBalance = (await bridgeJettonWallet.getWalletData()).balance;
        console.log('Initial bridge balance:', initialBalance);

        await bridge.sendAddToWhitelist(deployer.getSender(), {
            value: toNano('0.1'),
            tokenAddress: bridgeWalletAddress
        });

        const isWhitelisted = await bridge.getIsWhitelisted(bridgeWalletAddress);
        console.log('Is whitelisted:', isWhitelisted);

        await bridge.sendWithdraw(deployer.getSender(), {
            value: toNano('0.1'),
            jettonWalletAddress: bridgeWalletAddress,
            amount: toNano('50')
        });

        const newBridgeBalance = (await bridgeJettonWallet.getWalletData()).balance;
        console.log('New bridge balance:', newBridgeBalance);

        const ownerWalletAddress = await jettonMinter.getWalletAddress(deployer.address);
        const ownerJettonWallet = blockchain.openContract(
            JettonWallet.createFromAddress(ownerWalletAddress)
        );

        const ownerBalance = (await ownerJettonWallet.getWalletData()).balance;
        console.log('Owner balance:', ownerBalance);

        expect(newBridgeBalance).toEqual(initialBalance - toNano('50'));
        expect(ownerBalance).toEqual(toNano('51'));
    });
});