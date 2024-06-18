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
let {getChain} = require("../../utils/helper");

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

        let mos = (taskArgs.mos === "") ? chain.mos : taskArgs.mos;
        let wrapped = (taskArgs.wrapped === "") ? chain.wToken : taskArgs.wrapped;
        console.log("wrapped token:", wrapped);
        console.log("mos address:", mos);

        let implAddr = await create(hre, deployer, "Bridge", [], [], "");
        console.log("bridge impl address:", implAddr);

        let Bridge = await ethers.getContractFactory("Bridge");
        if (hre.network.name === "Tron" || hre.network.name === "TronTest") {
            wrapped = await toHex(wrapped, hre.network.name);
        }
        let data = await Bridge.interface.encodeFunctionData("initialize", [
            wrapped,
            deployer.address,
        ]);
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
    .setAction(async (taskArgs, hre) => {
    const { deploy } = hre.deployments;
    const accounts = await ethers.getSigners();
    const deployer = accounts[0];
    let deployment = await readFromFile(hre.network.name);
    let Bridge = await ethers.getContractFactory("Bridge");
    let addr = deployment[hre.network.name]["bridgeProxy"];
    if (!addr) {
        throw "bridge not deployed.";
    }
    if (hre.network.name === "Tron" || hre.network.name === "TronTest") {
        let impl = await createTron("Bridge", [], hre.artifacts, hre.network.name);
        let bridge = await getTronContract("Bridge", hre.artifacts, hre.network.name, addr);
        console.log("pre impl", await bridge.getImplementation().call());
        await bridge.upgradeTo(impl).send();
        console.log("new impl", await bridge.getImplementation().call());
    } else if (hre.network.name === "zkSync") {
        console.log("deployer address:", deployer.address);
        let impl = await createZk("Bridge", [], hre);
        let bridge = Bridge.attach(addr);
        console.log("pre impl", await bridge.getImplementation());
        await bridge.upgradeTo(impl);
        console.log("new impl", await bridge.getImplementation());
    } else {
        console.log("deployer address:", deployer.address);
        await deploy("Bridge", {
            from: deployer.address,
            args: [],
            log: true,
            contract: "Bridge",
        });
        let impl = (await hre.deployments.get("Bridge")).address;
        let bridge = Bridge.attach(addr);
        console.log("pre impl", await bridge.getImplementation());
        await (await bridge.upgradeTo(impl)).wait();
        console.log("new impl", await bridge.getImplementation());
        await verify(impl, [], "contracts/Bridge.sol:Bridge", hre.network.config.chainId, false);
    }
});

task("bridge:setBaseGas", "set base gas")
    .addParam("chain", "register address")
    .addParam("outtype", "Out type 0 - swap,1 - deposit")
    .addParam("gas", "base gas")
    .setAction(async (taskArgs, hre) => {
        const accounts = await ethers.getSigners();
        const deployer = accounts[0];
        let Bridge = await ethers.getContractFactory("Bridge");
        let deployment = await readFromFile(hre.network.name);
        let addr = deployment[hre.network.name]["bridgeProxy"];
        if (!addr) {
            throw "bridge not deployed.";
        }
        if (hre.network.name === "Tron" || hre.network.name === "TronTest") {
            let bridge = await getTronContract("Bridge", hre.artifacts, hre.network.name, addr);
            await bridge.registerChain(taskArgs.chain, taskArgs.outtype, taskArgs.gas).send();
        } else {
            console.log("operator address is:", deployer.address);
            let bridge = Bridge.attach(addr);
            await (await bridge.registerChain(taskArgs.chain, taskArgs.outtype, taskArgs.gas)).wait();
        }
    });

task("bridge:setRelay", "set relay")
    .addParam("chain", "register address")
    .addParam("address", "register address")
    .setAction(async (taskArgs, hre) => {
        const accounts = await ethers.getSigners();
        const deployer = accounts[0];
        let Bridge = await ethers.getContractFactory("Bridge");
        let deployment = await readFromFile(hre.network.name);
        let addr = deployment[hre.network.name]["bridgeProxy"];
        if (!addr) {
            throw "bridge not deployed.";
        }
        if (hre.network.name === "Tron" || hre.network.name === "TronTest") {
            let bridge = await getTronContract("Bridge", hre.artifacts, hre.network.name, addr);
            await bridge.setRelay(taskArgs.chain, taskArgs.address).send();
        } else {
            console.log("operator address is:", deployer.address);
            let bridge = Bridge.attach(addr);
            await (await bridge.setRelay(taskArgs.chain, taskArgs.address)).wait();
        }
    });

task("bridge:registerChain", "register Chain")
    .addParam("chain", "chainId")
    .addParam("address", "chainId => address")
    .setAction(async (taskArgs, hre) => {
        const accounts = await ethers.getSigners();
        const deployer = accounts[0];
        let Bridge = await ethers.getContractFactory("Bridge");
        let deployment = await readFromFile(hre.network.name);
        let addr = deployment[hre.network.name]["bridgeProxy"];
        if (!addr) {
            throw "bridge not deployed.";
        }
        if (hre.network.name === "Tron" || hre.network.name === "TronTest") {
            let bridge = await getTronContract("Bridge", hre.artifacts, hre.network.name, addr);
            await bridge.setRelay([taskArgs.chain], [taskArgs.address]).send();
        } else {
            console.log("operator address is:", deployer.address);
            let bridge = Bridge.attach(addr);
            await (await bridge.setRelay([taskArgs.chain], [taskArgs.address])).wait();
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
    .setAction(async (taskArgs, hre) => {
        const { deploy } = hre.deployments;
        const accounts = await ethers.getSigners();
        const deployer = accounts[0];
        let role;
        if (taskArgs.role === "upgrade") {
            role = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("UPGRADE_ROLE"));
        } else if (taskArgs.role === "manage") {
            role = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("MANAGE_ROLE"));
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
