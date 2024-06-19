// const { types } = require("zksync-web3");
let {
    create,
    createZk,
    createTron,
    readFromFile,
    writeToFile,
    getTronContract,
    fromHex,
    getTronDeployer,
    toHex,
} = require("../../utils/create.js");

let { verify } = require("../utils/verify.js");
let { getChain } = require("../../utils/helper");

async function getBridge(network) {
    let Bridge = await ethers.getContractFactory("Bridge");
    let deployment = await readFromFile(network);
    let addr = deployment[network]["bridgeProxy"];
    if (!addr) {
        throw "bridge not deployed.";
    }

    let bridge;
    if (network === "Tron" || network === "TronTest") {
        bridge = await getTronContract("Bridge", hre.artifacts, hre.network.name, addr);
    } else {
        bridge = Bridge.attach(addr);
    }

    console.log("bridge address:", bridge.address);
    return bridge;
}


task("bridge:deploy", "bridge deploy")
    .addOptionalParam("wrapped", "native wrapped token address", "", types.string)
    .addOptionalParam("mos", "omni-chain service address", "", types.string)
    .addOptionalParam("auth", "Send through authority call, default false", false, types.boolean)
    .setAction(async (taskArgs, hre) => {
        const { deploy } = hre.deployments;
        const accounts = await ethers.getSigners();
        const deployer = accounts[0];
        console.log("deployer:", deployer.address);

        let chain = await getChain(hre.network.config.chainId);

        let mos = taskArgs.mos === "" ? chain.mos : taskArgs.mos;
        let wrapped = taskArgs.wrapped === "" ? chain.wToken : taskArgs.wrapped;
        console.log("wrapped token:", wrapped);
        console.log("mos address:", mos);

        let implAddr = await create(hre, deployer, "Bridge", [], [], "");

        let Bridge = await ethers.getContractFactory("Bridge");
        if (hre.network.name === "Tron" || hre.network.name === "TronTest") {
            wrapped = await toHex(wrapped, hre.network.name);
        }
        let data = await Bridge.interface.encodeFunctionData("initialize", [wrapped, deployer.address]);
        let proxy_salt = process.env.BRIDGE_PROXY_SALT;
        let proxy = await create(hre, deployer, "BridgeProxy", ["address", "bytes"], [implAddr, data], proxy_salt);

        if (hre.network.name === "Tron" || hre.network.name === "TronTest") {
            // bridge_addr = await fromHex(bridge_addr, networkName);
            let bridge = await getTronContract("Bridge", hre.artifacts, networkName, proxy);
            await bridge.setOmniService(mos).send();
            console.log("wToken", await bridge.wToken().call());
            console.log("mos", await bridge.mos().call());
        } else {
            let bridge = Bridge.attach(proxy);
            await (await bridge.setOmniService(mos)).wait();
            console.log("wToken", await bridge.wToken());
            console.log("mos", await bridge.mos());
        }

        let deployment = await readFromFile(hre.network.name);
        deployment[hre.network.name]["bridgeProxy"] = proxy;
        await writeToFile(deployment);

        await verify(
            proxy,
            [implAddr, data],
            "contracts/BridgeProxy.sol:BridgeProxy",
            hre.network.config.chainId,
            true
        );
        await verify(implAddr, [], "contracts/Bridge.sol:Bridge", hre.network.config.chainId, false);
    });

task("bridge:upgrade", "upgrade bridge evm contract in proxy")
    .addOptionalParam("impl", "implementation address", "", types.string)
    .addOptionalParam("auth", "Send through authority call, default false", false, types.boolean)
    .setAction(async (taskArgs, hre) => {
        const accounts = await ethers.getSigners();
        const deployer = accounts[0];

        let implAddr = taskArgs.impl;
        if (implAddr === "") {
            implAddr = await create(hre, deployer, "BridgeAndRelay", [], [], "");
        }

        let deployment = await readFromFile(hre.network.name);
        let Bridge = await ethers.getContractFactory("Bridge");
        let proxy = deployment[hre.network.name]["bridgeProxy"];
        if (!proxy) {
            throw "bridge not deployed.";
        }

        if (hre.network.name === "Tron" || hre.network.name === "TronTest") {
            // bridge_addr = await fromHex(bridge_addr, networkName);
            let bridge = await getTronContract("Bridge", hre.artifacts, networkName, proxy);
            console.log("pre impl", await bridge.getImplementation().call());
            await bridge.upgradeTo(implAddr).send();
            console.log("new impl", await bridge.getImplementation().call());
        } else {
            let bridge = Bridge.attach(proxy);
            console.log("pre impl", await bridge.getImplementation());
            await bridge.upgradeTo(implAddr);
            console.log("new impl", await bridge.getImplementation());
        }

        await verify(implAddr, [], "contracts/Bridge.sol:Bridge", hre.network.config.chainId, true);
    });

task("bridge:setBaseGas", "set base gas")
    .addParam("chain", "register address")
    .addParam("type", "Out type, 0 - swap, 1 - deposit, 2 - morc20")
    .addParam("gas", "base gas")
    .setAction(async (taskArgs, hre) => {
        const accounts = await ethers.getSigners();
        const deployer = accounts[0];
        console.log("deployer address:", deployer.address);

        let bridge = await getBridge(hre.network.name);

        if (hre.network.name === "Tron" || hre.network.name === "TronTest") {
            await bridge.setBaseGas(taskArgs.chain, taskArgs.outtype, taskArgs.gas).send();
        } else {
            await (await bridge.setBaseGas(taskArgs.chain, taskArgs.type, taskArgs.gas)).wait();
        }
    });

