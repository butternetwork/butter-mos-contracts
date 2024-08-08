let {
    create,
    readFromFile,
    writeToFile,
    getMos,
    getToken,
    getChain,
    getTokenList,
    getChainList,
    getFeeList,
} = require("../../utils/helper.js");
let { mosDeploy, mosUpgrade, stringToHex } = require("../utils/util.js");
const { getTronAddress, tronTokenTransferOut } = require("../utils/tron");
let { execute } = require("../../utils/authority.js");
const BigNumber = require("bignumber.js");

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
    .addParam("type", "associated contracts type (client/router/tokenregister) to set for mos")
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

        await (await register.connect(deployer).registerToken(tokenAddr, taskArgs.vault, taskArgs.mintable)).wait();

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

        await (
            await register
                .connect(deployer)
                .mapToken(token, chain.chainId, chaintoken, taskArgs.decimals, taskArgs.bridge)
        ).wait();

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
    .addOptionalParam("receiver", "receiver address", "0x0000000000000000000000000000000000000DEF", types.string)
    .addParam("rate", "The percentage value of the fee charged, unit 0.000001")
    .addOptionalParam("auth", "Send through authority call, default false", false, types.boolean)
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

        if (taskArgs.auth) {
            await execute(mos, "setDistributeRate", [taskArgs.type, taskArgs.receiver, taskArgs.rate], deployer);
        } else {
            await mos.connect(deployer).setDistributeRate(taskArgs.type, taskArgs.receiver, taskArgs.rate);
        }

        console.log(`mos set distribute ${taskArgs.type} rate ${taskArgs.rate} to ${taskArgs.address} success`);
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
        let token = await ethers.getContractAt("MintableToken", tokenAddr);
        let decimals = await token.decimals();
        console.log(`token ${taskArgs.token} address: ${token.address}, decimals ${decimals}`);

        let feeList = await getFeeList(taskArgs.token);
        let chainList = Object.keys(feeList);

        for (let i = 0; i < chainList.length; i++) {
            let chain = await getChain(chainList[i]);
            let info = await register.getTargetTokenInfo(tokenAddr, chain.chainId);
            // get mapped token
            let targetToken = await getToken(chain.chainId, taskArgs.token);
            if (chain.chainId == 728126428 || chain.chainId == 3448148188) {
                let tronAddr = await getTronAddress(targetToken);
                targetToken = tronAddr[1];
            } else if (targetToken.substr(0, 2) != "0x") {
                let hex = await stringToHex(targetToken);
                targetToken = "0x" + hex;
            }

            console.log(`chain ${chain.chain} target token ${targetToken}`);

            let chainFee = feeList[chain.chain];
            let targetDecimals = chainFee.decimals;
            let min = ethers.utils.parseUnits(chainFee.fee.min, decimals);
            let max = ethers.utils.parseUnits(chainFee.fee.max, decimals);
            let rate = ethers.utils.parseUnits(chainFee.fee.rate, 6);

            if (targetToken.toLowerCase() != info[0] || targetDecimals != info[1]) {
                // map token
                console.log(`${chain.chainId} => onchain token(${info[0]}), decimals(${info[1]}) `);
                console.log(`\tchain token(${targetToken}), decimals(${targetDecimals})`);

                await register
                    .connect(deployer)
                    .mapToken(tokenAddr, chain.chainId, targetToken, targetDecimals, true, { gasLimit: 150000 });

                console.log(`register chain ${chain.chain} token ${taskArgs.token} success`);
            }

            if (!min.eq(info[2][0]) || !max.eq(info[2][1]) || !rate.eq(info[2][2])) {
                console.log(
                    `${chain.chainId} => on-chain fee min(${info[2][0]}), max(${info[2][1]}), rate(${info[2][2]}) `
                );
                console.log(`\tconfig fee min(${min}), max(${max}), rate(${rate})`);
                await register
                    .connect(deployer)
                    .setTokenFee(tokenAddr, chain.chainId, min, max, rate, { gasLimit: 150000 });

                console.log(`set chain ${chain.chain} token ${taskArgs.token} fee success`);
            }

            let transferOutFee = chainFee.outFee;
            if (transferOutFee === undefined) {
                min = ethers.utils.parseUnits("0", decimals);
                max = ethers.utils.parseUnits("0", decimals);
                rate = ethers.utils.parseUnits("0", decimals);
            } else {
                min = ethers.utils.parseUnits(transferOutFee.min, decimals);
                max = ethers.utils.parseUnits(transferOutFee.max, decimals);
                rate = ethers.utils.parseUnits(transferOutFee.rate, 6);
            }

            if (!min.eq(info[3][0]) || !max.eq(info[3][1]) || !rate.eq(info[3][2])) {
                console.log(
                    `${chain.chainId} => on-chain outFee min(${info[3][0]}), max(${info[3][1]}), rate(${info[3][2]}) `
                );
                console.log(`\tconfig outFee min(${min}), max(${max}), rate(${rate})`);
                await register
                    .connect(deployer)
                    .setTransferOutFee(tokenAddr, chain.chainId, min, max, rate, { gasLimit: 150000 });
            }
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

task("relay:getTransferOut", "Cross-chain transfer token")
    .addOptionalParam("token", "The token address", "0x0000000000000000000000000000000000000000", types.string)
    .addParam("from", "source chain")
    .addParam("to", "target chain")
    .addParam("value", "transfer out value")
    .setAction(async (taskArgs, hre) => {
        const accounts = await ethers.getSigners();
        const deployer = accounts[0];

        let mos = await getMos(hre.network.config.chainId, hre.network.name);
        if (!mos) {
            throw "mos not deployed ...";
        }
        console.log("mos address:", mos.address);

        let source = await getChain(taskArgs.from);
        let sourceChainId = source.chainId;
        console.log("source chain:", sourceChainId);

        let target = await getChain(taskArgs.to);
        let targetChainId = target.chainId;
        console.log("target chain:", targetChainId);

        let tokenAddr = await getToken(hre.network.config.chainId, taskArgs.token);
        if (tokenAddr === "0x0000000000000000000000000000000000000000") {
            tokenAddr = await mos.wToken();
        }
        console.log(`token ${taskArgs.token} address: ${tokenAddr}`);

        let token = await ethers.getContractAt("MintableToken", tokenAddr);
        let decimals = await token.decimals();
        let value = ethers.utils.parseUnits(taskArgs.value, decimals);

        let tokenRegister = await mos.tokenRegister();
        let manager = await ethers.getContractAt("TokenRegisterV2", tokenRegister);
        console.log("Token manager:\t", manager.address);

        let amount = await manager.getTokenFee(tokenAddr, value, targetChainId);
        console.log("token fee:", ethers.utils.formatUnits(amount, decimals));

        amount = await manager.getTransferFee(tokenAddr, value, sourceChainId, targetChainId);
        console.log("transfer fee:", ethers.utils.formatUnits(amount, decimals));
    });

task("relay:tokenInfo", "List token infos")
    .addOptionalParam("mos", "The mos address, default mos", "mos", types.string)
    .addOptionalParam("token", "The token address, default wtoken", "wtoken", types.string)
    .setAction(async (taskArgs, hre) => {
        let mos;
        if (taskArgs.mos === "mos") {
            mos = await getMos(hre.network.config.chainId, hre.network.name);
            if (!mos) {
                throw "mos not deployed ...";
            }
        } else {
            mos = await ethers.getContractAt("MAPOmnichainServiceRelayV2", taskArgs.mos);
        }
        console.log("mos address:\t", mos.address);

        let tokenmanager = await mos.tokenRegister();
        tokenmanager = "0xE00219ecDbD02e102998fF208724671c4709e188";
        let manager = await ethers.getContractAt("TokenRegisterV2", tokenmanager);
        console.log("Token manager:\t", manager.address);

        address = taskArgs.token;
        if (address == "wtoken") {
            address = await mos.wToken();
        }
        address = await getToken(hre.network.config.chainId, address);

        console.log("\ntoken address:", address);
        //let token = await manager.tokenList(address);
        console.log(token);
        //console.log(`token mintalbe:\t ${token.mintable}`);
        //console.log(`token decimals:\t ${token.decimals}`);
        console.log(`vault address: ${token.vaultToken}`);

        let vault = await ethers.getContractAt("VaultTokenV2", token.vaultToken);
        let totalVault = await vault.totalVault();
        console.log(`total token:\t ${totalVault}`);
        let totalSupply = await vault.totalSupply();
        console.log(`total vault supply: ${totalSupply}`);

        let chainList = await getChainList();
        let chains = [hre.network.config.chainId];
        for (let i = 0; i < chainList.length; i++) {
            let contract = await mos.mosContracts(chainList[i].chainId);
            if (contract != "0x") {
                chains.push(chainList[i].chainId);
            }
        }
        console.log(`chains:`);
        for (let i = 0; i < chains.length; i++) {
            let info = await manager.getToChainTokenInfo(address, chains[i]);
            console.log(`${chains[i]}\t => ${info[0]} (${info[1]}), `);

            let balance = await vault.vaultBalance(chains[i]);
            console.log(`\t vault(${balance}), fee min(${info[2][0]}), max(${info[2][1]}), rate(${info[2][2]})`);
        }
    });
