require("hardhat-gas-reporter");
require("hardhat-spdx-license-identifier");
require("hardhat-deploy");
require("hardhat-abi-exporter");
require("@nomiclabs/hardhat-ethers");
require("dotenv/config");
require("@nomiclabs/hardhat-etherscan");
require("@nomiclabs/hardhat-waffle");
require("solidity-coverage");
require("@matterlabs/hardhat-zksync-deploy");
require("@matterlabs/hardhat-zksync-solc");
require("@matterlabs/hardhat-zksync-verify");
require("./tasks");

const { PRIVATE_KEY, INFURA_KEY } = process.env;
let accounts = [];
accounts.push(PRIVATE_KEY);

module.exports = {
  defaultNetwork: "hardhat",
  abiExporter: {
    path: "./abi",
    clear: false,
    flat: true,
  },
  networks: {
    hardhat: {
      forking: {
        enabled: false,
        //url: `https://bsctest.pls2e.cc`,
        url: `https://data-seed-prebsc-1-s1.binance.org:8545`,
        //url: `https://bsc-dataseed.eme-node.com`,
        //url: `https://bsc-dataseed2.defibit.io/`,
      },
      allowUnlimitedContractSize: true,
      live: true,
      saveDeployments: false,
      tags: ["local"],
      timeout: 2000000,
      chainId: 212,
    },
    Map: {
      url: `https://rpc.maplabs.io/`,
      chainId: 22776,
      accounts: accounts,
    },
    Makalu: {
      url: `https://testnet-rpc.maplabs.io/`,
      chainId: 212,
      accounts: accounts,
    },
    Matic: {
      url: `https://rpc.ankr.com/polygon`,
      chainId: 137,
      accounts: accounts,
    },
    MaticTest: {
      url: `https://rpc-mumbai.maticvigil.com/`,
      chainId: 80001,
      accounts: accounts,
    },
    Bsc: {
      url: `https://rpc.ankr.com/bsc`,
      chainId: 56,
      accounts: accounts,
    },
    BscTest: {
      url: `https://data-seed-prebsc-2-s1.binance.org:8545/`,
      chainId: 97,
      accounts: accounts,
      gasPrice: 11 * 1000000000,
    },
    Eth: {
      url: `https://mainnet.infura.io/v3/` + INFURA_KEY,
      chainId: 1,
      accounts: accounts,
    },
    Goerli: {
      url: `https://goerli.infura.io/v3/` + INFURA_KEY,
      chainId: 5,
      accounts: accounts,
    },
    Klay: {
      url: `https://klaytn.blockpi.network/v1/rpc/public`,
      chainId: 8217,
      accounts: accounts,
    },
    KlayTest: {
      url: `https://api.baobab.klaytn.net:8651/`,
      chainId: 1001,
      accounts: accounts,
    },
    Tron: {
      url: `https://api.trongrid.io/jsonrpc`,
      chainId: 728126428,
      accounts: accounts,
    },

    TronTest: {
      url: `https://nile.trongrid.io/jsonrpc`,
      chainId: 3448148188,
      accounts: accounts,
    },

    Bttc: {
      url: `https://rpc.bittorrentchain.io`,
      chainId: 199,
      accounts: accounts,
    },

    BttcTest: {
      url: `https://pre-rpc.bt.io`,
      chainId: 1029,
      accounts: accounts,
    },
    Conflux: {
      url: `https://evm.confluxrpc.com`,
      chainId: 1030,
      accounts: accounts,
    },
    Merlin: {
      url: `https://rpc.merlinchain.io/`,
      chainId: 4200,
      gasPrice: 50000000,
      accounts: accounts,
    },
    Bevm: {
      url: `https://rpc-canary-2.bevm.io/`,
      chainId : 1501,
      accounts: accounts,
    },
    Blast: {
      url: `https://rpc.blast.io`,
      chainId : 81457,
      accounts: accounts,
    },
    Base: {
      url: `https://mainnet.base.org`,
      chainId: 8453,
      accounts: accounts,
    },
    Ainn: {
      url: `https://mainnet-rpc.anvm.io`,
      chainId : 2649,
      gasPrice: 50000000,
      accounts: accounts,
    },
    zkSync: {
      url: `https://mainnet.era.zksync.io`,
      chainId: 324,
      zksync: true,
      ethNetwork: "Eth",
      accounts: accounts,
    },
  },
  zksolc: {
    version: "1.3.10",
    compilerSource: "binary",
    settings: {},
  },
  solidity: {
    compilers: [
      {
        version: "0.8.7",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      },
      {
        version: "0.8.9",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      },
      {
        version: '0.8.20',
        settings: {
          optimizer: {
            enabled: true,
            runs: 200
          },
          "evmVersion": "london"
        }
      }
    ]
  },
  spdxLicenseIdentifier: {
    overwrite: true,
    runOnCompile: false,
  },
  mocha: {
    timeout: 2000000,
  },
  etherscan: {
    apiKey: {
      Bttc: process.env.API_KEY_BTTC,
      Eth:  process.env.API_KEY_ETH,
      Bsc:  process.env.API_KEY_BSC,
      polygon: process.env.API_KEY_MATIC,
      Blast: process.env.API_KEY_BLAST,
      Base: process.env.API_KEY_BASE
    },
    customChains: [
      {
        network: "Bttc",
        chainId: 199,
        urls: {
          apiURL: "https://api.bttcscan.com/api",
          browserURL: "https://bttcscan.com/",
        },
      },
      {
        network: "Eth",
        chainId: 1,
        urls: {
          apiURL: "https://api.etherscan.io/api",
          browserURL: "https://etherscan.com/",
        },
      },
      {
        network: "Bsc",
        chainId: 56,
        urls: {
          apiURL: "https://api.bscscan.com/api",
          browserURL: "https://bscscan.com/",
        },
      },
      {
        network: "Matic",
        chainId: 237,
        urls: {
          apiURL: "https://api.polygonscan.com/api",
          browserURL: "https://polygonscan.com/",
        },
      },
      {
        network: "Blast",
        chainId: 81457,
        urls: {
          apiURL: "https://api.blastscan.io/api",
          browserURL: "https://blastscan.io/",
        },
      },
      {
        network: "Base",
        chainId: 8453,
        urls: {
          apiURL: "https://api.basescan.org/api",
          browserURL: "https://basescan.org/",
        },
      },
    ],
  },
};
