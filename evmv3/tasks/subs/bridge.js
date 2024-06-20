// const { types } = require("zksync-web3");
let {
    create,
    readFromFile,
    writeToFile,
    getTronContract,
    fromHex,
    getTronDeployer,
    toHex,
} = require("../../utils/create.js");

let { verify } = require("../utils/verify.js");
let { getChain, getToken, getFeeList, getChainList } = require("../../utils/helper");


async function getBridge(network, abstract) {
    let deployment = await readFromFile(network);
    let addr = deployment[network]["bridgeProxy"];
    if (!addr) {
        throw "bridge not deployed.";
    }

    let bridge;
    if (network === "Tron" || network === "TronTest") {
        bridge = await getTronContract("Bridge", hre.artifacts, hre.network.name, addr);
    } else {
        let contract = abstract ? "BridgeAbstract" : "Bridge";
        bridge = await ethers.getContractAt(contract, addr);
        // let Bridge = await ethers.getContractFactory(contract);
        // bridge = Bridge.attach(addr);
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

        await verify(implAddr, [], "contracts/Bridge.sol:Bridge", hre.network.config.chainId, true);

        await verify(
            proxy,
            [implAddr, data],
            "contracts/BridgeProxy.sol:BridgeProxy",
            hre.network.config.chainId,
            true
        );
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

        let bridge = await getBridge(hre.network.name, true);

        if (hre.network.name === "Tron" || hre.network.name === "TronTest") {
            console.log("pre impl", await bridge.getImplementation().call());
            await bridge.upgradeTo(implAddr).send();
            console.log("new impl", await bridge.getImplementation().call());
        } else {
            console.log("pre impl", await bridge.getImplementation());
            await bridge.upgradeTo(implAddr);
            console.log("new impl", await bridge.getImplementation());
        }

        await verify(implAddr, [], "contracts/Bridge.sol:Bridge", hre.network.config.chainId, true);
    });

task("bridge:setReceiver", "set native fee receiver")
    .addParam("receiver", "receiver address")
    .setAction(async (taskArgs, hre) => {
        const accounts = await ethers.getSigners();
        const deployer = accounts[0];

        console.log("deployer address is:", deployer.address);

        let bridge = await getBridge(hre.network.name, true);

        if (hre.network.name === "Tron" || hre.network.name === "TronTest") {
            await bridge.setNativeFeeReceiver(taskArgs.receiver).send();
        } else {
            await (await bridge.setNativeFeeReceiver(taskArgs.receiver)).wait();
            console.log("receiver address", await bridge.nativeFeeReceiver());
        }
    });

task("bridge:setBaseGas", "set base gas")
    .addParam("chain", "register address")
    .addParam("type", "Out type, 0 - swap, 1 - deposit, 2 - morc20")
    .addParam("gas", "base gas")
    .setAction(async (taskArgs, hre) => {
        const accounts = await ethers.getSigners();
        const deployer = accounts[0];
        console.log("deployer address:", deployer.address);

        let bridge = await getBridge(hre.network.name, true);

        if (hre.network.name === "Tron" || hre.network.name === "TronTest") {
            await bridge.setBaseGas(taskArgs.chain, taskArgs.outtype, taskArgs.gas).send();
        } else {
            await (await bridge.setBaseGas(taskArgs.chain, taskArgs.type, taskArgs.gas)).wait();
        }
    });

task("bridge:registerChain", "register Chain")
    .addParam("chains", "chainId")
    .addParam("addresses", "chainId => address")
    .setAction(async (taskArgs, hre) => {
        const accounts = await ethers.getSigners();
        const deployer = accounts[0];
        console.log("deployer address:", deployer.address);

        let bridge = await getBridge(hre.network.name, false);

        let chainList = taskArgs.chains.split(',');
        let addressList = taskArgs.addresses.split(',');

        if (hre.network.name === "Tron" || hre.network.name === "TronTest") {
        } else {
            await bridge.registerChain(chainList, addressList);
        }

        console.log(`register chain [${chainList}] address [${addressList}] success`);
    });

