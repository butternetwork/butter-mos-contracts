let { saveDeployment, getDeployment, getToken} = require("../utils/utils");
let { create, getTronContract } = require("../../utils/create.js");
let { verify } = require("../../utils/verify.js");


task("ProtocolFee:deploy", "Deploy the ProtocolFee")
  .addParam("authority")
  .setAction(async (taskArgs, hre) => {
    const { deploy } = hre.deployments;
    const accounts = await ethers.getSigners();
    const deployer = accounts[0];

    console.log("deployer address:", deployer.address);
    let ProtocolFee = await ethers.getContractFactory("ProtocolFee");
    let implAddr = await create(hre, deployer, "ProtocolFee", [], [], "");
    let data = await ProtocolFee.interface.encodeFunctionData("initialize", [taskArgs.authority]);
    let proxy = await create(hre, deployer, "OmniServiceProxy", ["address", "bytes"], [implAddr, data], "");
    await saveDeployment(hre.network.name, "ProtocolFee", proxy);
    await verify(implAddr, [], "contracts/periphery/ProtocolFee.sol:ProtocolFee", hre.network.config.chainId, true);
    await verify(
      proxy,
      [implAddr, data],
      "contracts/OmniServiceProxy.sol:OmniServiceProxy",
      hre.network.config.chainId,
      false,
    );
  });

task("ProtocolFee:upgrade", "upgrade ProtocolFee")
  .setAction(async (taskArgs, hre) => {
    const accounts = await ethers.getSigners();
    const deployer = accounts[0];
    console.log("deployer address:", deployer.address);
    let addr = await getDeployment(hre.network.name, "ProtocolFee");

    if (!addr) throw "ProtocolFee not deployed";

    let ProtocolFee = await ethers.getContractFactory("ProtocolFee");

    let p = ProtocolFee.attach(addr);

    let implAddr = await create(hre, deployer, "ProtocolFee", [], [], "");

    console.log("pre impl", await p.getImplementation());
    await(await p.upgradeToAndCall(implAddr, "0x")).wait();
    console.log("new impl", await p.getImplementation());
    await verify(implAddr, [], "contracts/periphery/ProtocolFee.sol:ProtocolFee", hre.network.config.chainId, true);
  });


task("ProtocolFee:set", "set swap and relay address")
  .setAction(async (taskArgs, hre) => {
    const accounts = await ethers.getSigners();
    const deployer = accounts[0];
    console.log("deployer address:", deployer.address);
    let addr = await getDeployment(hre.network.name, "ProtocolFee");

    if (!addr) throw "ProtocolFee not deployed";

    let ProtocolFee = await ethers.getContractFactory("ProtocolFee");

    let p = ProtocolFee.attach(addr);
    
    let swap = "0x828aBe0885c28274749c8C012Da10BF0F94fa78b";

    let relay = "0x0000317Bec33Af037b5fAb2028f52d14658F6A56"

    console.log(`pre swap address is:`, await p.swap());
    console.log(`pre relay address is:`, await p.feeTreasury());

    await(await p.set(swap, relay)).wait();

    console.log(`after swap address is:`, await p.swap());
    console.log(`after relay address is:`, await p.feeTreasury());

  });


task("ProtocolFee:updateTokens", "update Tokens")
  .setAction(async (taskArgs, hre) => {
    const accounts = await ethers.getSigners();
    const deployer = accounts[0];
    console.log("deployer address:", deployer.address);
    let addr = await getDeployment(hre.network.name, "ProtocolFee");

    if (!addr) throw "ProtocolFee not deployed";

    let ProtocolFee = await ethers.getContractFactory("ProtocolFee");

    let p = ProtocolFee.attach(addr);
    
    let tokens = [
      "0x33daba9618a75a7aff103e53afe530fbacf4a3dd", // usdt
      "0x05ab928d446d8ce6761e368c8e7be03c3168a9ec", // eth
      "0x9f722b2cb30093f766221fd0d37964949ed66918", // usdc
      "0xb877e3562a660c7861117c2f1361a26abaf19beb"  // btc
    ]
    let add = true;
    await(await p.updateTokens(tokens, add)).wait();
  });

task("ProtocolFee:updateShares", "update Shares")
  .setAction(async (taskArgs, hre) => {
    const accounts = await ethers.getSigners();
    const deployer = accounts[0];
    console.log("deployer address:", deployer.address);
    let addr = await getDeployment(hre.network.name, "ProtocolFee");

    if (!addr) throw "ProtocolFee not deployed";

    let ProtocolFee = await ethers.getContractFactory("ProtocolFee");

    let p = ProtocolFee.attach(addr);
    
    let feeTypes = [
        0, // dev
        1, // buyback
        2, // reserve
        3  // stake
    ]

    let shares = [
        250,
        250,
        250,
        250
    ]


    await(await p.updateShares(feeTypes, shares)).wait();

    console.log(`total share is :`, await p.totalShare());

    for (let index = 0; index < feeTypes.length; index++) {
      const element = feeTypes[index];
      console.log(`feeType(${element}) share is:`, await p.getFeeShare(element));
    }
  });


  
task("ProtocolFee:updateReceivers", "update Shares")
  .setAction(async (taskArgs, hre) => {
    const accounts = await ethers.getSigners();
    const deployer = accounts[0];
    console.log("deployer address:", deployer.address);
    let addr = await getDeployment(hre.network.name, "ProtocolFee");

    if (!addr) throw "ProtocolFee not deployed";

    let ProtocolFee = await ethers.getContractFactory("ProtocolFee");

    let p = ProtocolFee.attach(addr);
    
    let feeTypes = [
        0, // dev
        1, // buyback
        2, // reserve
        3  // stake
    ]

    let receivers = [
        "",
        "",
        "",
        ""
    ]

    await(await p.updateReceivers(feeTypes, receivers)).wait();

    for (let index = 0; index < feeTypes.length; index++) {
      const element = feeTypes[index];
      console.log(`feeType(${element}) receiver is:`, await p.getFeeReceiver(element));
    }
  });