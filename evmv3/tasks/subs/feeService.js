let { create, readFromFile, writeToFile } = require("../../utils/create.js");
let { getChain, getToken } = require("../../utils/helper");
const {verify} = require("../utils/verify");

task("fee:deploy", "Deploy the fee service")
    .addOptionalParam("admin", "admin address", "0xACC31A6756B60304C03d6626fc98c062E4539CCA", types.string)
  .setAction(async (taskArgs, hre) => {
    const { deploy } = hre.deployments;
    const accounts = await ethers.getSigners();
    const deployer = accounts[0];

    console.log("deployer address:", deployer.address);

    let admin = taskArgs.admin;
    if (admin === "") {
        admin = deployer.address;
    }
    console.log("admin address:", admin);

    let FeeService = await ethers.getContractFactory("FeeService");
    let service_salt = process.env.FEE_SERVICE_SALT;
    let service_addr = await create(hre, deployer, "FeeService", ["address"], [admin], service_salt);
    let service = FeeService.attach(service_addr);
    //await (await service.initialize()).wait();
    console.log("owner:",await service.authority());
    let deployment = await readFromFile(hre.network.name);
    deployment[hre.network.name]["feeService"] = service_addr;
    await writeToFile(deployment);

      await verify(service_addr, [admin], "contracts/FeeService.sol:FeeService", hre.network.config.chainId, true);

  });

task("fee:setBaseGas", "set Base Gas")
  .addParam("chain", "chain Id")
  .addParam("gas", "base gas Limit")
  .setAction(async (taskArgs, hre) => {
    let deployment = await readFromFile(hre.network.name);
    let service_addr = deployment[hre.network.name]["feeService"];
    if(!service_addr) throw "fee service not deploy";
    let FeeService = await ethers.getContractFactory("FeeService");
    let service = FeeService.attach(service_addr);

    await(await service.setBaseGas(taskArgs.chain, taskArgs.gas)).wait()
  });


task("fee:setChainGasPrice", "set chainGas price")
  .addParam("chain", "chain Id")
  .addParam("token", "token address")
  .addParam("price", "chain gas price")
  .setAction(async (taskArgs, hre) => {
    let deployment = await readFromFile(hre.network.name);
    let service_addr = deployment[hre.network.name]["feeService"];
    if(!service_addr) throw "fee service not deploy";
    let FeeService = await ethers.getContractFactory("FeeService");
    let service = FeeService.attach(service_addr);

    await(await service.setChainGasPrice(taskArgs.chain, taskArgs.token, taskArgs.price)).wait()
  });

task("fee:setTokenDecimals", "set Token Decimals")
  .addParam("token", "token address")
  .addParam("decimal", "token decimal")
  .setAction(async (taskArgs, hre) => {
    let deployment = await readFromFile(hre.network.name);
    let service_addr = deployment[hre.network.name]["feeService"];
    if(!service_addr) throw "fee service not deploy";
    let FeeService = await ethers.getContractFactory("FeeService");
    let service = FeeService.attach(service_addr);

    await(await service.setTokenDecimals(taskArgs.token, taskArgs.decimal)).wait()
  });


  task("fee:setFeeReceiver", "set Token Decimals")
  .addParam("receiver", "receiver address")
  .setAction(async (taskArgs, hre) => {
    let deployment = await readFromFile(hre.network.name);
    let service_addr = deployment[hre.network.name]["feeService"];
    if(!service_addr) throw "fee service not deploy";
    let FeeService = await ethers.getContractFactory("FeeService");
    let service = FeeService.attach(service_addr);

    await(await service.setFeeReceiver(taskArgs.receiver)).wait()
  });


