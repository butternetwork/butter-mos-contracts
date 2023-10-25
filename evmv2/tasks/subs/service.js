let { create, readFromFile, writeToFile, getMos } = require("../../utils/helper.js");
let { mosDeploy, mosUpgrade } = require("../utils/util.js");
let {
  tronMosDeploy,
  tronMosUpgrade,
  tronSetup,
  tronSetRelay,
  tronRegisterToken,
  tronSetMintableToken,
  tronList,
  tronDeployRootToken,
} = require("../utils/tron.js");

task("mos:deploy", "mos service deploy")
  .addParam("wrapped", "native wrapped token address")
  .addParam("lightnode", "lightNode contract address")
  .setAction(async (taskArgs, hre) => {
    if (hre.network.name === "Tron" || hre.network.name === "TronTest") {
      console.log(hre.network.name);
      await tronMosDeploy(hre.artifacts, hre.network.name, taskArgs.wrapped, taskArgs.lightnode);
    } else {
      const { deploy } = hre.deployments;
      const accounts = await ethers.getSigners();
      const deployer = accounts[0];
      const chainId = await hre.network.config.chainId;
      console.log("deployer address:", deployer.address);
      await mosDeploy(deploy, chainId, deployer.address, taskArgs.wrapped, taskArgs.lightnode);
    }
  });

task("mos:upgrade", "upgrade mos evm contract in proxy")
  .addOptionalParam("impl", "The mos impl address", "0x0000000000000000000000000000000000000000", types.string)
  .setAction(async (taskArgs, hre) => {
    if (hre.network.name === "Tron" || hre.network.name === "TronTest") {
      await tronMosUpgrade(hre.artifacts, hre.network.name, taskArgs.impl);
    } else {
      const { deploy } = hre.deployments;
      const accounts = await ethers.getSigners();
      const deployer = accounts[0];
      const chainId = await hre.network.config.chainId;
      console.log("deployer address:", deployer.address);
      await mosUpgrade(deploy, chainId, deployer.address, hre.network.name, taskArgs.impl);
    }
  });

//settype
//client -> update mos light client
//butterrouter ->  Update butter router contract address in MOS
task("mos:setup", "set associated contracts for mos")
  .addParam("type", "associated contracts type (client/router) to set for mos")
  .addParam("address", "associated contracts address")
  .setAction(async (taskArgs, hre) => {
    if (hre.network.name === "Tron" || hre.network.name === "TronTest") {
      await tronSetup(hre.artifacts, hre.network.name, taskArgs.address, taskArgs.type);
    } else {
      const accounts = await ethers.getSigners();
      const deployer = accounts[0];
      const chainId = await hre.network.config.chainId;
      let mos = await getMos(chainId, hre.network.name);
      if (mos == undefined) {
        throw "mos not deployed ...";
      }

      console.log("mos address", mos.address);

      if (taskArgs.type === "client") {
        await (await mos.connect(deployer).setLightClient(taskArgs.address)).wait();
        console.log(`mos set  light client ${taskArgs.address} successfully `);
      } else if (taskArgs.type === "router") {
        await (await mos.connect(deployer).setButterRouterAddress(taskArgs.address)).wait();
        console.log(`mos set butter router to ${taskArgs.address} `);
      } else {
        throw "unsuport set type";
      }
    }
  });

task("mos:setRelay", "Initialize MapCrossChainServiceRelay address for MapCrossChainService")
  .addParam("address", "mos contract address")
  .addParam("chain", "chain id")
  .setAction(async (taskArgs, hre) => {
    if (hre.network.name === "Tron" || hre.network.name === "TronTest") {
      await tronSetRelay(hre.artifacts, hre.network.name, taskArgs.address, taskArgs.chain);
    } else {
      const accounts = await ethers.getSigners();
      const deployer = accounts[0];
      const chainId = await deployer.getChainId();
      console.log("deployer address:", deployer.address);

      let mos = await getMos(chainId, hre.network.name);

      if (mos === undefined) {
        throw "mos not deployed ...";
      }

      console.log("mos address:", mos.address);

      let address = taskArgs.address;

      if (taskArgs.address.substr(0, 2) != "0x") {
        address = "0x" + stringToHex(taskArgs.address);
      }

      if (taskArgs.chain !== "212" && taskArgs.chain !== "22776") {
        throw "relay chainId must 212 for testnet or 22776 for mainnet";
      }

      await (await mos.connect(deployer).setRelayContract(taskArgs.chain, address)).wait();

      console.log(`mos set  relay ${address} with chain id ${taskArgs.chain} successfully `);
    }
  });

