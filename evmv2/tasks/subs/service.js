let { readFromFile, writeToFile, getChain, getMos, getToken } = require("../../utils/helper.js");
let { mosDeploy, mosUpgrade, mosVerify } = require("../utils/util.js");
let { execute } = require("../../utils/authority.js");
let {
    tronMosDeploy,
    tronMosUpgrade,
    tronSetup,
    tronSetRelay,
    tronSetButterRouter,
    tronRegisterToken,
    tronSetMintableToken,
    tronUpdateChain,
    tronList,
} = require("../utils/tron.js");
const { getFeeList, getChainList } = require("../../utils/helper");

task("mos:deploy", "mos service deploy")
    .addOptionalParam("wrapped", "native wrapped token address", "", types.string)
    .addOptionalParam("lightnode", "lightNode contract address", "", types.string)
    .setAction(async (taskArgs, hre) => {
        let chain = await getChain(hre.network.config.chainId);
        let wrappedAddr = taskArgs.wrapped;
        let nodeAddr = taskArgs.lightnode;
        if (wrappedAddr === "") {
            wrappedAddr = chain.wToken;
        }
        if (nodeAddr === taskArgs.lightnode) {
            nodeAddr = chain.lightNode;
        }
        console.log(`chain : ${hre.network.name}`);
        console.log(`wToken : ${wrappedAddr}`);
        console.log(`lightnode : ${nodeAddr}`);

        if (hre.network.name === "Tron" || hre.network.name === "TronTest") {
            await tronMosDeploy(hre.artifacts, hre.network.name, wrappedAddr, nodeAddr);
        } else {
            const { deploy } = hre.deployments;
            const accounts = await ethers.getSigners();
            const deployer = accounts[0];
            console.log("deployer address:", deployer.address);
            await mosDeploy(deploy, hre.network.config.chainId, deployer.address, wrappedAddr, nodeAddr);
        }
    });

task("mos:verify", "mos service verify")
    .addOptionalParam("wrapped", "native wrapped token address", "", types.string)
    .addOptionalParam("lightnode", "lightNode contract address", "", types.string)
    .setAction(async (taskArgs, hre) => {
        let chain = await getChain(hre.network.config.chainId);
        let wrappedAddr = taskArgs.wrapped;
        let nodeAddr = taskArgs.lightnode;
        if (wrappedAddr === "") {
            wrappedAddr = chain.wToken;
        }
        if (nodeAddr === taskArgs.lightnode) {
            nodeAddr = chain.lightNode;
        }
        console.log(`chain : ${hre.network.name}`);
        console.log(`wToken : ${wrappedAddr}`);
        console.log(`lightnode : ${nodeAddr}`);

        if (hre.network.name === "Tron" || hre.network.name === "TronTest") {
            console.log(hre.network.name);
            await tronMosDeploy(hre.artifacts, hre.network.name, wrappedAddr, nodeAddr);
        } else {
            const { deploy } = hre.deployments;
            const accounts = await ethers.getSigners();
            const deployer = accounts[0];
            const chainId = await hre.network.config.chainId;
            console.log("deployer address:", deployer.address);
            await mosVerify(deploy, chainId, deployer.address, wrappedAddr, nodeAddr);
        }
    });

task("mos:upgrade", "upgrade mos evm contract in proxy")
    .addOptionalParam("impl", "The mos impl address", "0x0000000000000000000000000000000000000000", types.string)
    .addOptionalParam("auth", "Send through authority call, default false", false, types.boolean)
    .setAction(async (taskArgs, hre) => {
        if (hre.network.name === "Tron" || hre.network.name === "TronTest") {
            await tronMosUpgrade(hre.artifacts, hre.network.name, taskArgs.impl);
        } else {
            const { deploy } = hre.deployments;
            const accounts = await ethers.getSigners();
            const deployer = accounts[0];
            console.log("deployer address:", deployer.address);
            await mosUpgrade(
                deploy,
                hre.network.config.chainId,
                deployer.address,
                hre.network.name,
                taskArgs.impl,
                taskArgs.auth
            );
        }
    });

