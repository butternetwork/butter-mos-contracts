let { create, readFromFile, writeToFile } = require("../../utils/create.js");
let { getChain, getToken, getChainList, getFeeList } = require("../../utils/helper");

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

task("relay:setButterRouter", "set butter router address")
    .addParam("router", "butter router address")
    .setAction(async (taskArgs, hre) => {
        const accounts = await ethers.getSigners();
        const deployer = accounts[0];
        console.log("deployer address:", deployer.address);

        let relay = await getRelay(hre.network.name);

        await (await relay.setButterRouter(taskArgs.router)).wait();
        console.log("butterRouter:", await relay.butterRouter());
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

        let relay = await getRelay(hre.network.name);

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

task("relay:updateToken", "update token bridge and fee to target chain")
    .addParam("token", "relay chain token name")
    .setAction(async (taskArgs, hre) => {
        const accounts = await ethers.getSigners();
        const deployer = accounts[0];
        // console.log("deployer address:", deployer.address);

        await hre.run("bridge:updateToken", {
            token: taskArgs.token,
        });

        let tokenAddr = await getToken(hre.network.config.chainId, taskArgs.token);
        let token = await ethers.getContractAt("IERC20MetadataUpgradeable", tokenAddr);
        let decimals = await token.decimals();
        // console.log(`token ${taskArgs.token} address: ${token.address}, decimals ${decimals}`);

        let feeList = await getFeeList(taskArgs.token);
        let chainList = Object.keys(feeList);
        for (let i = 0; i < chainList.length; i++) {
            let chain = await getChain(chainList[i]);
            let chainFee = feeList[chain.chain];

            let targetToken = await getToken(chain.chainId, taskArgs.token);
            // console.log(`target ${chain.chainId}, ${targetToken}, ${chainFee.decimals}`)
            await hre.run("register:mapToken", {
                token: tokenAddr,
                chain: chain.chainId,
                target: targetToken,
                decimals: chainFee.decimals,
            });

            await hre.run("register:setTokenFee", {
                token: tokenAddr,
                chain: chain.chainId,
                lowest: chainFee.fee.min,
                highest: chainFee.fee.max,
                rate: chainFee.fee.rate,
                decimals: decimals,
            });

            let transferOutFee = chainFee.outFee;
            if (transferOutFee === undefined) {
                transferOutFee = { min: "0", max: "0", rate: "0" };
            }
            await hre.run("register:setTransferOutFee", {
                token: tokenAddr,
                chain: chain.chainId,
                lowest: transferOutFee.min,
                highest: transferOutFee.max,
                rate: transferOutFee.rate,
                decimals: decimals,
            });
        }

        console.log(`Update token ${taskArgs.token} success`);
    });

task("relay:list", "List relay infos")
    .addOptionalParam("mos", "The mos address, default mos", "mos", types.string)
    .setAction(async (taskArgs, hre) => {
        const accounts = await ethers.getSigners();
        const deployer = accounts[0];
        const chainId = await deployer.getChainId();
        console.log("deployer address:", deployer.address);

        let relay = await getRelay(hre.network.name);

        let tokenmanager = await relay.tokenRegister();
        let selfChainId = await relay.selfChainId();
        console.log("selfChainId:\t", selfChainId.toString());
        console.log("mos:", await relay.mos());
        console.log("Impl:\t", await relay.getImplementation());
        console.log("wToken address:\t", await relay.wToken());
        console.log("Token manager:\t", await relay.tokenRegister());

        console.log("fee receiver:\t", await relay.nativeFeeReceiver());

        console.log("base fee swap:\t", await relay.baseGasLookup(0, 0));
        console.log("base fee deposit:\t", await relay.baseGasLookup(0, 1));
        console.log("base fee intertransfer:\t", await relay.baseGasLookup(0, 2));

        let vaultFee = await relay.distributeRate(0);
        let relayFee = await relay.distributeRate(1);
        let protocolFee = await relay.distributeRate(2);
        console.log(`distribute vault rate: rate(${vaultFee[1]})`);
        console.log(`distribute relay rate: rate(${relayFee[1]}), receiver(${relayFee[0]})`);
        console.log(`distribute protocol rate: rate(${protocolFee[1]}), receiver(${protocolFee[0]})`);

        let chainList = await getChainList();
        console.log("\nRegister chains:");
        let chains = [selfChainId];
        for (let i = 0; i < chainList.length; i++) {
            let contract = await relay.bridges(chainList[i].chainId);
            if (contract !== "0x") {
                let chaintype = await relay.chainTypes(chainList[i].chainId);
                console.log(`type(${chaintype}) ${chainList[i].chainId}\t => ${contract} `);
                chains.push(chainList[i].chainId);
            }
        }
    });

task("relay:tokenInfo", "List token infos")
    .addOptionalParam("token", "The token address, default wtoken", "wtoken", types.string)
    .setAction(async (taskArgs, hre) => {
        let relay = await getRelay(hre.network.name);
        let tokenManager = await relay.tokenRegister();
        let manager = await ethers.getContractAt("TokenRegisterV3", tokenManager);
        console.log("Token manager:\t", manager.address);

        let tokenAddr = taskArgs.token;
        if (tokenAddr === "wtoken") {
            tokenAddr = await relay.wToken();
        }
        tokenAddr = await getToken(hre.network.config.chainId, tokenAddr);

        await hre.run("bridge:tokenInfo", { token: taskArgs.token });

        let token = await manager.tokenList(tokenAddr);
        console.log(`token decimals:\t ${token.decimals}`);
        console.log(`vault address: ${token.vaultToken}`);

        let vault = await ethers.getContractAt("VaultTokenV3", token.vaultToken);
        let totalVault = await vault.totalVault();
        console.log(`total token:\t ${totalVault}`);
        let totalSupply = await vault.totalSupply();
        console.log(`total vault supply: ${totalSupply}`);

        let chainList = await getChainList();
        let chains = [hre.network.config.chainId];
        for (let i = 0; i < chainList.length; i++) {
            let contract = await relay.bridges(chainList[i].chainId);
            if (contract !== "0x") {
                chains.push(chainList[i].chainId);
            }
        }
        console.log(`chains:`);
        for (let i = 0; i < chains.length; i++) {
            let info = await manager.getTargetFeeInfo(tokenAddr, chains[i]);
            console.log(`${chains[i]}\t => ${info[0]} (${info[1]}), `);

            let balance = await vault.vaultBalance(chains[i]);
            console.log(`\t vault(${balance}), fee min(${info[2][0]}), max(${info[2][1]}), rate(${info[2][2]})`);
        }
    });