task("mos:registerToken", "MapCrossChainService settings allow cross-chain tokens")
  .addParam("token", "token address")
  .addParam("chains", "chain ids allowed to cross, separated by ',', ex. `1,2,3` ")
  .addOptionalParam("enable", "true or false", true, types.boolean)
  .setAction(async (taskArgs, hre) => {
    console.log("mos register token, network:", hre.network.name);

    if (hre.network.name === "Tron" || hre.network.name === "TronTest") {
      await tronRegisterToken(hre.artifacts, hre.network.name, taskArgs.token, taskArgs.chains, taskArgs.enable);
    } else {
      const accounts = await ethers.getSigners();
      const deployer = accounts[0];
      const chainId = await deployer.getChainId();
      console.log("deployer address:", deployer.address);

      let mos = await getMos(chainId, hre.network.name);

      if (mos === undefined) {
        throw "mos not deployed ...";
      }
      console.log("mos address:", mos.address);

      let ids = taskArgs.chains.split(",");

      for (let i = 0; i < ids.length; i++) {
        await (await mos.connect(deployer).registerToken(taskArgs.token, ids[i], taskArgs.enable)).wait();

        console.log(`mos register token ${taskArgs.token} to chain ${ids[i]} success`);
      }

      console.log("mos registerToken success");
    }
  });

task("mos:setMintableToken", "MapCrossChainService settings mintable token")
  .addParam("token", "token address")
  .addParam("mintable", "true or false", false, types.boolean)
  .setAction(async (taskArgs, hre) => {
    if (hre.network.name === "Tron" || hre.network.name === "TronTest") {
      await tronSetMintableToken(hre.artifacts, hre.network.name, taskArgs.token, taskArgs.mintable);
    } else {
      const accounts = await ethers.getSigners();
      const deployer = accounts[0];
      const chainId = await deployer.getChainId();
      console.log("deployer address:", deployer.address);

      let mos = await getMos(chainId, hre.network.name);

      if (!mos) {
        throw "mos not deployed ...";
      }

      console.log("mos address:", mos.address);

      let tokens = taskArgs.token.split(",");
      if (taskArgs.mintable) {
        await (await mos.connect(deployer).addMintableToken(tokens)).wait();

        console.log(`mos set token ${taskArgs.token} mintable ${taskArgs.mintable} success`);
      } else {
        await (await mos.connect(deployer).removeMintableToken(tokens)).wait();

        console.log(`mos set token ${taskArgs.token} mintable ${taskArgs.mintable}  success`);
      }
    }
  });

const chainlist = [
  1,
  5,
  56,
  97, // bsc
  137,
  80001, // matic
  212,
  22776, // mapo
  1001,
  8217, // klaytn
  "1360100178526209",
  "1360100178526210", // near
];

task("mos:list", "List mos  infos")
  .addOptionalParam("mos", "The mos address, default mos", "mos", types.string)
  .addOptionalParam("token", "The token address, default wtoken", "wtoken", types.string)
  .setAction(async (taskArgs, hre) => {
    if (hre.network.name === "Tron" || hre.network.name === "TronTest") {
      await tronList(hre.artifacts, hre.network.name, taskArgs.mos, taskArgs.token);
    } else {
      const accounts = await ethers.getSigners();
      const deployer = accounts[0];
      const chainId = await deployer.getChainId();
      console.log("deployer address:", deployer.address);
      let address = taskArgs.mos;
      if (address == "mos") {
        let proxy = await getMos(chainId, hre.network.name);
        if (!proxy) {
          throw "mos not deployed ...";
        }
        address = proxy.address;
      }
      console.log("mos address:\t", address);
      let mos = await ethers.getContractAt("MAPOmnichainServiceV2", address);
      let wtoken = await mos.wToken();
      let selfChainId = await mos.selfChainId();
      let relayContract = await mos.relayContract();
      let relayChainId = await mos.relayChainId();
      let lightNode = await mos.lightNode();

      console.log("selfChainId:\t", selfChainId.toString());
      console.log("wToken address:\t", wtoken);
      console.log("light node:\t", lightNode);
      console.log("relay chain:\t", relayChainId.toString());
      console.log("relay contract:\t", relayContract);

      address = taskArgs.token;
      if (address == "wtoken") {
        address = wtoken;
      }
      console.log("\ntoken address:", address);
      let mintable = await mos.isMintable(address);
      console.log(`token mintalbe:\t ${mintable}`);

      console.log("register chains:");
      for (let i = 0; i < chainlist.length; i++) {
        let bridgeable = await mos.isBridgeable(address, chainlist[i]);
        if (bridgeable) {
          console.log(`${chainlist[i]}`);
        }
      }
    }
  });