//settype
//client -> update mos light client
task("mos:setLightClient", "set light client contracts for mos")
    .addParam("address", "light client contracts address")
    .addOptionalParam("auth", "Send through authority call, default false", false, types.boolean)
    .setAction(async (taskArgs, hre) => {
        if (hre.network.name === "Tron" || hre.network.name === "TronTest") {
            await tronSetup(hre.artifacts, hre.network.name, taskArgs.address);
        } else {
            const accounts = await ethers.getSigners();
            const deployer = accounts[0];
            const chainId = await hre.network.config.chainId;
            let mos = await getMos(chainId, hre.network.name);
            if (mos == undefined) {
                throw "mos not deployed ...";
            }
            console.log("mos address", mos.address);

            if (taskArgs.auth) {
                await execute(mos, "setLightClient", [taskArgs.address], deployer);
            } else {
                await (await mos.connect(deployer).setLightClient(taskArgs.address)).wait();
            }

            console.log(`mos set  light client ${taskArgs.address} successfully `);
        }
    });

task("mos:setRelay", "Initialize MapCrossChainServiceRelay address for MapCrossChainService")
    .addParam("address", "mos contract address")
    .addParam("chain", "chain id")
    .setAction(async (taskArgs, hre) => {
        if (hre.network.name === "Tron" || hre.network.name === "TronTest") {
            await tronSetRelay(hre.artifacts, hre.network.name, taskArgs.address, taskArgs.chain);
        } else {
            const accounts = await ethers.getSigners();
            const deployer = accounts[0];
            const chainId = await deployer.getChainId();
            console.log("deployer address:", deployer.address);

            let mos = await getMos(chainId, hre.network.name);
            if (mos === undefined) {
                throw "mos not deployed ...";
            }
            console.log("mos address:", mos.address);

            let address = taskArgs.address;
            if (taskArgs.address.substr(0, 2) != "0x") {
                address = "0x" + stringToHex(taskArgs.address);
            }

            if (taskArgs.chain !== "212" && taskArgs.chain !== "22776") {
                throw "relay chainId must 212 for testnet or 22776 for mainnet";
            }

            await (await mos.connect(deployer).setRelayContract(taskArgs.chain, address)).wait();

            console.log(`mos set  relay ${address} with chain id ${taskArgs.chain} successfully `);
        }
    });

task("mos:setWrapped", "Initialize MapCrossChainServiceRelay address for MapCrossChainService")
    .addParam("token", "wrapped token")
    .setAction(async (taskArgs, hre) => {
        if (hre.network.name === "Tron" || hre.network.name === "TronTest") {
            await tronSetRelay(hre.artifacts, hre.network.name, taskArgs.address, taskArgs.chain);
        } else {
            const accounts = await ethers.getSigners();
            const deployer = accounts[0];
            console.log("deployer address:", deployer.address);

            let mos = await getMos(hre.network.config.chainId, hre.network.name);
            if (mos === undefined) {
                throw "mos not deployed ...";
            }
            console.log("mos address:", mos.address);

            let tokenAddr = await getToken(hre.network.config.chainId, taskArgs.token);
            console.log("token address:", tokenAddr);

            await (await mos.connect(deployer).setWrappedToken(tokenAddr)).wait();

            console.log(`mos set wrapped token ${tokenAddr} successfully `);
        }
    });

task("mos:setButterRouter", "set butter router address")
    .addParam("router", "router address")
    .setAction(async (taskArgs, hre) => {
        if (hre.network.name === "Tron" || hre.network.name === "TronTest") {
            await tronSetButterRouter(hre.artifacts, hre.network.name, taskArgs.address);
        } else {
            const accounts = await ethers.getSigners();
            const deployer = accounts[0];
            console.log("deployer address:", deployer.address);

            let mos = await getMos(hre.network.config.chainId, hre.network.name);
            if (mos === undefined) {
                throw "mos not deployed ...";
            }
            console.log("mos address:", mos.address);

            await (await mos.connect(deployer).setButterRouter(taskArgs.router)).wait();

            console.log(`mos set butter router ${taskArgs.router} successfully `);
        }
    });