task("bridge:setRelay", "set relay")
    .addParam("chain", "register address")
    .addParam("address", "register address")
    .setAction(async (taskArgs, hre) => {
        const accounts = await ethers.getSigners();
        const deployer = accounts[0];

        console.log("deployer address is:", deployer.address);

        let bridge = await getBridge(hre.network.name, false);

        if (hre.network.name === "Tron" || hre.network.name === "TronTest") {
            await bridge.setRelay(taskArgs.chain, taskArgs.address).send();
        } else {
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

        let bridge = await getBridge(hre.network.name, true);

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

task("bridge:updateTokenChain", "update token to target chain")
    .addParam("token", "token name")
    .setAction(async (taskArgs, hre) => {
        const accounts = await ethers.getSigners();
        const deployer = accounts[0];
        console.log("deployer address:", deployer.address);

        let tokenAddr = await getToken(hre.network.config.chainId, taskArgs.token);
        console.log(`token ${taskArgs.token}  address: ${tokenAddr}`);

        let chain = await getChain(hre.network.config.chainId);
        let feeList = await getFeeList(taskArgs.token);
        let targetList = feeList[chain.chain].target;
        let tokenMintable = feeList[chain.chain].mintable;

        let bridge = await getBridge(hre.network.name, true);

        let chainList = await getChainList();
        let addList = [];
        let removeList = [];
        for (let i = 0; i < targetList.length; i++) {
            let targetChain = await getChain(targetList[i]);

            let bridgeable = await bridge.tokenMappingList(targetChain.chainId, tokenAddr);
            if (!bridgeable) {
                addList.push(targetChain.chainId);
            }
        }
        for (let i = 0; i < chainList.length; i++) {
            let j = 0;
            for (j = 0; j < targetList.length; j++) {
                if (chainList[i].chain === targetList[j]) {
                    break;
                }
            }
            if (j < targetList.length) {
                continue;
            }
            let bridgeable = await bridge.tokenMappingList(chainList[i].chainId, tokenAddr);
            if (bridgeable) {
                removeList.push(chainList[i].chainId);
            }
        }
        console.log("remove list", removeList);
        console.log("add list", addList);

        if (hre.network.name === "Tron" || hre.network.name === "TronTest") {
            await tronUpdateChain(hre.artifacts, hre.network.name, tokenAddr, addList, removeList);
        } else {
            let mintable = await bridge.isMintable(tokenAddr);
            if (tokenMintable !== mintable) {
                let feature = tokenMintable ? 0x01 : 0x00;
                await bridge.updateTokens([tokenAddr], [ethers.constants.AddressZero], feature);
                console.log(`set token ${taskArgs.token} mintable ${feature}`);
            }

            if (removeList.length > 0) {
                console.log(`remove token ${taskArgs.token} to chain ${removeList} ...`);
                await bridge.registerTokenChains(tokenAddr, removeList, false);
            }
            if (addList.length > 0) {
                console.log(`register token ${taskArgs.token} to chain ${addList} ...`);
                await bridge.registerTokenChains(tokenAddr, addList, true);
            }
        }

        console.log(`mos update update token ${taskArgs.token} bridge success`);
    });

task("bridge:updateMorc20", "update tokens")
    .addParam("token", "tokens")
    .addOptionalParam("proxy", "proxy", "0x0000000000000000000000000000000000000000", types.string)
    .addOptionalParam("feature", "0x02 - morc20", 0x02, types.int)
    .setAction(async (taskArgs, hre) => {
        const accounts = await ethers.getSigners();
        const deployer = accounts[0];
        console.log("deployer address is:", deployer.address);

        let bridge = await getBridge(hre.network.name, true);

        let token = await getToken(hre.network.config.chainId, taskArgs.token);
        console.log("token", token);
        console.log("proxy", taskArgs.proxy);
        console.log("feature", taskArgs.feature);

        if (hre.network.name === "Tron" || hre.network.name === "TronTest") {
            await bridge.updateTokens([token], [taskArgs.proxy], taskArgs.feature).send();

            console.log("token feature", await bridge.tokenFeatureList(token).call());
        } else {
            await (await bridge.updateTokens([token], [taskArgs.proxy], taskArgs.feature)).wait();

            console.log("token feature", await bridge.tokenFeatureList(token));
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

task("bridge:transferOut", "Cross-chain transfer token")
    .addOptionalParam("token", "The token address", "0x0000000000000000000000000000000000000000", types.string)
    .addOptionalParam("receiver", "The receiver address", "", types.string)
    .addOptionalParam("chain", "The receiver chain", "22776", types.string)
    .addParam("value", "transfer out value, unit WEI")
    .setAction(async (taskArgs, hre) => {
        const accounts = await ethers.getSigners();
        const deployer = accounts[0];

        console.log("transfer address:", deployer.address);

        let target = await getChain(taskArgs.chain);
        let targetChainId = target.chainId;
        console.log("target chain:", targetChainId);

        let receiver = taskArgs.receiver;
        if (taskArgs.receiver === "") {
            receiver = deployer.address;
        } else {
            if (taskArgs.receiver.substr(0, 2) != "0x") {
                receiver = "0x" + stringToHex(taskArgs.receiver);
            }
        }
        console.log("token receiver:", receiver);

        let tokenAddr = await getToken(hre.network.config.chainId, taskArgs.token);
        console.log(`token ${taskArgs.token} address: ${tokenAddr}`);

        if (hre.network.name === "Tron" || hre.network.name === "TronTest") {
        }

        let bridge = await getBridge(hre.network.name, true);

        let value;
        let fee = await bridge.getNativeFee(tokenAddr, 0, targetChainId);

        if (tokenAddr === "0x0000000000000000000000000000000000000000") {
            value = ethers.utils.parseUnits(taskArgs.value, 18);
            fee = fee.add(value);
        } else {
            let token = await ethers.getContractAt("IERC20MetadataUpgradeable", tokenAddr);
            let decimals = await token.decimals();
            value = ethers.utils.parseUnits(taskArgs.value, decimals);

            console.log(`${tokenAddr} approve ${bridge.address} value ${value} ...`);
            await token.approve(bridge.address, value);
        }
        console.log(`transfer ${taskArgs.token} with value ${fee} ...`);
        let rst = await bridge.swapOutToken(deployer.address, tokenAddr, receiver, value, targetChainId, "0x",
            {value: fee, gasLimit: 400000 });
        console.log(rst);

        console.log(`transfer token ${taskArgs.token} ${taskArgs.value} to ${receiver} successful`);
    });

task("bridge:list", "List mos  infos")
    .addOptionalParam("mos", "The mos address, default mos", "mos", types.string)
    .addOptionalParam("token", "The token address, default wtoken", "wtoken", types.string)
    .setAction(async (taskArgs, hre) => {
        if (hre.network.name === "Tron" || hre.network.name === "TronTest") {
            await tronList(hre.artifacts, hre.network.name, taskArgs.mos, taskArgs.token);
        } else {
            const accounts = await ethers.getSigners();
            const deployer = accounts[0];
            const chainId = await deployer.getChainId();
            console.log("deployer address:", deployer.address);

            let bridge = await getBridge(hre.network.name, false);

            let selfChainId = await bridge.selfChainId();
            console.log("selfChainId:\t", selfChainId.toString());
            console.log("wToken address:\t", await bridge.wToken());
            console.log("mos:\t", await bridge.mos());
            console.log("relay chain:\t", await bridge.relayChainId());
            console.log("relay contract:\t", await bridge.relayContract());
            console.log("Impl:\t", await bridge.getImplementation());

            console.log("fee receiver:\t", await bridge.nativeFeeReceiver());

            console.log("base fee swap:\t", await bridge.baseGasLookup(0, 0));
            console.log("base fee deposit:\t", await bridge.baseGasLookup(0, 1));
            console.log("base fee intertransfer:\t", await bridge.baseGasLookup(0, 2));
        }
    });


task("bridge:tokenInfo", "List mos  infos")
    .addOptionalParam("token", "The token address, default wtoken", "wtoken", types.string)
    .setAction(async (taskArgs, hre) => {
        if (hre.network.name === "Tron" || hre.network.name === "TronTest") {
            await tronList(hre.artifacts, hre.network.name, taskArgs.mos, taskArgs.token);
        } else {
            const accounts = await ethers.getSigners();
            const deployer = accounts[0];
            const chainId = await deployer.getChainId();
            console.log("deployer address:", deployer.address);

            let bridge = await getBridge(hre.network.name, true);

            let tokenAddr = taskArgs.token;
            if (tokenAddr == "wtoken") {
                tokenAddr = wtoken;
            }
            tokenAddr = await getToken(hre.network.config.chainId, tokenAddr);

            console.log("\ntoken address:", tokenAddr);
            console.log(`token mintalbe:\t ${await bridge.isMintable(tokenAddr)}`);
            console.log(`token feature:\t ${await bridge.tokenFeatureList(tokenAddr)}`);

            console.log("register chains:");
            let chains = await getChainList();
            for (let i = 0; i < chains.length; i++) {
                let bridgeable = await bridge.tokenMappingList(chains[i].chainId, tokenAddr);
                if (bridgeable) {
                    console.log(`${chains[i].chain} (${chains[i].chainId})`);
                }
            }
        }
    });
