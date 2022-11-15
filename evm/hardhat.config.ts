import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import 'hardhat-deploy';
require('dotenv/config')

const PRIVATE_KEY = process.env.PRIVATE_KEY!;

let accounts: string[] = [];
accounts.push(PRIVATE_KEY);

const config: HardhatUserConfig = {
  namedAccounts: {
    deployer: {
      212: '0x8c9b3cAf7DedD3003f53312779c1b92ba1625D94',
      34434: '0x8c9b3cAf7DedD3003f53312779c1b92ba1625D94',
      1313161555: 'xyli.testnet'
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
    Map: {
      url: `https://poc2-rpc.maplabs.io`,
      chainId : 22776,
      accounts: accounts
    },
    EthPriv: {
      url: `http://18.138.248.113:8545`,
      chainId: 34434,
      accounts: accounts
    },
    MapTest: {
      url: `http://18.142.54.137:7445/`,
      chainId : 212,
      accounts: accounts
    },
    MapMain: {
      url: `https://poc3-rpc.maplabs.io/`,
      chainId : 22776,
      accounts: accounts
    },
    NearTest: {
      url: `'https://rpc.testnet.near.org'`,
      chainId : 1313161555,
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

export default config;
