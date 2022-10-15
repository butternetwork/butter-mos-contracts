import {InMemoryKeyStore} from "near-api-js/lib/key_stores";
import {KeyPair, keyStores} from "near-api-js";

require('dotenv/config')

const PRIVATE_KEY = process.env.PRIVATE_KEY!;
const NEAR_TEST_PRIV_KEY = process.env.NEAR_PRIV_KEY!;
const NEAR_TEST_MASTER_ACCT = 'xyli.testnet';
const keyStoreTest: InMemoryKeyStore = new keyStores.InMemoryKeyStore();
const keyPairTest = KeyPair.fromString(NEAR_TEST_PRIV_KEY);
keyStoreTest.setKey('testnet', NEAR_TEST_MASTER_ACCT, keyPairTest)

let accounts: string[] = [];
accounts.push(PRIVATE_KEY);

const deploy_config = {
    namedAccounts: {
        deployer: {
            212: '0xCBdb1Da4f99276b0c427776BDE93838Bc19386Cc',
            34434: '0xCBdb1Da4f99276b0c427776BDE93838Bc19386Cc',
            1313161555: NEAR_TEST_MASTER_ACCT
        },
        wcoin: {
            212: '0x13CB04d4a5Dfb6398Fc5AB005a6c84337256eE23',
            34434: '0xB59B98DF47432371A36A8F83fC7fd8371ec1300B',
            1313161555: 'wrap.testnet'
        },
        mapcoin: {
            212: '0x0000000000000000000000000000000000000000',
            34434: '0xE1b2b81B66150F9EF5A89dC346a7A8B8df05d847',
        },
        lightclient: {
            212: '0x000068656164657273746F726541646472657373',
            34434: '0x1eD5058d28fCD3ae7b9cfFD0B0B3282d939c4034',
            1313161555: 'client.map001.testnet'
        }
    },
    networks: {
        34434: {
            url: `http://18.138.248.113:8545`,
            chainId: 34434,
            accounts: accounts
        },
        212: {
            url: `http://18.142.54.137:7445/`,
            chainId : 212,
            accounts: accounts
        },
        22776: {
            url: `https://poc3-rpc.maplabs.io/`,
            chainId : 22776,
            accounts: accounts
        },
        1313161555: {
            url: `https://rpc.testnet.near.org`,
            chainId : 1313161555,
            keyStore: keyStoreTest
        },
    },
    solidity: {
        compilers: [
            {
                version: '0.8.7',
                settings: {
                    optimizer: {
                        enabled: true,
                        runs: 200,
                    },
                },
            },
            {
                version: '0.4.22',
                settings: {
                    optimizer: {
                        enabled: true,
                        runs: 200,
                    },
                },
            },
        ],
    },};

export default deploy_config;
