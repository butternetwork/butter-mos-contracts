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
      default: 0,
      0: '0x289F8F063c4304F432bb96DD31e82bdCc5CcE142',
      212: '0xCBdb1Da4f99276b0c427776BDE93838Bc19386Cc',
      34434: '0xCBdb1Da4f99276b0c427776BDE93838Bc19386Cc',
    },
    wcoin: {
      default: 0,
      212: '0x13CB04d4a5Dfb6398Fc5AB005a6c84337256eE23',
      34434: '0xB59B98DF47432371A36A8F83fC7fd8371ec1300B',
    },
    mapcoin: {
      default: 0,
      212: '0x0000000000000000000000000000000000000000',
      34434: '0xE1b2b81B66150F9EF5A89dC346a7A8B8df05d847',
    },
    lightclient: {
      default: 0,
      212: '0x000068656164657273746F726541646472657373',
      34434: '0x1eD5058d28fCD3ae7b9cfFD0B0B3282d939c4034',
    }
  },
  networks: {
    bscmain: {
      url: `https://bsc-dataseed2.defibit.io/`,
      accounts: accounts,
      chainId: 56,
      gasMultiplier: 1.5,
      gasPrice: 5.5 * 1000000000
    },
    MaticTest: {
      url: `https://rpc-mumbai.maticvigil.com/`,
      chainId : 80001,
      accounts: accounts
    },
    Matic: {
      url: `https://rpc-mainnet.maticvigil.com`,
      chainId : 137,
      accounts: accounts
    },
    Heco: {
      url: `https://http-mainnet-node.huobichain.com`,
      chainId : 128,
      accounts: accounts
    },
    HecoTest: {
      url: `https://http-testnet.hecochain.com`,
      chainId : 256,
      accounts: accounts
    },
    // Eth: {
    //   url: `https://mainnet.infura.io/v3/` + ETH_INFURA_KEY,
    //   chainId : 1,
    //   accounts: accounts
    // },
    sepolia: {
      url: `https://rpc.sepolia.org`,
      chainId : 11155111,
      accounts: accounts
    },
    // Ropsten: {
    //   url: `https://ropsten.infura.io/v3/` + INFURA_KEY,
    //   chainId : 3,
    //   accounts: accounts
    // },
    Map: {
      url: `https://poc2-rpc.maplabs.io`,
      chainId : 22776,
      accounts: accounts
    },
    Map2: {
      url: `http://18.142.54.137:7445`,
      chainId : 29088,
      accounts: accounts
    },
    Bsc: {
      url: `https://bsc-dataseed1.binance.org/`,
      chainId : 56,
      accounts: accounts
    },
    BscTest: {
      url: `https://data-seed-prebsc-2-s1.binance.org:8545/`,
      chainId : 97,
      accounts: accounts,
      gasPrice: 11 * 1000000000
    },
    BscTest2: {
      url: `https://data-seed-prebsc-2-s2.binance.org:8545/`,
      chainId : 97,
      accounts: accounts,
      gasPrice: 11 * 1000000000
    },
    Abey: {
      url: `http://54.169.112.1:8545`,
      chainId : 179,
      accounts: accounts
    },
    True: {
      url: `https://rpc.truescan.network/`,
      chainId : 19330,
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