task("mos:registerToken", "MapCrossChainService settings allow cross-chain tokens")
    .addParam("token", "token address")
    .addParam("chains", "chain ids allowed to cross, separated by ',', ex. `1,2,3` ")
    .addOptionalParam("enable", "true or false", true, types.boolean)
    .setAction(async (taskArgs, hre) => {
        console.log("mos register token, network:", hre.network.name);

        if (hre.network.name === "Tron" || hre.network.name === "TronTest") {
            await tronRegisterToken(hre.artifacts, hre.network.name, taskArgs.token, taskArgs.chains, taskArgs.enable);
        } else {
            const accounts = await ethers.getSigners();
            const deployer = accounts[0];
            const chainId = await deployer.getChainId();
            console.log("deployer address:", deployer.address);

            let mos = await getMos(chainId, hre.network.name);

            if (mos === undefined) {
                throw "mos not deployed ...";
            }
            console.log("mos address:", mos.address);

            let token = await getToken(hre.network.config.chainId, taskArgs.token);
            console.log("token address:", token);

            let ids = taskArgs.chains.split(",");

            for (let i = 0; i < ids.length; i++) {
                await (await mos.connect(deployer).registerToken(token, ids[i], taskArgs.enable)).wait();

                console.log(`mos register token ${taskArgs.token} to chain ${ids[i]} ${taskArgs.enable} success`);
            }

            console.log("mos registerToken success");
        }
    });

async function register(deployer, mos, token, chain, bridgeable, auth) {
    if (auth) {
        let deployment = await readFromFile(hre.network.name);
        if (!deployment[hre.network.name]["authority"]) {
            throw "authority not deployed";
        }
        let Authority = await ethers.getContractFactory("Authority");
        let authority = Authority.attach(deployment[hre.network.name]["authority"]);

        let data = mos.interface.encodeFunctionData("registerToken", [token, chain, bridgeable]);
        let executeData = authority.interface.encodeFunctionData("execute", [mos.address, 0, data]);
        console.log("execute input", executeData);
        await (await authority.execute(mos.address, 0, data)).wait();
    } else {
        await mos.connect(deployer).registerToken(token, chain, bridgeable);
    }
}

task("mos:updateChain", "update token fee to target chain")
    .addParam("token", "token name")
    .addOptionalParam("auth", "Send through authority call, default false", false, types.boolean)
    .setAction(async (taskArgs, hre) => {
        const accounts = await ethers.getSigners();
        const deployer = accounts[0];
        console.log("deployer address:", deployer.address);

        let tokenAddr = await getToken(hre.network.config.chainId, taskArgs.token);
        console.log(`token ${taskArgs.token}  address: ${tokenAddr}`);

        let chain = await getChain(hre.network.config.chainId);
        let feeList = await getFeeList(taskArgs.token);
        let targetList = feeList[chain.chain].target;

        let addList = [];
        let removeList = [];
        let chainList = await getChainList();
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
            removeList.push(chainList[i].chainId);
        }
        for (let i = 0; i < targetList.length; i++) {
            let targetChain = await getChain(targetList[i]);
            addList.push(targetChain.chainId);
        }
        console.log("remove list", removeList);
        console.log("add list", addList);

        if (hre.network.name === "Tron" || hre.network.name === "TronTest") {
            await tronUpdateChain(hre.artifacts, hre.network.name, tokenAddr, addList, removeList);
        } else {
            let mos = await getMos(hre.network.config.chainId, hre.network.name);
            if (mos === undefined) {
                throw "mos not deployed ...";
            }
            console.log("mos address:", mos.address);

            for (let i = 0; i < removeList.length; i++) {
                let bridgeable = await mos.isBridgeable(tokenAddr, removeList[i]);
                if (bridgeable) {
                    // await mos.connect(deployer).registerToken(tokenAddr, removeList[i], false);
                    await register(deployer, mos, tokenAddr, removeList[i], false, taskArgs.auth);
                    console.log(`mos remove token ${taskArgs.token} to chain ${removeList[i]} success`);
                }
            }
            for (let i = 0; i < targetList.length; i++) {
                let targetChain = await getChain(targetList[i]);

                let bridgeable = await mos.isBridgeable(tokenAddr, targetChain.chainId);
                if (!bridgeable) {
                    // await mos.connect(deployer).registerToken(tokenAddr, targetChain.chainId, true);
                    await register(deployer, mos, tokenAddr, targetChain.chainId, true, taskArgs.auth);
                    console.log(`mos register token ${taskArgs.token} to chain ${targetChain.chain} true success`);
                }
            }
        }

        console.log(`mos update update token ${taskArgs.token} bridge success`);
    });

