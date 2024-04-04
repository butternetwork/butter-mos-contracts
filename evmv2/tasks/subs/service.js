let { create, readFromFile, writeToFile, getMos, getToken } = require("../../utils/helper.js");
let { mosDeploy, mosUpgrade, mosVerify } = require("../utils/util.js");
let {
    tronMosDeploy,
    tronMosUpgrade,
    tronSetup,
    tronSetRelay,
    tronRegisterToken,
    tronSetMintableToken,
    tronList,
    tronDeployRootToken,
} = require("../utils/tron.js");

task("mos:deploy", "mos service deploy")
    .addParam("wrapped", "native wrapped token address")
    .addParam("lightnode", "lightNode contract address")
    .setAction(async (taskArgs, hre) => {
        if (hre.network.name === "Tron" || hre.network.name === "TronTest") {
            console.log(hre.network.name);
            await tronMosDeploy(hre.artifacts, hre.network.name, taskArgs.wrapped, taskArgs.lightnode);
        } else {
            const { deploy } = hre.deployments;
            const accounts = await ethers.getSigners();
            const deployer = accounts[0];
            const chainId = await hre.network.config.chainId;
            console.log("deployer address:", deployer.address);
            await mosDeploy(deploy, chainId, deployer.address, taskArgs.wrapped, taskArgs.lightnode);
        }
    });

task("mos:verify", "mos service verify")
    .addParam("wrapped", "native wrapped token address")
    .addParam("lightnode", "lightNode contract address")
    .setAction(async (taskArgs, hre) => {
        if (hre.network.name === "Tron" || hre.network.name === "TronTest") {
            console.log(hre.network.name);
            await tronMosDeploy(hre.artifacts, hre.network.name, taskArgs.wrapped, taskArgs.lightnode);
        } else {
            const { deploy } = hre.deployments;
            const accounts = await ethers.getSigners();
            const deployer = accounts[0];
            const chainId = await hre.network.config.chainId;
            console.log("deployer address:", deployer.address);
            await mosVerify(deploy, chainId, deployer.address, taskArgs.wrapped, taskArgs.lightnode);
        }
    });

task("mos:upgrade", "upgrade mos evm contract in proxy")
    .addOptionalParam("impl", "The mos impl address", "0x0000000000000000000000000000000000000000", types.string)
    .setAction(async (taskArgs, hre) => {
        if (hre.network.name === "Tron" || hre.network.name === "TronTest") {
            await tronMosUpgrade(hre.artifacts, hre.network.name, taskArgs.impl);
        } else {
            const { deploy } = hre.deployments;
            const accounts = await ethers.getSigners();
            const deployer = accounts[0];
            const chainId = await hre.network.config.chainId;
            console.log("deployer address:", deployer.address);
            await mosUpgrade(deploy, chainId, deployer.address, hre.network.name, taskArgs.impl);
        }
    });

//settype
//client -> update mos light client
task("mos:setLightClient", "set light client contracts for mos")
    .addParam("address", "light client contracts address")
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
            await (await mos.connect(deployer).setLightClient(taskArgs.address)).wait();
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

            let tokens = taskArgs.token.split(",");
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

const chainlist = [
    1,
    5,
    56,
    97, // bsc
    137,
    80001, // matic
    212,
    22776, // mapo
    1001,
    8217, // klaytn
    1030, // conflux
    "1360100178526209",
    "1360100178526210", // near
];

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

            address = taskArgs.token;
            if (address == "wtoken") {
                address = wtoken;
            }
            address = await getToken(hre.network.config.chainId, address);

            console.log("\ntoken address:", address);
            let mintable = await mos.isMintable(address);
            console.log(`token mintalbe:\t ${mintable}`);

            console.log("register chains:");
            for (let i = 0; i < chainlist.length; i++) {
                let bridgeable = await mos.isBridgeable(address, chainlist[i]);
                if (bridgeable) {
                    console.log(`${chainlist[i]}`);
                }
            }
        }
    });
