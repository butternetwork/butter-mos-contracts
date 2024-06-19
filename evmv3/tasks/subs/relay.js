let { create, createZk, createTron, readFromFile, writeToFile } = require("../../utils/create.js");
let { getChain } = require("../../utils/helper");

task("relay:deploy", "mos relay deploy")
    .addOptionalParam("wrapped", "native wrapped token address", "", types.string)
    .addOptionalParam("mos", "omni-chain service address", "", types.string)
    .addOptionalParam("auth", "Send through authority call, default false", false, types.boolean)
    .setAction(async (taskArgs, hre) => {
        const { deploy } = hre.deployments;
        const accounts = await ethers.getSigners();
        const deployer = accounts[0];
        console.log("deployer address:", deployer.address);

        let chain = await getChain(hre.network.config.chainId);

        let mos = taskArgs.mos === "" ? chain.mos : taskArgs.mos;
        let wrapped = taskArgs.wrapped === "" ? chain.wToken : taskArgs.wrapped;

        let implAddr = await create(hre, deployer, "BridgeAndRelay", [], [], "");

        let BridgeAndRelay = await ethers.getContractFactory("BridgeAndRelay");
        let data = await BridgeAndRelay.interface.encodeFunctionData("initialize", [wrapped, deployer.address]);
        let proxy_salt = process.env.BRIDGE_PROXY_SALT;

        let bridge = await create(hre, deployer, "BridgeProxy", ["address", "bytes"], [implAddr, data], proxy_salt);

        let relay = BridgeAndRelay.attach(bridge);
        await (await relay.setOmniService(mos)).wait();

        console.log("wToken", await relay.wToken());
        console.log("mos", await relay.mos());

        let deployment = await readFromFile(hre.network.name);
        deployment[hre.network.name]["bridgeProxy"] = bridge;
        await writeToFile(deployment);

        // todo contract verify
    });

task("relay:upgrade", "upgrade bridge evm contract in proxy")
    .addOptionalParam("impl", "implementation address", "", types.string)
    .addOptionalParam("auth", "Send through authority call, default false", false, types.boolean)
    .setAction(async (taskArgs, hre) => {
        const { deploy } = hre.deployments;
        const accounts = await ethers.getSigners();
        const deployer = accounts[0];
        console.log("deployer address:", deployer.address);

        let implAddr = taskArgs.impl;
        if (implAddr === "") {
            implAddr = await create(hre, deployer, "BridgeAndRelay", [], [], "");
        }

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

task("relay:registerChain", "register Chain")
    .addParam("chain", "chainId")
    .addParam("address", "chainId => address")
    .setAction(async (taskArgs, hre) => {
        const accounts = await ethers.getSigners();
        const deployer = accounts[0];
        console.log("deployer address:", deployer.address);
        let BridgeAndRelay = await ethers.getContractFactory("BridgeAndRelay");
        let deployment = await readFromFile(hre.network.name);
        let relay = BridgeAndRelay.attach(deployment[hre.network.name]["bridgeProxy"]);
        await (await relay.registerChain([taskArgs.chain], [taskArgs.address])).wait();
    });

task("relay:registerTokenChains", "register token Chains")
    .addParam("chains", "chains address")
    .addParam("token", "token address")
    .addParam("enable", "enable bridge")
    .setAction(async (taskArgs, hre) => {
        const accounts = await ethers.getSigners();
        const deployer = accounts[0];
        let chainList = taskArgs.chains.split(",");
        let BridgeAndRelay = await ethers.getContractFactory("BridgeAndRelay");
        let deployment = await readFromFile(hre.network.name);
        let addr = deployment[hre.network.name]["bridgeProxy"];
        if (!addr) {
            throw "bridge not deployed.";
        }
        console.log("operator address is:", deployer.address);
        let relay = BridgeAndRelay.attach(addr);
        await (await relay.registerTokenChains(taskArgs.token, chainList, taskArgs.enable)).wait();
    });

task("relay:setBaseGas", "set base gas")
    .addParam("chain", "chain id")
    .addParam("outtype", "Out type 0 - swap,1 - deposit")
    .addParam("gas", "base gas")
    .setAction(async (taskArgs, hre) => {
        const accounts = await ethers.getSigners();
        const deployer = accounts[0];
        console.log("deployer address:", deployer.address);
        let BridgeAndRelay = await ethers.getContractFactory("BridgeAndRelay");
        let deployment = await readFromFile(hre.network.name);
        let relay = BridgeAndRelay.attach(deployment[hre.network.name]["bridgeProxy"]);
        await (await relay.registerChain(taskArgs.chain, taskArgs.outtype, taskArgs.gas)).wait();
    });

task("relay:setNear", "set distribute rate")
    .addParam("chain", "near chain id")
    .addParam("adaptor", "near mos v2 adapter")
    .setAction(async (taskArgs, hre) => {
        const accounts = await ethers.getSigners();
        const deployer = accounts[0];
        console.log("deployer address:", deployer.address);

        let BridgeAndRelay = await ethers.getContractFactory("BridgeAndRelay");
        let deployment = await readFromFile(hre.network.name);
        let relay = BridgeAndRelay.attach(deployment[hre.network.name]["bridgeProxy"]);
        await (await relay.setNear(taskArgs.chain, taskArgs.adptor)).wait();
    });

task("relay:updateTokens", "update tokens")
    .addParam("tokens", "tokens")
    .addParam("proxys", "proxys")
    .addParam("feature", "feature")
    .setAction(async (taskArgs, hre) => {
        const accounts = await ethers.getSigners();
        const deployer = accounts[0];
        console.log("deployer address:", deployer.address);

        let tokenList = tokens.split(",");
        let proxyList = proxys.split(",");
        let BridgeAndRelay = await ethers.getContractFactory("BridgeAndRelay");
        let deployment = await readFromFile(hre.network.name);
        let relay = BridgeAndRelay.attach(deployment[hre.network.name]["bridgeProxy"]);
        await (await relay.updateMorc20Proxy(tokenList, proxyList, taskArgs.feature)).wait();
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
        if (taskArgs.role === "upgrade") {
            role = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("UPGRADE_ROLE"));
        } else if (taskArgs.role === "manage") {
            role = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("MANAGE_ROLE"));
        } else {
            role = ethers.constants.HashZero;
        }
        await (await relay.grantRole(role, taskArgs.account)).wait();
    });