task("bridge:setRelay", "set relay")
    .addParam("chain", "register address")
    .addParam("address", "register address")
    .setAction(async (taskArgs, hre) => {
        const accounts = await ethers.getSigners();
        const deployer = accounts[0];

        console.log("deployer address is:", deployer.address);

        let bridge = await getBridge(hre.network.name);

        if (hre.network.name === "Tron" || hre.network.name === "TronTest") {
            await bridge.setRelay(taskArgs.chain, taskArgs.address).send();
        } else {
            console.log(`${bridge.address}, ${taskArgs.chain}`)
            await (await bridge.setRelay(taskArgs.chain, taskArgs.address)).wait();
            console.log("relay chain", await bridge.relayChainId());
            console.log("relay address", await bridge.relayContract());
        }
    });

task("bridge:registerTokenChains", "register token Chains")
    .addParam("chains", "chains address")
    .addParam("token", "token address")
    .addParam("enable", "enable bridge")
    .setAction(async (taskArgs, hre) => {
        const accounts = await ethers.getSigners();
        const deployer = accounts[0];
        let chainList = taskArgs.chains.split(",");
        let Bridge = await ethers.getContractFactory("Bridge");
        let deployment = await readFromFile(hre.network.name);
        let addr = deployment[hre.network.name]["bridgeProxy"];
        if (!addr) {
            throw "bridge not deployed.";
        }
        if (hre.network.name === "Tron" || hre.network.name === "TronTest") {
            let bridge = await getTronContract("Bridge", hre.artifacts, hre.network.name, addr);
            await bridge.registerTokenChains(taskArgs.token, chainList, taskArgs.enable).send();
        } else {
            console.log("operator address is:", deployer.address);
            let bridge = Bridge.attach(addr);
            await (await bridge.registerTokenChains(taskArgs.token, chainList, taskArgs.enable)).wait();
        }
    });

task("bridge:addMintableToken", "add Mintable Token")
    .addParam("tokens", "chains address")
    .setAction(async (taskArgs, hre) => {
        const accounts = await ethers.getSigners();
        const deployer = accounts[0];
        let tokenList = taskArgs.tokens.split(",");
        let Bridge = await ethers.getContractFactory("Bridge");
        let deployment = await readFromFile(hre.network.name);
        let addr = deployment[hre.network.name]["bridgeProxy"];
        if (!addr) {
            throw "bridge not deployed.";
        }
        if (hre.network.name === "Tron" || hre.network.name === "TronTest") {
            let bridge = await getTronContract("Bridge", hre.artifacts, hre.network.name, addr);
            await bridge.addMintableToken(tokenList).send();
        } else {
            console.log("operator address is:", deployer.address);
            let bridge = Bridge.attach(addr);
            await (await bridge.addMintableToken(tokenList)).wait();
        }
    });

task("bridge:updateTokens", "update tokens")
    .addParam("tokens", "tokens")
    .addParam("proxys", "proxys")
    .addParam("feature", "feature")
    .setAction(async (taskArgs, hre) => {
        const accounts = await ethers.getSigners();
        const deployer = accounts[0];
        let Bridge = await ethers.getContractFactory("Bridge");
        let deployment = await readFromFile(hre.network.name);
        let addr = deployment[hre.network.name]["bridgeProxy"];
        if (!addr) {
            throw "bridge not deployed.";
        }
        let tokenList = tokens.split(",");
        let proxyList = proxys.split(",");
        if (hre.network.name === "Tron" || hre.network.name === "TronTest") {
            let bridge = await getTronContract("Bridge", hre.artifacts, hre.network.name, addr);
            await bridge.updateTokens(tokenList, proxyList, taskArgs.feature).send();
        } else {
            console.log("operator address is:", deployer.address);
            let bridge = Bridge.attach(addr);
            await (await bridge.updateTokens(tokenList, proxyList, taskArgs.feature)).wait();
        }
    });

task("bridge:grantRole", "grant role")
    .addParam("role", "role address")
    .addParam("account", "account address")
    .addOptionalParam("grant", "grant or revoke", true, types.boolean)
    .setAction(async (taskArgs, hre) => {
        const { deploy } = hre.deployments;
        const accounts = await ethers.getSigners();
        const deployer = accounts[0];

        let role;
        if (taskArgs.role === "upgrade" || taskArgs.role === "upgrader") {
            role = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("UPGRADER_ROLE"));
        } else if (taskArgs.role === "manage" || taskArgs.role === "manager") {
            role = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("MANAGER_ROLE"));
        } else {
            role = ethers.constants.HashZero;
        }

        let Bridge = await ethers.getContractFactory("Bridge");
        let deployment = await readFromFile(hre.network.name);
        let addr = deployment[hre.network.name]["bridgeProxy"];
        if (!addr) {
            throw "bridge not deployed.";
        }

        if (hre.network.name === "Tron" || hre.network.name === "TronTest") {
            let bridge = await getTronContract("Bridge", hre.artifacts, hre.network.name, addr);
            await bridge.grantRole(role, await toHex(taskArgs.account, hre.network.name)).send();
        } else {
            console.log("operator address is:", deployer.address);
            let bridge = Bridge.attach(addr);
            await (await bridge.grantRole(role, taskArgs.account)).wait();
        }
    });
