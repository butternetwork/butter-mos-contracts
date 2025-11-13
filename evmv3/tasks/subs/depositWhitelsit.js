let { saveDeployment, getDeployment, getToken} = require("../utils/utils");
let { create, getTronContract } = require("../../utils/create.js");

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
  });

task("depositWhitelsit:upgrade", "upgrade depositWhitelsit")
  .setAction(async (taskArgs, hre) => {
    let addr = await getDeployment(hre.network.name, "DepositWhitelist");

    if (!addr) throw "DepositWhitelist not deployed";

    let DepositWhitelist = await ethers.getContractFactory("DepositWhitelist");

    let d = DepositWhitelist.attach(addr);

    let implAddr = await create(hre, deployer, "DepositWhitelist", [], [], "");

    console.log("pre impl", await d.getImplementation());
    await (await d.upgradeToAndCall(implAddr, "0x")).wait();
    console.log("new impl", await d.getImplementation());

  });


task("depositWhitelsit:updateTokenLimit", "update Token Limit")
  .setAction(async (taskArgs, hre) => {
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

    await(await d.updateTokenLimit(tokens, limits)).waits();

    for (let index = 0; index < tokens.length; index++) {
      const element = tokens[index];
      console.log(`token(${element}) deposit limit is:`, await d.getTokenLimit(element));
    }

  });

task("depositWhitelsit:updateWhitelist", "update Whitelist")
  .setAction(async (taskArgs, hre) => {
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
    await(await d.updateWhitelist(users, flag)).waits();
    for (let index = 0; index < users.length; index++) {
      const element = users[index];
      console.log(`user(${element}) whitelist status is:`, await d.inWhitelist(element));
    }
  });