let { create, readFromFile, writeToFile, getMos, getToken, getChain, getTokenList, getChainList, getFeeList } = require("../../utils/helper.js");
let { mosDeploy, mosUpgrade, stringToHex } = require("../utils/util.js");
const {getTronAddress} = require("../utils/tron");

task("relay:deploy", "mos relay deploy")
    .addParam("wrapped", "native wrapped token address")
    .addParam("lightnode", "lightNode manager contract address")
    .setAction(async (taskArgs, hre) => {
        const { deploy } = hre.deployments;
        const accounts = await ethers.getSigners();
        const deployer = accounts[0];
        const chainId = await hre.network.config.chainId;
        console.log("deployer address:", deployer.address);
        await mosDeploy(deploy, chainId, deployer.address, taskArgs.wrapped, taskArgs.lightnode);
    });

task("relay:upgrade", "upgrade mos evm contract in proxy")
    .addOptionalParam("impl", "The mos impl address", "0x0000000000000000000000000000000000000000", types.string)
    .addOptionalParam("auth", "Send through authority call, default false", false, types.boolean)
    .setAction(async (taskArgs, hre) => {
        const { deploy } = hre.deployments;
        const accounts = await ethers.getSigners();
        const deployer = accounts[0];
        const chainId = await hre.network.config.chainId;
        console.log("deployer address:", deployer.address);
        await mosUpgrade(deploy, chainId, deployer.address, hre.network.name, taskArgs.impl, taskArgs.auth);
    });

//settype
//client -> Update client manager on relay chain
//tokenregister ->  update tokenRegister for mos in relay chain
task("relay:setup", "set associated contracts for mos")
    .addParam("type", "associated contracts type (client/router/register) to set for mos")
    .addParam("address", "associated contracts address")
    .setAction(async (taskArgs, hre) => {
        const accounts = await ethers.getSigners();
        const deployer = accounts[0];
        const chainId = await hre.network.config.chainId;
        let mos = await getMos(chainId, hre.network.name);
        if (mos == undefined) {
            throw "mos not deployed ...";
        }

        console.log("mos address", mos.address);

        if (taskArgs.type === "client") {
            await (await mos.connect(deployer).setLightClientManager(taskArgs.address)).wait();
            console.log("set client manager:", taskArgs.address);
        } else if (taskArgs.type === "tokenregister") {
            await (await mos.connect(deployer).setTokenRegister(taskArgs.address)).wait();
            console.log("set token register:", taskArgs.address);
        } else {
            throw "unsupported set type";
        }
    });

task("relay:registerChain", "Register altchain mos to relay chain")
    .addParam("address", "mos contract address")
    .addParam("chain", "chain id")
    .addOptionalParam("type", "chain type, default 1", 1, types.int)
    .setAction(async (taskArgs, hre) => {
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

        await (await mos.connect(deployer).registerChain(taskArgs.chain, address, taskArgs.type)).wait();
        console.log(`mos register chain ${taskArgs.chain}  address ${address} success`);
    });

task("relay:registerToken", "Register cross-chain token on relay chain")
    .addParam("token", "Token address")
    .addParam("vault", "vault token address")
    .addParam("mintable", "token mintable", false, types.boolean)
    .setAction(async (taskArgs, hre) => {
        const accounts = await ethers.getSigners();
        const deployer = accounts[0];

        console.log("deployer address:", deployer.address);

        let proxy = await hre.deployments.get("TokenRegisterProxy");
        console.log("Token register address:", proxy.address);
        let register = await ethers.getContractAt("TokenRegisterV2", proxy.address);

        let tokenAddr = await getToken(hre.network.config.chainId, taskArgs.token);
        console.log("token address:", tokenAddr);

        await (
            await register.connect(deployer).registerToken(tokenAddr, taskArgs.vault, taskArgs.mintable)
        ).wait();

        console.log(`register token ${taskArgs.token} success`);
    });

