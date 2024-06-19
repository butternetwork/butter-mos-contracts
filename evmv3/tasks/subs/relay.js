let { create, createZk, createTron, readFromFile, writeToFile } = require("../../utils/create.js");
let { getChain } = require("../../utils/helper");

async function getRelay(network) {
    let BridgeAndRelay = await ethers.getContractFactory("BridgeAndRelay");
    let deployment = await readFromFile(network);
    let addr = deployment[network]["bridgeProxy"];
    if (!addr) {
        throw "bridge not deployed.";
    }

    let relay = BridgeAndRelay.attach(addr);

    console.log("relay address:", relay.address);
    return relay;
}

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

        let relay = await getRelay(hre.network.name);

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

        let relay = await getRelay(hre.network.name);

        await (await relay.setTokenRegister(taskArgs.register)).wait();
        console.log("tokenRegister:", await relay.tokenRegister());
    });

task("relay:setDistributeRate", "set distribute rate")
    .addParam("id", "distribute id, 0 - vault, 1 - relayer, 2 - protocol")
    .addOptionalParam("receiver", "receiver address", "0x0000000000000000000000000000000000000DEF", types.string)
    .addParam("rate", "The percentage value of the fee charged, unit 0.000001")
    .setAction(async (taskArgs, hre) => {
        const accounts = await ethers.getSigners();
        const deployer = accounts[0];
        console.log("deployer address:", deployer.address);

        let relay = await getRelay(hre.network.name);

        await (await relay.setDistributeRate(taskArgs.id, taskArgs.receiver, taskArgs.rate)).wait();
    });

task("relay:registerChain", "register Chain")
    .addParam("chain", "chainId")
    .addParam("address", "chainId => address")
    .addOptionalParam("type", "chain type, default 1", 1, types.int)
    .setAction(async (taskArgs, hre) => {
        const accounts = await ethers.getSigners();
        const deployer = accounts[0];
        console.log("deployer address:", deployer.address);

        let relay = await getRelay(hre.network.name);

        await (await relay.registerChain([taskArgs.chain], [taskArgs.address], taskArgs.type)).wait();
        console.log(`register chain ${taskArgs.chain} address ${taskArgs.address} success`);
    });

task("relay:registerTokenChains", "register token Chains")
    .addParam("chains", "chains address")
    .addParam("token", "token address")
    .addParam("enable", "enable bridge")
    .setAction(async (taskArgs, hre) => {
        const accounts = await ethers.getSigners();
        const deployer = accounts[0];
        let chainList = taskArgs.chains.split(",");

        console.log("operator address is:", deployer.address);
        let relay = await getRelay(hre.network.name);
        await (await relay.registerTokenChains(taskArgs.token, chainList, taskArgs.enable)).wait();
    });

task("relay:setBaseGas", "set base gas")
    .addParam("chain", "chain id")
    .addParam("type", "Out type, 0 - swap, 1 - deposit, 2 - morc20")
    .addParam("gas", "base gas limit")
    .setAction(async (taskArgs, hre) => {
        const accounts = await ethers.getSigners();
        const deployer = accounts[0];
        console.log("deployer address:", deployer.address);
        let relay = await getRelay(hre.network.name);

        await (await relay.setBaseGas(taskArgs.chain, taskArgs.type, taskArgs.gas)).wait();
    });

task("relay:setNear", "set distribute rate")
    .addParam("chain", "near chain id")
    .addParam("adaptor", "near mos v2 adapter")
    .setAction(async (taskArgs, hre) => {
        const accounts = await ethers.getSigners();
        const deployer = accounts[0];
        console.log("deployer address:", deployer.address);

        let relay = await getRelay(hre.network.name);

        await (await relay.setNear(taskArgs.chain, taskArgs.adaptor)).wait();
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
        let relay = await getRelay(hre.network.name);
        await (await relay.updateMorc20Proxy(tokenList, proxyList, taskArgs.feature)).wait();
    });

task("relay:grantRole", "grant Role")
    .addParam("role", "role address")
    .addParam("account", "account address")
    .addOptionalParam("grant", "grant or revoke", true, types.boolean)
    .setAction(async (taskArgs, hre) => {
        const accounts = await ethers.getSigners();
        const deployer = accounts[0];
        console.log("deployer address:", deployer.address);

        let BridgeAndRelay = await ethers.getContractFactory("BridgeAndRelay");
        let deployment = await readFromFile(hre.network.name);
        let relay = BridgeAndRelay.attach(deployment[hre.network.name]["bridgeProxy"]);
        console.log("bridge relay:", relay.address);

        let role;
        if (taskArgs.role === "upgrade" || taskArgs.role === "upgrader") {
            role = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("UPGRADER_ROLE"));
        } else if (taskArgs.role === "manage" || taskArgs.role === "manager") {
            role = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("MANAGER_ROLE"));
        } else {
            role = ethers.constants.HashZero;
        }

        if (taskArgs.grant) {
            await (await relay.grantRole(role, taskArgs.account)).wait();
            console.log(`grant ${taskArgs.account} role ${role}`);
        } else {
            await relay.revokeRole(role, taskArgs.account);
            console.log(`revoke ${taskArgs.account} role ${role}`);
        }
    });
