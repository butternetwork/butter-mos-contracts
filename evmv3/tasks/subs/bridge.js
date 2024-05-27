const { types } = require("zksync-web3");
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

task("bridge:deploy", "bridge deploy")
    .addParam("wrapped", "native wrapped token address")
    .addParam("mos", "mos address")
    .setAction(async (taskArgs, hre) => {
        const { deploy } = hre.deployments;
        const accounts = await ethers.getSigners();
        const deployer = accounts[0];
        let bridge_addr;
        let Bridge = await ethers.getContractFactory("Bridge");

        if (hre.network.name === "Tron" || hre.network.name === "TronTest") {
            let networkName = hre.network.name;
            let impl = await createTron("Bridge", [], hre.artifacts, networkName);
            let data = await Bridge.interface.encodeFunctionData("initialize", [
                await toHex(taskArgs.wrapped, networkName),
                await getTronDeployer(true, networkName),
            ]);
            bridge_addr = await createTron("ButterProxy", [impl, data], hre.artifacts, networkName);
            bridge_addr = await fromHex(bridge_addr, networkName);
            let bridge = await getTronContract("Bridge", hre.artifacts, networkName, bridge_addr);
            await bridge.setMapoService(await toHex(taskArgs.mos, networkName)).send();
            console.log("wToken", await bridge.wToken().call());
            console.log("mos", await bridge.mos().call());
        } else if (hre.network.name === "zkSync") {
            let data = await Bridge.interface.encodeFunctionData("initialize", [taskArgs.wrapped, deployer.address]);
            console.log("deployer address is:", deployer.address);
            let impl = await createZk("Bridge", [], hre);
            bridge_addr = await createZk("ButterProxy", [impl, data], hre);
            let bridge = Bridge.attach(bridge_addr);
            await (await bridge.setMapoService(taskArgs.mos)).wait();
            console.log("wToken", await bridge.wToken());
            console.log("mos", await bridge.mos());
        } else {
            let data = await Bridge.interface.encodeFunctionData("initialize", [taskArgs.wrapped, deployer.address]);
            console.log("deployer address is:", deployer.address);
            await deploy("Bridge", {
                from: deployer.address,
                args: [],
                log: true,
                contract: "Bridge",
            });
            let impl = (await hre.deployments.get("Bridge")).address;
            let Proxy = await ethers.getContractFactory("ButterProxy");
            let proxy_salt = process.env.BRIDGE_PROXY_SALT;
            let param = ethers.utils.defaultAbiCoder.encode(["address", "bytes"], [impl, data]);
            let createResult = await create(proxy_salt, Proxy.bytecode, param);
            if (!createResult[1]) {
                return;
            }
            bridge_addr = createResult[0];
            let bridge = Bridge.attach(bridge_addr);
            await (await bridge.setMapoService(taskArgs.mos)).wait();
            console.log("wToken", await bridge.wToken());
            console.log("mos", await bridge.mos());
            await verify(
                bridge_addr,
                [impl.address, data],
                "contracts/ButterProxy.sol:ButterProxy",
                hre.network.config.chainId,
                false
            );
            await verify(impl, [], "contracts/Bridge.sol:Bridge", hre.network.config.chainId, false);
        }
        let deployment = await readFromFile(hre.network.name);
        deployment[hre.network.name]["bridgeProxy"] = bridge_addr;
        await writeToFile(deployment);
    });

task("bridge:upgrade", "upgrade bridge evm contract in proxy").setAction(async (taskArgs, hre) => {
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

task("bridge:removeMintableToken", "remove Mintable Token")
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
            await bridge.removeMintableToken(tokenList).send();
        } else {
            console.log("operator address is:", deployer.address);
            let bridge = Bridge.attach(addr);
            await (await bridge.removeMintableToken(tokenList)).wait();
        }
    });
task("bridge:setNearChainId", "set near chainId")
    .addParam("chain", "near chain id")
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
            await bridge.setNearChainId(taskArgs.chain).send();
        } else {
            console.log("operator address is:", deployer.address);
            let bridge = Bridge.attach(addr);
            await (await bridge.setNearChainId(taskArgs.chain)).wait();
        }
    });

task("bridge:updateMorc20Proxy", "set near chainId")
    .addParam("prox", "near chain id")
    .addParam("flag", "support or not")
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
            await bridge.updateMorc20Proxy(taskArgs.prox, taskArgs.flag).send();
        } else {
            console.log("operator address is:", deployer.address);
            let bridge = Bridge.attach(addr);
            await (await bridge.updateMorc20Proxy(taskArgs.prox, taskArgs.flag)).wait();
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
