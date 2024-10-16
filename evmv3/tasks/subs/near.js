let { create, readFromFile, writeToFile } = require("../../utils/create.js");

task("adaptor:deploy", "mos relay deploy")
  .addParam("near", "near mos v2 address")
  .addParam("mos", "mos v3 address")
  .setAction(async (taskArgs, hre) => {
    const { deploy } = hre.deployments;
    const accounts = await ethers.getSigners();
    const deployer = accounts[0];
    console.log("deployer address:", deployer.address);
    await deploy("NearMosAdptor", {
      from: deployer.address,
      args: [],
      log: true,
      contract: "NearMosAdptor",
    });
    let impl = await hre.deployments.get("NearMosAdptor");
    let implAddr = impl.address;
    let NearMosAdptor = await ethers.getContractFactory("NearMosAdptor");
    let data = await NearMosAdptor.interface.encodeFunctionData("initialize", [deployer.address]);
    let Proxy = await ethers.getContractFactory("ButterProxy");
    let proxy_salt = process.env.NEAR_ADAPTOR_SALT;
    let param = ethers.utils.defaultAbiCoder.encode(["address", "bytes"], [implAddr, data]);
    let createResult = await create(proxy_salt, Proxy.bytecode, param);
    if (!createResult[1]) {
      return;
    }
    let addr = createResult[0];
    let adaptor = NearMosAdptor.attach(addr);
    await (await adaptor.setMos(taskArgs.mos, taskArgs.near)).wait();
    console.log("near mos v2", await adaptor.nearMos());
    console.log("mos v3", await adaptor.mos());
    let deployment = await readFromFile(hre.network.name);
    deployment[hre.network.name]["nearMosAdaptor"] = addr;
    await writeToFile(deployment);
  });

task("adaptor:upgrade", "upgrade bridge evm contract in proxy").setAction(async (taskArgs, hre) => {
  const { deploy } = hre.deployments;
  const accounts = await ethers.getSigners();
  const deployer = accounts[0];
  console.log("deployer address:", deployer.address);
  await deploy("NearMosAdptor", {
    from: deployer.address,
    args: [],
    log: true,
    contract: "NearMosAdptor",
  });
  let impl = await hre.deployments.get("NearMosAdptor");
  let implAddr = impl.address;
  let NearMosAdptor = await ethers.getContractFactory("NearMosAdptor");
  let deployment = await readFromFile(hre.network.name);
  let adaptor = NearMosAdptor.attach(deployment[hre.network.name]["nearMosAdaptor"]);
  console.log("pre impl", await adaptor.getImplementation());
  await (await adaptor.upgradeTo(implAddr)).wait();
  console.log("new impl", await adaptor.getImplementation());
});

task("adaptor:setBridge", "set token register")
  .addParam("bridge", "bridge address")
  .setAction(async (taskArgs, hre) => {
    const accounts = await ethers.getSigners();
    const deployer = accounts[0];
    console.log("deployer address:", deployer.address);
    let NearMosAdptor = await ethers.getContractFactory("NearMosAdptor");
    let deployment = await readFromFile(hre.network.name);
    let adaptor = NearMosAdptor.attach(deployment[hre.network.name]["nearMosAdaptor"]);
    await (await adaptor.setBridge(taskArgs.bridge)).wait();
    console.log("bridge:", await adaptor.bridge());
  });

task("adaptor:setGasLimit", "set distribute rate")
  .addParam("gaslimit", "gas for dst call")
  .setAction(async (taskArgs, hre) => {
    const accounts = await ethers.getSigners();
    const deployer = accounts[0];
    console.log("deployer address:", deployer.address);
    let NearMosAdptor = await ethers.getContractFactory("NearMosAdptor");
    let deployment = await readFromFile(hre.network.name);
    let adaptor = NearMosAdptor.attach(deployment[hre.network.name]["nearMosAdaptor"]);
    await (await adaptor.setGasLimit(taskArgs.gaslimit)).wait();
    console.log("gasLimit:", await adaptor.gasLimit());
  });

task("adaptor:setLightNode", "set distribute rate")
  .addParam("lightnode", "near lightnode on mapo")
  .setAction(async (taskArgs, hre) => {
    const accounts = await ethers.getSigners();
    const deployer = accounts[0];
    console.log("deployer address:", deployer.address);
    let NearMosAdptor = await ethers.getContractFactory("NearMosAdptor");
    let deployment = await readFromFile(hre.network.name);
    let adaptor = NearMosAdptor.attach(deployment[hre.network.name]["nearMosAdaptor"]);
    await (await adaptor.setLightNode(taskArgs.lightnode)).wait();
    console.log("lightNode:", await adaptor.nearLightNode());
  });

task("relay:grantRole", "grant Role")
  .addParam("role", "role address")
  .addParam("account", "account address")
  .setAction(async (taskArgs, hre) => {
    const accounts = await ethers.getSigners();
    const deployer = accounts[0];
    console.log("deployer address:", deployer.address);
    let NearMosAdptor = await ethers.getContractFactory("NearMosAdptor");
    let deployment = await readFromFile(hre.network.name);
    let adaptor = NearMosAdptor.attach(deployment[hre.network.name]["nearMosAdaptor"]);
    let role;
    if (taskArgs.role === "upgrade") {
      role = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("UPGRADE_ROLE"));
    } else if (taskArgs.role === "manage") {
      role = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("MANAGE_ROLE"));
    } else {
      role = ethers.constants.HashZero;
    }
    await (await adaptor.grantRole(role, taskArgs.account)).wait();
  });