task("mos:updateTokenChain", "update token fee to target chain")
    .addParam("token", "token name")
    .addOptionalParam("auth", "Send through authority call, default false", false, types.boolean)
    .setAction(async (taskArgs, hre) => {
        const accounts = await ethers.getSigners();
        const deployer = accounts[0];
        console.log("deployer address:", deployer.address);

        let tokenAddr = await getToken(hre.network.config.chainId, taskArgs.token);
        console.log(`token ${taskArgs.token}  address: ${tokenAddr}`);

        let chain = await getChain(hre.network.config.chainId);
        let feeList = await getFeeList(taskArgs.token);
        let targetList = feeList[chain.chain].target;

        let addList = [];
        let removeList = [];
        let chainList = await getChainList();
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
            removeList.push(chainList[i].chainId);
        }
        for (let i = 0; i < targetList.length; i++) {
            let targetChain = await getChain(targetList[i]);
            addList.push(targetChain.chainId);
        }
        console.log("remove list", removeList);
        console.log("add list", addList);

        if (hre.network.name === "Tron" || hre.network.name === "TronTest") {
            await tronUpdateChain(hre.artifacts, hre.network.name, tokenAddr, addList, removeList);
        } else {
            let mos = await getMos(hre.network.config.chainId, hre.network.name);
            if (mos === undefined) {
                throw "mos not deployed ...";
            }
            console.log("mos address:", mos.address);

            let enableList = [];
            let disableList = [];

            for (let i = 0; i < removeList.length; i++) {
                let bridgeable = await mos.isBridgeable(tokenAddr, removeList[i]);
                if (bridgeable) {
                    disableList.push(removeList[i]);
                    //await mos.connect(deployer).registerTokenChains(tokenAddr, removeList[i], false);
                    console.log(`mos remove token ${taskArgs.token} to chain ${removeList[i]} success`);
                }
            }
            for (let i = 0; i < targetList.length; i++) {
                let targetChain = await getChain(targetList[i]);

                let bridgeable = await mos.isBridgeable(tokenAddr, targetChain.chainId);
                if (!bridgeable) {
                    enableList.push(targetChain.chainId);
                    //await mos.connect(deployer).registerToken(tokenAddr, targetChain.chainId, true);
                    // console.log(`mos register token ${taskArgs.token} to chain ${targetChain.chain} true success`);
                }
            }

            if (disableList.length > 0) {
                console.log(`mos remove token ${taskArgs.token} to chain ${disableList} ...`);
                if (taskArgs.auth) {
                    await execute(mos, "registerTokenChains", [tokenAddr, disableList, false], deployer);
                } else {
                    await mos.connect(deployer).registerTokenChains(tokenAddr, disableList, false);
                }
            }
            if (enableList.length > 0) {
                console.log(`mos register token ${taskArgs.token} to chain ${enableList} ...`);
                if (taskArgs.auth) {
                    await execute(mos, "registerTokenChains", [tokenAddr, enableList, true], deployer);
                } else {
                    await mos.connect(deployer).registerTokenChains(tokenAddr, enableList, true);
                }
            }
        }

        console.log(`mos update update token ${taskArgs.token} bridge success`);
    });

