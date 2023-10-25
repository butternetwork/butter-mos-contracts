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
  getTron,
  tronDeployRootToken,
} = require("../utils/tron.js");

task("tron:deploy", "tron mos service deploy")
  .addParam("wrapped", "native wrapped token address")
  .addParam("lightnode", "lightNode contract address")
  .setAction(async (taskArgs, hre) => {
    console.log(hre.network.name);
    await tronMosDeploy(hre.artifacts, hre.network.name, taskArgs.wrapped, taskArgs.lightnode);
  });

task("tron:upgrade", "upgrade mos tron contract in proxy")
  .addOptionalParam("impl", "The mos impl address", "0x0000000000000000000000000000000000000000", types.string)
  .setAction(async (taskArgs, hre) => {
    await tronMosUpgrade(hre.artifacts, hre.network.name, taskArgs.impl);
  });

//settype
//client -> update mos light client
//butterrouter ->  Update butter router contract address in MOS
task("tron:setup", "set associated contracts for tron mos")
  .addParam("type", "associated contracts type (client/router) to set for mos")
  .addParam("address", "associated contracts address")
  .setAction(async (taskArgs, hre) => {
    await tronSetup(hre.artifacts, hre.network.name, taskArgs.address, taskArgs.type);
  });

task("tron:setRelay", "Initialize MOS relay address")
  .addParam("address", "mos contract address")
  .addParam("chain", "chain id")
  .setAction(async (taskArgs, hre) => {
    await tronSetRelay(hre.artifacts, hre.network.name, taskArgs.address, taskArgs.chain);
  });

task("tron:registerToken", "MOS sets allowed cross-chain tokens")
  .addParam("token", "token address")
  .addParam("chains", "chain ids allowed to cross, separated by ',', ex. `1,2,3` ")
  .addOptionalParam("enable", "true or false", true, types.boolean)
  .setAction(async (taskArgs, hre) => {
    await tronRegisterToken(hre.artifacts, hre.network.name, taskArgs.token, taskArgs.chains, taskArgs.enable);
  });

task("tron:setMintableToken", "MOS sets mintable token")
  .addParam("token", "token address")
  .addParam("mintable", "true or false", false, types.boolean)
  .setAction(async (taskArgs, hre) => {
    await tronSetMintableToken(hre.artifacts, hre.network.name, taskArgs.token, taskArgs.mintable);
  });

task("tron:deployRootToken", "deploy root token on tron")
  .addParam("name", "tron root token name")
  .addParam("symbol", "tron root token symbol")
  .addOptionalParam("decimals", "tron root token decimals", 18, types.int)
  .setAction(async (taskArgs, hre) => {
    await tronDeployRootToken(hre.artifacts, hre.network.name, taskArgs.name, taskArgs.symbol, taskArgs.decimals);
  });

task("tron:mintRootToken", "mint root token")
  .addOptionalParam("address", "mint address", "", types.string)
  .addParam("amount", "mint amount")
  .setAction(async (taskArgs, hre) => {
    // await tronDeployRootToken(hre.artifacts,hre.network.name,taskArgs.name,taskArgs.symbol,taskArgs.supply)

    let tronWeb = await getTron(network.name);

    let deployer = tronWeb.defaultAddress.hex;
    console.log("deployer :", tronWeb.address.fromHex(deployer));

    let deploy = await readFromFile(network);
    if (!deploy[network.name]["rootToken"]) {
      throw "root token not deployed ...";
    }
    console.log("root token address:", deploy[network.name]["rootToken"]);

    let RootToken = await artifacts.readArtifact("RootERC20");
    let token = await tronWeb.contract(RootToken.abi, deploy[network.name]["rootToken"]);

    let addr = taskArgs.address;
    if (addr === "") {
      addr = tronWeb.address.fromHex(deployer);
    }
    console.log("mint addr :", addr);

    if (addr.substr(0, 2) != "0x") {
      addr = "0x" + tronWeb.address.toHex(addr).substring(2);
    }

    await token.mint(addr, taskArgs.amount).send();

    console.log(`token mint ${addr} with amount ${taskArgs.amount} successfully `);
  });

task("tron:burnRootToken", "burn root token")
  .addParam("amount", "mint amount")
  .setAction(async (taskArgs, hre) => {
    let tronWeb = await getTron(network.name);

    let deployer = tronWeb.defaultAddress.hex;
    console.log("deployer :", tronWeb.address.fromHex(deployer));

    let deploy = await readFromFile(network);
    if (!deploy[network.name]["rootToken"]) {
      throw "root token not deployed ...";
    }
    console.log("root token address:", deploy[network.name]["rootToken"]);

    let RootToken = await artifacts.readArtifact("RootERC20");
    let token = await tronWeb.contract(RootToken.abi, deploy[network.name]["rootToken"]);

    await token.burn(taskArgs.amount).send();

    console.log(`token burn with amount ${taskArgs.amount} successfully `);
  });

task("tron:deployChildToken", "deploy child token on bttc")
  .addParam("name", "tron root token name")
  .addParam("symbol", "tron root token symbol")
  .setAction(async (taskArgs, hre) => {
    const { deploy } = hre.deployments;
    const accounts = await ethers.getSigners();
    const deployer = accounts[0];
    console.log("deployer address:", deployer.address);
    if (hre.network.name === "Bttc" || hre.network.name === "BttcTest") {
      let childChainManager;
      if (hre.network.name === "Bttc") {
        childChainManager = "0x9a15f3a682d086c515be4037bda3b0676203a8ef";
      } else {
        childChainManager = "0xfe22C61F33e6d39c04dE80B7DE4B1d83f75210C4";
      }
      let Impl = await ethers.getContractFactory("ChildERC20");
      await deploy("ChildERC20", {
        from: deployer.address,
        args: [],
        log: true,
        contract: "ChildERC20",
      });
      let impl = await ethers.getContract("ChildERC20");
      console.log("ChildERC20 impl deployed to ", impl.address);
      let data = Impl.interface.encodeFunctionData("initialize", [
        deployer.address,
        taskArgs.name,
        taskArgs.symbol,
        childChainManager,
      ]);

      await deploy("ChildERC20Proxy", {
        from: deployer.address,
        args: [impl.address, data],
        log: true,
        contract: "ChildERC20Proxy",
      });
      let proxy = await ethers.getContract("ChildERC20Proxy");

      console.log("ChildERC20 proxy deployed to ", proxy.address);
    } else {
      throw "unsupport chain";
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

task("tron:list", "List tron mos  infos")
  .addOptionalParam("mos", "The mos address, default mos", "mos", types.string)
  .addOptionalParam("token", "The token address, default wtoken", "wtoken", types.string)
  .setAction(async (taskArgs, hre) => {
    await tronList(hre.artifacts, hre.network.name, taskArgs.mos, taskArgs.token);
  });

function stringToHex(str) {
  return str
    .split("")
    .map(function (c) {
      return ("0" + c.charCodeAt(0).toString(16)).slice(-2);
    })
    .join("");
}
