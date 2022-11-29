import {InMemoryKeyStore} from "near-api-js/lib/key_stores";
import {KeyPair, keyStores} from "near-api-js";

require('dotenv/config')

const PRIVATE_KEY = 'b87b1f26c7d0ffe0f65c25dbc09602e0ac9c0d14acc979b5d67439cade6cdb7b'!;
const NEAR_TEST_PRIV_KEY = 'ed25519:3V1ZUMUD3pZkKyEFJFHpev32WVipYb7HFu6YhnHrGZMw1bArtcBBzB11W9ouFuB3cd11hZL2miXZnX1N36pgywgU';
const NEAR_TEST_MASTER_ACCT = 'xyli.testnet';
const EVM_DEPLOYER = '0x8c9b3cAf7DedD3003f53312779c1b92ba1625D94';
const keyStoreTest: InMemoryKeyStore = new keyStores.InMemoryKeyStore();
const keyPairTest = KeyPair.fromString(NEAR_TEST_PRIV_KEY);
keyStoreTest.setKey('testnet', NEAR_TEST_MASTER_ACCT, keyPairTest)

let accounts: string[] = [];
accounts.push(PRIVATE_KEY);

const deploy_config = {
    namedAccounts: {
        deployer: {
            212: EVM_DEPLOYER,
            34434: EVM_DEPLOYER,
            97: EVM_DEPLOYER,
            1313161555: NEAR_TEST_MASTER_ACCT
        },
        wcoin: {
            212: '0x2eD27dF9B4c903aB53666CcA59AFB431F7D15e91',
            97: '0xae13d989daC2f0dEbFf460aC112a837C89BAa7cd',
            34434: '0xB59B98DF47432371A36A8F83fC7fd8371ec1300B',
            1313161555: 'wrap.testnet'
        },
        mapcoin: {
            212: '0x0000000000000000000000000000000000000000',
            97: '0xad4c2B6e113113d345c167F7BdAA5A5D1cD00273',
            34434: '0xE1b2b81B66150F9EF5A89dC346a7A8B8df05d847',
            1313161555: 'map.mos2.mfac.maplabs.testnet'
        },
        lightclient: {
            212: '0x57214e7cB90a6Fe5c7597cD28B48ee325F5488cA',
            97: '0xdB913e87608e3d91C6F0b52E97a6760E7661B8f6',
            34434: '0x1eD5058d28fCD3ae7b9cfFD0B0B3282d939c4034',
            1313161555: 'client2.cfac.maplabs.testnet'
        }
    },
    networks: {
        34434: {
            url: `http://18.138.248.113:8545`,
            chainId: 34434,
            accounts: accounts
        },
        97: {
            url: 'https://bsc-testnet.public.blastapi.io',
            chainId: 97,
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