task("relay:mapToken", "Map the altchain token to the token on relay chain")
    .addParam("token", "token address to relay chain")
    .addParam("chain", "cross-chain id")
    .addParam("chaintoken", "cross-chain token")
    .addOptionalParam("decimals", "token decimals, default 18", 18, types.int)
    .addOptionalParam("bridge", "support from mapo to chain", true, types.boolean)
    .setAction(async (taskArgs, hre) => {
        const accounts = await ethers.getSigners();
        const deployer = accounts[0];

        console.log("deployer address:", deployer.address);

        let proxy = await hre.deployments.get("TokenRegisterProxy");
        let register = await ethers.getContractAt("TokenRegisterV2", proxy.address);
        console.log("register address:", proxy.address);

        let token = await getToken(hre.network.config.chainId, taskArgs.token);
        console.log("token address:", token);

        let chain = await getChain(taskArgs.chain);

        let chaintoken = await getToken(chain.chainId, taskArgs.chaintoken);
        console.log("chain token:", chaintoken);

        if (chain.chainId == 728126428 || chain.chainId == 3448148188) {
            let tronAddr = await getTronAddress(chaintoken);
            chaintoken = tronAddr[1];
        } else if (chaintoken.substr(0, 2) != "0x") {
            let hex = await stringToHex(chaintoken);
            chaintoken = "0x" + hex;
        }
        console.log("chain token hex:", chaintoken.toString());

        await (await register.connect(deployer).mapToken(token, chain.chainId, chaintoken, taskArgs.decimals,taskArgs.bridge)).wait();

        console.log(
            `Token register manager maps chain ${taskArgs.chain} token ${chaintoken} to relay chain token ${taskArgs.token}  success `
        );
    });

task("relay:setTokenFee", "Set token fee to target chain")
    .addParam("token", "relay chain token address")
    .addParam("chain", "target chain id")
    .addParam("min", "One-time cross-chain charging minimum handling fee")
    .addParam("max", "One-time cross-chain charging maximum handling fee")
    .addParam("rate", "The percentage value of the fee charged, unit is 0.000001")
    .setAction(async (taskArgs, hre) => {
        const accounts = await ethers.getSigners();
        const deployer = accounts[0];

        console.log("deployer address:", deployer.address);

        let token = await getToken(hre.network.config.chainId, taskArgs.token);
        console.log("token address:", token);

        let proxy = await hre.deployments.get("TokenRegisterProxy");
        console.log("Token manager address:", proxy.address);

        let register = await ethers.getContractAt("TokenRegisterV2", proxy.address);

        await (
            await register
                .connect(deployer)
                .setTokenFee(token, taskArgs.chain, taskArgs.min, taskArgs.max, taskArgs.rate)
        ).wait();

        console.log(`Token register manager set token ${taskArgs.token} to chain ${taskArgs.chain} fee success`);
    });
    
task("relay:setFromChainTokenFee", "Set token fee to from chain")
    .addParam("token", "relay chain token address")
    .addParam("chain", "from chain id")
    .addParam("min", "One-time cross-chain charging minimum handling fee")
    .addParam("max", "One-time cross-chain charging maximum handling fee")
    .addParam("rate", "The percentage value of the fee charged, unit is 0.000001")
    .setAction(async (taskArgs, hre) => {
        const accounts = await ethers.getSigners();
        const deployer = accounts[0];

        console.log("deployer address:", deployer.address);

        let token = await getToken(hre.network.config.chainId, taskArgs.token);
        console.log("token address:", token);

        let proxy = await hre.deployments.get("TokenRegisterProxy");
        console.log("Token manager address:", proxy.address);

        let register = await ethers.getContractAt("TokenRegisterV2", proxy.address);

        await (
            await register
                .connect(deployer)
                .setFromChainTokenFee(token, taskArgs.chain, taskArgs.min, taskArgs.max, taskArgs.rate)
        ).wait();

        console.log(`Token register manager set token ${taskArgs.token} to chain ${taskArgs.chain} fee success`);
    });