task("mos:updateMintable", "set mintable token")
    .addParam("token", "token address")
    .setAction(async (taskArgs, hre) => {
        if (hre.network.name === "Tron" || hre.network.name === "TronTest") {
            await tronSetMintableToken(hre.artifacts, hre.network.name, taskArgs.token, taskArgs.mintable);
        } else {
            const accounts = await ethers.getSigners();
            const deployer = accounts[0];
            const chainId = await deployer.getChainId();
            console.log("deployer address:", deployer.address);

            let mos = await getMos(chainId, hre.network.name);
            if (!mos) {
                throw "mos not deployed ...";
            }
            console.log("mos address:", mos.address);

            let tokens = [];
            let tokenList = taskArgs.token.split(",");
            for (let i = 0; i < tokenList.length; i++) {
                let token = await getToken(hre.network.config.chainId, tokenList[i]);
                tokens.push(token);
            }
            if (taskArgs.mintable) {
                await (await mos.connect(deployer).addMintableToken(tokens)).wait();

                console.log(`mos set token ${taskArgs.token} mintable ${taskArgs.mintable} success`);
            } else {
                await (await mos.connect(deployer).removeMintableToken(tokens)).wait();

                console.log(`mos set token ${taskArgs.token} mintable ${taskArgs.mintable}  success`);
            }
        }
    });

task("mos:setMintableToken", "MapCrossChainService settings mintable token")
    .addParam("token", "token address")
    .addParam("mintable", "true or false", false, types.boolean)
    .setAction(async (taskArgs, hre) => {
        if (hre.network.name === "Tron" || hre.network.name === "TronTest") {
            await tronSetMintableToken(hre.artifacts, hre.network.name, taskArgs.token, taskArgs.mintable);
        } else {
            const accounts = await ethers.getSigners();
            const deployer = accounts[0];
            const chainId = await deployer.getChainId();
            console.log("deployer address:", deployer.address);

            let mos = await getMos(chainId, hre.network.name);
            if (!mos) {
                throw "mos not deployed ...";
            }
            console.log("mos address:", mos.address);

            let tokens = [];
            let tokenList = taskArgs.token.split(",");
            for (let i = 0; i < tokenList.length; i++) {
                let token = await getToken(hre.network.config.chainId, tokenList[i]);
                tokens.push(token);
            }
            if (taskArgs.mintable) {
                await (await mos.connect(deployer).addMintableToken(tokens)).wait();

                console.log(`mos set token ${taskArgs.token} mintable ${taskArgs.mintable} success`);
            } else {
                await (await mos.connect(deployer).removeMintableToken(tokens)).wait();

                console.log(`mos set token ${taskArgs.token} mintable ${taskArgs.mintable}  success`);
            }
        }
    });

task("mos:setPause", "set pause for mos")
    .addOptionalParam("pause", "Set pause, default true", true, types.boolean)
    .addOptionalParam("auth", "Send through authority call, default false", false, types.boolean)
    .setAction(async (taskArgs, hre) => {
        if (hre.network.name === "Tron" || hre.network.name === "TronTest") {
            await tronSetup(hre.artifacts, hre.network.name, taskArgs.address, taskArgs.type);
        } else {
            const accounts = await ethers.getSigners();
            const deployer = accounts[0];
            const chainId = await hre.network.config.chainId;
            let mos = await getMos(chainId, hre.network.name);
            if (mos == undefined) {
                throw "mos not deployed ...";
            }

            console.log("mos address", mos.address);

            if (taskArgs.auth) {
                let deployment = await readFromFile(hre.network.name);
                if (!deployment[hre.network.name]["authority"]) {
                    throw "authority not deployed";
                }
                let Authority = await ethers.getContractFactory("Authority");
                let authority = Authority.attach(deployment[hre.network.name]["authority"]);

                let data;
                if (taskArgs.pause === true) {
                    data = mos.interface.encodeFunctionData("setPause", []);
                } else {
                    data = mos.interface.encodeFunctionData("setUnpause", []);
                }
                let executeData = authority.interface.encodeFunctionData("execute", [mos.address, 0, data]);
                console.log("execute input", executeData);

                await (await authority.execute(mos.address, 0, data)).wait();
            } else {
                if (taskArgs.pause === true) {
                    await (await mos.connect(deployer).setPause()).wait();
                } else {
                    await (await mos.connect(deployer).setUnpause()).wait();
                }
            }
            console.log(`mos set pause ${taskArgs.pause} successfully `);
        }
    });

