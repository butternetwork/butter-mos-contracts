let { create, createZk, createTron, readFromFile, writeToFile } = require("../../utils/create.js");

task("relay:deploy", "mos relay deploy")
    .addParam("wrapped", "native wrapped token address")
    .addParam("mos", "mos address")
    .setAction(async (taskArgs, hre) => {
        const { deploy } = hre.deployments;
        const accounts = await ethers.getSigners();
        const deployer = accounts[0];
        console.log("deployer address:", deployer.address);
        await deploy("BridgeAndRelay", {
            from: deployer.address,
            args: [],
            log: true,
            contract: "BridgeAndRelay",
        });
        let impl = await ethers.getContract("BridgeAndRelay");
        let implAddr = impl.address;
        let BridgeAndRelay = await ethers.getContractFactory("BridgeAndRelay");
        let data = await BridgeAndRelay.interface.encodeFunctionData("initialize", [taskArgs.wrapped, deploy.address]);
        let Proxy = await ethers.getContractFactory("ButterProxy");
        let proxy_salt = process.env.BRIDGE_PROXY_SALT;
        let param = ethers.utils.defaultAbiCoder.encode(["address", "bytes"], [implAddr, data]);
        let createResult = await create(proxy_salt, Proxy.bytecode, param);
        if (!createResult[1]) {
            return;
        }
        let bridge = createResult[0];
        let relay = BridgeAndRelay.attach(bridge);
        await (await relay.setMapoService(taskArgs.maos)).wait();
        console.log("wToken", await relay.wToken());
        console.log("mos", await relay.mos());
        let deployment = await readFromFile(hre.network.name);
        deployment[hre.network.name]["bridgeProxy"] = bridge;
        await writeToFile(deployment);
    });

task("relay:upgrade", "upgrade bridge evm contract in proxy").setAction(async (taskArgs, hre) => {
    const { deploy } = hre.deployments;
    const accounts = await ethers.getSigners();
    const deployer = accounts[0];
    console.log("deployer address:", deployer.address);
    await deploy("BridgeAndRelay", {
        from: deployer.address,
        args: [],
        log: true,
        contract: "BridgeAndRelay",
    });
    let impl = await ethers.getContract("BridgeAndRelay");
    let implAddr = impl.address;
    let BridgeAndRelay = await ethers.getContractFactory("BridgeAndRelay");
    let deployment = await readFromFile(hre.network.name);
    let relay = BridgeAndRelay.attach(deployment[hre.network.name]["bridgeProxy"]);
    console.log("pre impl", await relay.getImplementation());
    await (await relay.upgradeTo(implAddr)).wait();
    console.log("new impl", await relay.getImplementation());
});

task("relay:setTokenRegister", "set token register")
    .addParam("register", "register address")
    .setAction(async (taskArgs, hre) => {
        const accounts = await ethers.getSigners();
        const deployer = accounts[0];
        console.log("deployer address:", deployer.address);
        let BridgeAndRelay = await ethers.getContractFactory("BridgeAndRelay");
        let deployment = await readFromFile(hre.network.name);
        let relay = BridgeAndRelay.attach(deployment[hre.network.name]["bridgeProxy"]);
        await (await relay.setTokenRegister(taskArgs.register)).wait();
        console.log("tokenRegister:", await relay.tokenRegister());
    });

task("relay:setDistributeRate", "set distribute rate")
    .addParam("id", "distribute id")
    .addParam("receiver", "distribute receiver")
    .addParam("rate", "distribute _rate")
    .setAction(async (taskArgs, hre) => {
        const accounts = await ethers.getSigners();
        const deployer = accounts[0];
        console.log("deployer address:", deployer.address);
        let BridgeAndRelay = await ethers.getContractFactory("BridgeAndRelay");
        let deployment = await readFromFile(hre.network.name);
        let relay = BridgeAndRelay.attach(deployment[hre.network.name]["bridgeProxy"]);
        await (await relay.setDistributeRate(taskArgs.id, taskArgs.receiver, taskArgs.rate)).wait();
    });

task("relay:registerChain", "set distribute rate")
    .addParam("chain", "chainId")
    .addParam("address", "chainId => address")
    .setAction(async (taskArgs, hre) => {
        const accounts = await ethers.getSigners();
        const deployer = accounts[0];
        console.log("deployer address:", deployer.address);
        let BridgeAndRelay = await ethers.getContractFactory("BridgeAndRelay");
        let deployment = await readFromFile(hre.network.name);
        let relay = BridgeAndRelay.attach(deployment[hre.network.name]["bridgeProxy"]);
        await (await relay.registerChain(taskArgs.chain, taskArgs.address)).wait();
    });

task("relay:grantRole", "grant Role")
    .addParam("role", "role address")
    .addParam("account", "account address")
    .setAction(async (taskArgs, hre) => {
        const accounts = await ethers.getSigners();
        const deployer = accounts[0];
        console.log("deployer address:", deployer.address);
        let BridgeAndRelay = await ethers.getContractFactory("BridgeAndRelay");
        let deployment = await readFromFile(hre.network.name);
        let relay = BridgeAndRelay.attach(deployment[hre.network.name]["bridgeProxy"]);
        let role;
        if (taskArgs === "upgrade") {
            role = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("UPGRADE_ROLE"));
        } else if (taskArgs.role === "manage") {
            role = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("MANAGE_ROLE"));
        } else {
            role = ethers.constants.HashZero;
        }
        await (await relay.grantRole(role, taskArgs.account)).wait();
    });