task("relay:simpleSwapIn", "Swap to target chain")
    .addParam("order", "order id")
    .addParam("src", "from chain id")
    .addParam("from", "from address")
    .addParam("to", "to address")
    .addParam("amount", "amount")
    .addParam("token", "token address")
    .addOptionalParam("dst", "target chain id, must be 22776", 22776, types.int)
    .setAction(async (taskArgs, hre) => {
        const accounts = await ethers.getSigners();
        const deployer = accounts[0];
        const chainId = await deployer.getChainId();
        console.log("deployer address:", deployer.address);

        let mos = await getMos(chainId, hre.network.name);
        if (mos === undefined) {
            throw "mos not deployed ..";
        }

        console.log("mos address:", mos.address);

        await (
            await mos
                .connect(deployer)
                .simpleSwapIn(
                    taskArgs.src,
                    taskArgs.dst,
                    taskArgs.order,
                    taskArgs.from,
                    taskArgs.to,
                    taskArgs.token,
                    taskArgs.amount
                )
        ).wait();

        console.log(
            `mos simply swapIn order(${taskArgs.order}) from(${taskArgs.from}) fromChain (${taskArgs.src}) success`
        );
    });

task("relay:setDistributeRate", "Set the fee to enter the vault address")
    .addOptionalParam("type", "0 - vault, 1 - relayer, 2 - protocol, default 0", 0, types.int)
    .addOptionalParam("address", "receiver address", "0x0000000000000000000000000000000000000DEF", types.string)
    .addParam("rate", "The percentage value of the fee charged, unit 0.000001")
    .setAction(async (taskArgs, hre) => {
        const accounts = await ethers.getSigners();
        const deployer = accounts[0];
        const chainId = await deployer.getChainId();
        console.log("deployer address:", deployer.address);

        let mos = await getMos(chainId, hre.network.name);

        if (mos === undefined) {
            throw "mos not deployed ..";
        }

        console.log("mos address:", mos.address);

        await (await mos.connect(deployer).setDistributeRate(taskArgs.type, taskArgs.address, taskArgs.rate)).wait();

        console.log(`mos set distribute ${taskArgs.type} rate ${taskArgs.rate} to ${taskArgs.address} success`);
    });


task("relay:updateTokenList", "update token fee to target chain")
    .setAction(async (taskArgs, hre) => {
        const accounts = await ethers.getSigners();
        const deployer = accounts[0];
        console.log("deployer address:", deployer.address);

        let chainId = hre.network.config.chainId;
        let tokens = await getTokenList(chainId);
        console.log(tokens);

        /*
                for (let i = 0; i < tokens.length; i++) {
                    let token = await getToken(hre.network.config.chainId, taskArgs.token);
                    console.log("token address:", token);

                    await register.connect(deployer).setTokenFee(token, taskArgs.chain, taskArgs.min, taskArgs.max, taskArgs.rate)
                }
        */
        console.log(`Token register manager set token ${taskArgs.token} to chain ${taskArgs.chain} fee success`);
    });

