let { create, createZk, createTron, readFromFile, writeToFile } = require("../../utils/create.js");
let { getChain, getToken, getFeeList } = require("../../utils/helper");

async function getRelay(network) {
    let BridgeAndRelay = await ethers.getContractFactory("BridgeAndRelay");
    let deployment = await readFromFile(network);
    let addr = deployment[network]["bridgeProxy"];
    if (!addr) {
        throw "relay not deployed.";
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

task("relay:updateToken", "update token fee to target chain")
    .addParam("token", "relay chain token name")
    .setAction(async (taskArgs, hre) => {
        const accounts = await ethers.getSigners();
        const deployer = accounts[0];
        console.log("deployer address:", deployer.address);

        let tokenAddr = await getToken(hre.network.config.chainId, taskArgs.token);
        let token = await ethers.getContractAt("IERC20MetadataUpgradeable", tokenAddr);
        let decimals = await token.decimals();
        console.log(`token ${taskArgs.token} address: ${token.address}, decimals ${decimals}`);

        let feeList = await getFeeList(taskArgs.token);
        let chainList = Object.keys(feeList);

        // todo update chain and mintable
        for (let i = 0; i < chainList.length; i++) {
            let chain = await getChain(chainList[i]);

            let chainFee = feeList[chain.chain];
            let targetDecimals = chainFee.decimals;
            let targetToken = await getToken(chain.chainId, taskArgs.token);
            console.log(`target ${chain.chainId}, ${targetToken}, ${targetDecimals}`)
            await hre.run("register:mapToken", {
                token: tokenAddr,
                chain: chain.chainId,
                target: targetToken,
                decimals: targetDecimals
            });

            await hre.run("register:setTokenFee", {
                token: tokenAddr,
                chain: chain.chainId,
                lowest: chainFee.fee.min,
                highest: chainFee.fee.max,
                rate: chainFee.fee.rate,
                decimals: targetDecimals
            });

            let transferOutFee = chainFee.outFee;
            if (transferOutFee === undefined) {
                transferOutFee = {min: "0", max: "0", rate: "0"}
            }

            await hre.run("register:setTransferOutFee", {
                token: tokenAddr,
                chain: chain.chainId,
                lowest: transferOutFee.min,
                highest: transferOutFee.max,
                rate: transferOutFee.rate,
                decimals: targetDecimals
            });
        }

        console.log(`Token register manager update token ${taskArgs.token} success`);
    });

task("relay:list", "List relay infos")
    .addOptionalParam("mos", "The mos address, default mos", "mos", types.string)
    .setAction(async (taskArgs, hre) => {
        const accounts = await ethers.getSigners();
        const deployer = accounts[0];
        const chainId = await deployer.getChainId();
        console.log("deployer address:", deployer.address);
        let address = taskArgs.mos;
        if (address === "mos") {
            let proxy = await getMos(chainId, hre.network.name);
            if (!proxy) {
                throw "mos not deployed ...";
            }
            address = proxy.address;
        }
        console.log("mos address:\t", address);

        let mos = await ethers.getContractAt("MAPOmnichainServiceRelayV2", address);
        let tokenmanager = await mos.tokenRegister();
        let wtoken = await mos.wToken();
        let selfChainId = await mos.selfChainId();
        let lightClientManager = await mos.lightClientManager();
        let vaultFee = await mos.distributeRate(0);
        let relayFee = await mos.distributeRate(1);
        let protocolFee = await mos.distributeRate(2);

        console.log("selfChainId:\t", selfChainId.toString());
        console.log("light client manager:", lightClientManager);
        console.log("Owner:\t", await mos.getAdmin());
        console.log("Impl:\t", await mos.getImplementation());
        console.log("wToken address:\t", wtoken);
        console.log("Token manager:\t", tokenmanager);


        console.log(`distribute vault rate: rate(${vaultFee[1]})`);
        console.log(`distribute relay rate: rate(${relayFee[1]}), receiver(${relayFee[0]})`);
        console.log(`distribute protocol rate: rate(${protocolFee[1]}), receiver(${protocolFee[0]})`);

        let manager = await ethers.getContractAt("TokenRegisterV2", tokenmanager);
        console.log("Token manager owner:\t", await manager.getAdmin());

        let chainList = await getChainList();
        console.log("\nRegister chains:");
        let chains = [selfChainId];
        for (let i = 0; i < chainList.length; i++) {
            let contract = await mos.mosContracts(chainList[i].chainId);
            if (contract != "0x") {
                let chaintype = await mos.chainTypes(chainList[i].chainId);
                console.log(`type(${chaintype}) ${chainList[i].chainId}\t => ${contract} `);
                chains.push(chainList[i].chainId);
            }
        }
    });

