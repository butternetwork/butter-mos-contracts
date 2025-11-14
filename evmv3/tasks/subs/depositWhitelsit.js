let { saveDeployment, getDeployment, getToken} = require("../utils/utils");
let { create, getTronContract } = require("../../utils/create.js");
let { verify } = require("../../utils/verify.js");

task("depositWhitelsit:deploy", "Deploy the depositWhitelsit")
  .addParam("authority")
  .setAction(async (taskArgs, hre) => {
    const { deploy } = hre.deployments;
    const accounts = await ethers.getSigners();
    const deployer = accounts[0];

    console.log("deployer address:", deployer.address);
    let DepositWhitelist = await ethers.getContractFactory("DepositWhitelist");
    let implAddr = await create(hre, deployer, "DepositWhitelist", [], [], "");
    let data = await DepositWhitelist.interface.encodeFunctionData("initialize", [taskArgs.authority]);
    let proxy = await create(hre, deployer, "OmniServiceProxy", ["address", "bytes"], [implAddr, data], "");
    await saveDeployment(hre.network.name, "DepositWhitelist", proxy);
    await verify(implAddr, [], "contracts/periphery/DepositWhitelist.sol:DepositWhitelist", hre.network.config.chainId, true);
    await verify(
      proxy,
      [implAddr, data],
      "contracts/OmniServiceProxy.sol:OmniServiceProxy",
      hre.network.config.chainId,
      false,
    );
  });

task("depositWhitelsit:upgrade", "upgrade depositWhitelsit")
  .setAction(async (taskArgs, hre) => {
    const accounts = await ethers.getSigners();
    const deployer = accounts[0];
    console.log("deployer address:", deployer.address);
    let addr = await getDeployment(hre.network.name, "DepositWhitelist");

    if (!addr) throw "DepositWhitelist not deployed";

    let DepositWhitelist = await ethers.getContractFactory("DepositWhitelist");

    let d = DepositWhitelist.attach(addr);

    let implAddr = await create(hre, deployer, "DepositWhitelist", [], [], "");

    console.log("pre impl", await d.getImplementation());
    await (await d.upgradeToAndCall(implAddr, "0x")).wait();
    console.log("new impl", await d.getImplementation());

    await verify(implAddr, [], "contracts/periphery/DepositWhitelist.sol:DepositWhitelist", hre.network.config.chainId, true);

  });

task("depositWhitelsit:switchToggle", "switch Toggle")
  .setAction(async (taskArgs, hre) => {
    const accounts = await ethers.getSigners();
    const deployer = accounts[0];
    console.log("deployer address:", deployer.address);
    let addr = await getDeployment(hre.network.name, "DepositWhitelist");

    if (!addr) throw "DepositWhitelist not deployed";

    let DepositWhitelist = await ethers.getContractFactory("DepositWhitelist");

    let d = DepositWhitelist.attach(addr);

    console.log(`pre switch status is`, await d.whitelistSwitch());

    await(await d.switchToggle()).wait();

    console.log(`after switch status is`, await d.whitelistSwitch());

  });


task("depositWhitelsit:updateTokenLimit", "update Token Limit")
  .setAction(async (taskArgs, hre) => {
    const accounts = await ethers.getSigners();
    const deployer = accounts[0];
    console.log("deployer address:", deployer.address);
    let addr = await getDeployment(hre.network.name, "DepositWhitelist");

    if (!addr) throw "DepositWhitelist not deployed";

    let DepositWhitelist = await ethers.getContractFactory("DepositWhitelist");

    let d = DepositWhitelist.attach(addr);

    let tokens = [
      "0x33daba9618a75a7aff103e53afe530fbacf4a3dd", //usdt
    ] 

    let limits = [
      ethers.utils.parseUnits("5000", 18),
    ]

    await(await d.updateTokenLimit(tokens, limits)).wait();

    for (let index = 0; index < tokens.length; index++) {
      const element = tokens[index];
      console.log(`token(${element}) deposit limit is:`, await d.getTokenLimit(element));
    }

  });

task("depositWhitelsit:updateWhitelist", "update Whitelist")
  .setAction(async (taskArgs, hre) => {
    const accounts = await ethers.getSigners();
    const deployer = accounts[0];
    console.log("deployer address:", deployer.address);
    let addr = await getDeployment(hre.network.name, "DepositWhitelist");

    if (!addr) throw "DepositWhitelist not deployed";

    let DepositWhitelist = await ethers.getContractFactory("DepositWhitelist");

    let d = DepositWhitelist.attach(addr);

    let users = [

    ]

    let flag = true;

    if(users.length === 0) {
      throw("users is empty");

    }
    await(await d.updateWhitelist(users, flag)).wait();
    for (let index = 0; index < users.length; index++) {
      const element = users[index];
      console.log(`user(${element}) whitelist status is:`, await d.inWhitelist(element));
    }
  });