task("relay:updateToken", "update token fee to target chain")
    .addParam("token", "relay chain token name")
    .setAction(async (taskArgs, hre) => {
        const accounts = await ethers.getSigners();
        const deployer = accounts[0];
        console.log("deployer address:", deployer.address);

        let proxy = await hre.deployments.get("TokenRegisterProxy");
        console.log("Token manager address:", proxy.address);
        let register = await ethers.getContractAt("TokenRegisterV2", proxy.address);

        let tokenAddr = await getToken(hre.network.config.chainId, taskArgs.token);
        let token = await ethers.getContractAt("MintableToken", tokenAddr)
        let decimals = await token.decimals();
        console.log(`token ${taskArgs.token}  address: ${token.address}, decimals ${decimals}`);

        let feeList = await getFeeList(taskArgs.token);
        let chainList = Object.keys(feeList);

        for (let i = 0; i < chainList.length; i++) {
            let chain = await getChain(chainList[i])
            let info = await register.getToChainTokenInfo(tokenAddr, chain.chainId);
            // get mapped token
            let targetToken = await getToken(chain.chainId, taskArgs.token);
            if (chain.chainId == 728126428 || chain.chainId == 3448148188) {
                let tronAddr = await getTronAddress(targetToken);
                targetToken = tronAddr[1];
            } else if (targetToken.substr(0, 2) != "0x") {
                let hex = await stringToHex(targetToken);
                targetToken = "0x" + hex;
            }

            let fee = feeList[chain.chain];
            let targetDecimals = fee.decimals;
            let min = ethers.utils.parseUnits(fee.min, decimals);
            let max = ethers.utils.parseUnits(fee.max, decimals);
            let rate = ethers.utils.parseUnits(fee.rate, 6);

            if (targetToken.toLowerCase() != info[0] || targetDecimals != info[1]) {
                // map token
                console.log(`${chain.chainId} => token(${info[0]}), decimals(${info[1]}) `);
                console.log(`\tchain token(${targetToken}), decimals(${targetDecimals})`);

                await register.connect(deployer).mapToken(tokenAddr, chain.chainId, targetToken, targetDecimals);

                console.log(`register chain ${chain.chain} token ${taskArgs.token} success`);
            }

            if (!min.eq(info[2][0]) || !max.eq(info[2][1]) || !rate.eq(info[2][2])) {
                console.log(`${chain.chainId} => fee min(${info[2][0]}), max(${info[2][1]}), rate(${info[2][2]}) `);
                console.log(`\tfee min(${min}), max(${max}), rate(${rate})`);
                await register.connect(deployer).setTokenFee(tokenAddr, chain.chainId, min, max, rate);
            }
        }

        console.log(`Token register manager update token ${taskArgs.token} success`);
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
    81457, // blast
    8453, // base
    4200, // merlin
    2649, // ainn
    1501, // bevm
    "1360100178526209",
    "1360100178526210", // near
];
task("relay:list", "List relay infos")
    .addOptionalParam("mos", "The mos address, default mos", "mos", types.string)
    .addOptionalParam("token", "The token address, default wtoken", "wtoken", types.string)
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
        console.log("Token manager:\t", tokenmanager);
        console.log("wToken address:\t", wtoken);

        console.log(`distribute vault rate: rate(${vaultFee[1]})`);
        console.log(`distribute relay rate: rate(${relayFee[1]}), receiver(${relayFee[0]})`);
        console.log(`distribute protocol rate: rate(${protocolFee[1]}), receiver(${protocolFee[0]})`);

        let manager = await ethers.getContractAt("TokenRegisterV2", tokenmanager);

        console.log("\nRegister chains:");
        let chains = [selfChainId];
        for (let i = 0; i < chainlist.length; i++) {
            let contract = await mos.mosContracts(chainlist[i]);

            if (contract != "0x") {
                let chaintype = await mos.chainTypes(chainlist[i]);
                console.log(`type(${chaintype}) ${chainlist[i]}\t => ${contract} `);
                chains.push(chainlist[i]);
            }
        }

        address = taskArgs.token;
        if (address == "wtoken") {
            address = wtoken;
        }

        address = await getToken(hre.network.config.chainId, address);

        console.log("\ntoken address:", address);
        let token = await manager.tokenList(address);
        console.log(`token mintalbe:\t ${token.mintable}`);
        console.log(`token decimals:\t ${token.decimals}`);
        console.log(`vault address: ${token.vaultToken}`);

        let vault = await ethers.getContractAt("VaultTokenV2", token.vaultToken);
        let totalVault = await vault.totalVault();
        console.log(`total vault:\t ${totalVault}`);
        let totalSupply = await vault.totalSupply();
        console.log(`total vault token: ${totalSupply}`);

        console.log(`chains:`);
        for (let i = 0; i < chains.length; i++) {
            let info = await manager.getToChainTokenInfo(address, chains[i]);
            console.log(`${chains[i]}\t => ${info[0]} (${info[1]}), `);

            let balance = await vault.vaultBalance(chains[i]);
            console.log(`\t vault(${balance}), fee min(${info[2][0]}), max(${info[2][1]}), rate(${info[2][2]})`);
        }
    });
