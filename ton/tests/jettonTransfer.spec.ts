import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { Address, beginCell, Cell, toNano , ShardAccount,TransactionComputePhase} from '@ton/core';
import { JettonWallet } from '../wrappers/JettonWallet';
import { Bridge } from '../wrappers/Bridge';
import { JettonMinter } from '../wrappers/JettonMinter';
import '@ton/test-utils';
import { compile } from '@ton/blueprint';
import { log } from 'console';

describe('Jetton Transfer Tests', () => {
    let code: Cell;
    let blockchain: Blockchain;
    let jettonMinter: SandboxContract<JettonMinter>;
    let senderWallet: SandboxContract<JettonWallet>;
    let receiverWallet: SandboxContract<Bridge>;
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


        receiverWallet = blockchain.openContract(
            Bridge.createFromConfig(
                { 
                    orderNonce: 0, 
                    owner: deployer.address
                 },
                code
            )
        );

        await receiverWallet.sendDeploy(deployer.getSender(), toNano('0.05'));

    });

    it('should transfer tokens and trigger bridge notification', async () => {

        const owner = await receiverWallet.getOwner();
        expect(owner).toEqualAddress(deployer.address);
        
        await jettonMinter.sendMint(deployer.getSender(), {
            value: toNano('1'),          
            to: deployer.address,
            amount: toNano('100'),      
            forward_ton_amount: toNano('0.1'),  
            forward_payload: beginCell().endCell()
        });
        
        const deployerWalletAddress = await jettonMinter.getWalletAddress(deployer.address);
        const deployerJettonWallet = blockchain.openContract(
            JettonWallet.createFromAddress(deployerWalletAddress)
        );

        const initialBalance = await deployerJettonWallet.getWalletData();
        console.log('Initial Jetton balance:', initialBalance.balance);
        expect(initialBalance.balance).toEqual(toNano('100')); 

        const deployerWalletContract = await blockchain.getContract(deployerWalletAddress);
        

        if (deployerWalletContract) {
            const deployerJettonWallet = blockchain.openContract(
                JettonWallet.createFromAddress(deployerWalletAddress)
            );
            const walletData = await deployerJettonWallet.getWalletData();

        }

        const target = '93f46bff194047c851b516c214965070076f3b20'

        const t = beginCell().storeBuffer(Buffer.from(target, 'hex')).endCell();

        const result = await deployerJettonWallet.sendTransfer(deployer.getSender(), {
            value: toNano('0.5'),
            toAddress: receiverWallet.address,
            amount: toNano('1'),
            responseAddress: deployer.address,
            forwardTonAmount: toNano('0.2'),
            relay: false,
            msgType: 3,
            toChain: 11155111n,
            initiator: Address.parse('0QBpLE9C87T96HD0BVzXxIMc3_pR5-bTPdihCGzA21NTjgp6'),
            target: t.beginParse(),
            gasLimit: 5000000,
            payload: beginCell().endCell(), 
        });


        for (let tx of result.transactions) {
            if (tx.inMessage?.body) {
                const slice = tx.inMessage.body.beginParse();
                const op = slice.loadUint(32);
                
                if (op === 0x7362d09c) {
                    console.log('\nFound transfer_notification:');
                    console.log('Operation:', op.toString(16));
                    
                    const queryId = slice.loadUint(64);
                    const amount = slice.loadCoins();
                    const from = slice.loadAddress();
                
                
                }
            }
        }
        const afterTransferData = await deployerJettonWallet.getWalletData();
        console.log('\nAfter Transfer:');
        console.log('Balance:', afterTransferData.balance.toString());

        expect(afterTransferData.balance).toEqual(toNano('99'));

        const owner11 = await receiverWallet.getOwner();
        expect(owner11).toEqualAddress(deployer.address);
    });
});