task("mos:changeOwner", "changeOwner for mos")
    .addParam("owner", "owner address")
    .addOptionalParam("auth", "Send through authority call, default false", false, types.boolean)
    .setAction(async (taskArgs, hre) => {
        if (hre.network.name === "Tron" || hre.network.name === "TronTest") {
            await tronSetup(hre.artifacts, hre.network.name, taskArgs.address, taskArgs.type);
        } else {
            const accounts = await ethers.getSigners();
            const deployer = accounts[0];
            const chainId = await hre.network.config.chainId;
            let mos = await getMos(chainId, hre.network.name);
            if (mos == undefined) {
                throw "mos not deployed ...";
            }
            console.log("mos address", mos.address);

            let owner = await mos.connect(deployer).getAdmin();
            console.log("mos pre owner", owner);

            if (taskArgs.auth) {
                let deployment = await readFromFile(hre.network.name);
                if (!deployment[hre.network.name]["authority"]) {
                    throw "authority not deployed";
                }
                let Authority = await ethers.getContractFactory("Authority");
                let authority = Authority.attach(deployment[hre.network.name]["authority"]);

                let data = mos.interface.encodeFunctionData("changeAdmin", [taskArgs.owner]);
                let executeData = authority.interface.encodeFunctionData("execute", [mos.address, 0, data]);
                console.log("target:", mos.address);
                console.log("value:", 0);
                console.log("payload:", data);
                console.log("execute input:", executeData);

                await (await authority.execute(mos.address, 0, data)).wait();
            } else {
                await (await mos.connect(deployer).changeAdmin(taskArgs.owner)).wait();
            }

            owner = await mos.connect(deployer).getAdmin();
            console.log("mos owner", owner);

            console.log(`mos set owner ${taskArgs.owner} successfully `);
        }
    });

task("mos:withdraw", "changeOwner for mos")
    .addParam("token", "token address")
    .addParam("receiver", "receiver address")
    .addParam("amount", "token amount")
    .addOptionalParam("auth", "Send through authority call, default false", false, types.boolean)
    .setAction(async (taskArgs, hre) => {
        if (hre.network.name === "Tron" || hre.network.name === "TronTest") {
            await tronSetup(hre.artifacts, hre.network.name, taskArgs.address, taskArgs.type);
        } else {
            const accounts = await ethers.getSigners();
            const deployer = accounts[0];
            const chainId = await hre.network.config.chainId;
            let mos = await getMos(chainId, hre.network.name);
            if (mos == undefined) {
                throw "mos not deployed ...";
            }
            console.log("mos address", mos.address);

            let tokenAddr = await getToken(hre.network.config.chainId, taskArgs.token);
            let token = await ethers.getContractAt("MintableToken", tokenAddr);
            let decimals = await token.decimals();
            console.log(`token address ${token.address}, decimals ${decimals}`);
            let amount = ethers.utils.parseUnits(taskArgs.amount, decimals);

            if (taskArgs.auth) {
                let deployment = await readFromFile(hre.network.name);
                if (!deployment[hre.network.name]["authority"]) {
                    throw "authority not deployed";
                }
                let Authority = await ethers.getContractFactory("Authority");
                let authority = Authority.attach(deployment[hre.network.name]["authority"]);

                let data = mos.interface.encodeFunctionData("withdraw", [tokenAddr, taskArgs.receiver, amount]);
                let executeData = authority.interface.encodeFunctionData("execute", [mos.address, 0, data]);
                console.log("execute address:", authority.address);
                console.log("target:", mos.address);
                console.log("value:", 0);
                console.log("payload:", data);
                console.log("execute input:", executeData);

                await (await authority.execute(mos.address, 0, data)).wait();
            } else {
                await (await mos.connect(deployer).withdraw(tokenAddr, taskArgs.receiver, amount)).wait();
            }

            console.log(
                `mos withdraw token ${taskArgs.token} to ${taskArgs.receiver} ${taskArgs.amount} successfully `
            );
        }
    });

task("mos:getOrderStatus", "changeOwner for mos")
    .addOptionalParam("mos", "The mos address, default mos", "mos", types.string)
    .addOptionalParam("order", "The token address, default wtoken", "wtoken", types.string)
    .addOptionalParam("block", "The token address, default wtoken", "wtoken", types.string)
    .setAction(async (taskArgs, hre) => {
        if (hre.network.name === "Tron" || hre.network.name === "TronTest") {
            await tronSetup(hre.artifacts, hre.network.name, taskArgs.address, taskArgs.type);
        } else {
            const accounts = await ethers.getSigners();
            const deployer = accounts[0];
            const chainId = await hre.network.config.chainId;
            let mos = await getMos(chainId, hre.network.name);
            if (mos == undefined) {
                throw "mos not deployed ...";
            }
            console.log("mos address", mos.address);

            let owner = await mos.connect(deployer).getAdmin();
            console.log("mos pre owner", owner);

            if (taskArgs.auth) {
                let deployment = await readFromFile(hre.network.name);
                if (!deployment[hre.network.name]["authority"]) {
                    throw "authority not deployed";
                }
                let Authority = await ethers.getContractFactory("Authority");
                let authority = Authority.attach(deployment[hre.network.name]["authority"]);

                let data = mos.interface.encodeFunctionData("changeAdmin", [taskArgs.owner]);
                let executeData = authority.interface.encodeFunctionData("execute", [mos.address, 0, data]);
                console.log("target:", mos.address);
                console.log("value:", 0);
                console.log("payload:", data);
                console.log("execute input:", executeData);

                await (await authority.execute(mos.address, 0, data)).wait();
            } else {
                await (await mos.connect(deployer).changeAdmin(taskArgs.owner)).wait();
            }

            owner = await mos.connect(deployer).getAdmin();
            console.log("mos owner", owner);

            console.log(`mos set owner ${taskArgs.owner} successfully `);
        }
    });

task("mos:list", "List mos  infos")
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
            let address = taskArgs.mos;
            if (address == "mos") {
                let proxy = await getMos(chainId, hre.network.name);
                if (!proxy) {
                    throw "mos not deployed ...";
                }
                address = proxy.address;
            }
            console.log("mos address:\t", address);
            let mos = await ethers.getContractAt("MAPOmnichainServiceV2", address);
            let wtoken = await mos.wToken();
            let selfChainId = await mos.selfChainId();
            let relayContract = await mos.relayContract();
            let relayChainId = await mos.relayChainId();
            let lightNode = await mos.lightNode();

            console.log("selfChainId:\t", selfChainId.toString());
            console.log("wToken address:\t", wtoken);
            console.log("light node:\t", lightNode);
            console.log("relay chain:\t", relayChainId.toString());
            console.log("relay contract:\t", relayContract);
            console.log("Owner:\t", await mos.getAdmin());
            console.log("Impl:\t", await mos.getImplementation());

            address = taskArgs.token;
            if (address == "wtoken") {
                address = wtoken;
            }

            address = await getToken(hre.network.config.chainId, address);

            console.log("\ntoken address:", address);
            let mintable = await mos.isMintable(address);
            console.log(`token mintalbe:\t ${mintable}`);

            console.log("register chains:");
            let chains = await getChainList();
            for (let i = 0; i < chains.length; i++) {
                let bridgeable = await mos.isBridgeable(address, chains[i].chainId);
                if (bridgeable) {
                    console.log(`${chains[i].chain} (${chains[i].chainId})`);
                }
            }
        }
    });
