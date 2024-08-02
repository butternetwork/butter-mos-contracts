let { create, toHex, fromHex, readFromFile, writeToFile } = require("../../utils/create.js");
const { getToken, stringToHex, getFeeList, getChain, getChainList, getFeeInfo} = require("../../utils/helper");
const { task } = require("hardhat/config");

async function getRegister(network) {
    let deployment = await readFromFile(network);
    let addr = deployment[network]["registerProxy"];
    if (!addr) {
        throw "register not deployed.";
    }

    let register = await ethers.getContractAt("TokenRegisterV3", addr);
    // console.log("token register address:", register.address);
    return register;
}

task("register:deploy", "mos relay deploy").setAction(async (taskArgs, hre) => {
    const { deploy } = hre.deployments;
    const accounts = await ethers.getSigners();
    const deployer = accounts[0];
    console.log("deployer address:", deployer.address);

    let implAddr = await create(hre, deployer, "TokenRegisterV3", [], [], "");

    let TokenRegisterV2 = await ethers.getContractFactory("TokenRegisterV3");
    let data = await TokenRegisterV2.interface.encodeFunctionData("initialize", [deployer.address]);
    let proxy_salt = process.env.REGISTER_PROXY_SALT;

    let proxy = await create(hre, deployer, "BridgeProxy", ["address", "bytes"], [implAddr, data], proxy_salt);

    let deployment = await readFromFile(hre.network.name);
    deployment[hre.network.name]["registerProxy"] = proxy;
    await writeToFile(deployment);
});

task("register:upgrade", "upgrade bridge evm contract in proxy")
    .addOptionalParam("impl", "implementation address", "", types.string)
    .addOptionalParam("auth", "Send through authority call, default false", false, types.boolean)
    .setAction(async (taskArgs, hre) => {
        const { deploy } = hre.deployments;
        const accounts = await ethers.getSigners();
        const deployer = accounts[0];
        console.log("deployer address:", deployer.address);

        let implAddr = taskArgs.impl;
        if (implAddr === "") {
            implAddr = await create(hre, deployer, "TokenRegisterV3", [], [], "");
        }

        let TokenRegisterV2 = await ethers.getContractFactory("TokenRegisterV3");
        let deployment = await readFromFile(hre.network.name);
        let register = TokenRegisterV2.attach(deployment[hre.network.name]["registerProxy"]);

        console.log("pre impl", await register.getImplementation());
        await (await register.upgradeTo(implAddr)).wait();
        console.log("new impl", await register.getImplementation());
    });

task("register:registerToken", "register token")
    .addParam("token", "token address")
    .addParam("mintable", "token mintable", false, types.boolean)
    .addParam("vault", "vault address", "", types.string)
    .setAction(async (taskArgs, hre) => {
        const accounts = await ethers.getSigners();
        const deployer = accounts[0];
        console.log("deployer address:", deployer.address);

        let tokenAddr = await getToken(hre.network.config.chainId, taskArgs.token);
        console.log("token address:", tokenAddr);

        let vaultAddr = taskArgs.vault;
        if (vaultAddr === "") {
            let deployment = await readFromFile(hre.network.name);
            vaultAddr = deployment[hre.network.name]["vault"][taskArgs.token];
            if (!vaultAddr) {
                throw "vault not deployed.";
            }
        }
        console.log("token vault address", vaultAddr);

        let register = await getRegister(hre.network.name);

        await register.registerToken(tokenAddr, vaultAddr, taskArgs.mintable);
        console.log("token", await register.tokenList(tokenAddr));
    });

task("register:mapToken", "mapping token")
    .addParam("token", "relay chain token address")
    .addParam("chain", "chain id")
    .addParam("target", "target token")
    .addParam("decimals", "target token decimals", 18, types.int)
    .addParam("mintable", "token mintable", false, types.boolean)
    .addOptionalParam("update", "update token config", "false", types.boolean)
    .setAction(async (taskArgs, hre) => {
        const accounts = await ethers.getSigners();
        const deployer = accounts[0];
        // console.log("deployer address:", deployer.address);

        let register = await getRegister(hre.network.name);

        let tokenAddr = taskArgs.token;
        // get mapped token
        let targetToken = taskArgs.target;
        if (taskArgs.chain === 728126428 || taskArgs.chain === 3448148188) {
            targetToken = await toHex(targetToken, "Tron");
        } else if (targetToken.substr(0, 2) !== "0x") {
            let hex = await stringToHex(targetToken);
            targetToken = "0x" + hex;
        }
        targetToken = targetToken.toLowerCase();

        let info = await register.getTargetToken(hre.network.config.chainId, taskArgs.chain, tokenAddr);
        // console.log(`target ${taskArgs.chain}, ${info[0]}, ${info[1]}`)
        if (targetToken === info[1] && taskArgs.decimals === info[2] && taskArgs.mintable === info[3]) {
            console.log(`chain [${taskArgs.chain}] token [${taskArgs.token}] map no update`);
            return;
        }
        // map token
        console.log(`${taskArgs.chain} => onchain token(${info[1]}), decimals(${info[2]}), mintable(${info[3]}) `);
        console.log(`\tchain token(${targetToken}), decimals(${taskArgs.decimals}), mintable(${taskArgs.mintable})`);

        if (taskArgs.update) {
            await register.mapToken(tokenAddr, taskArgs.chain, targetToken, taskArgs.decimals, taskArgs.mintable, {gasLimit: 150000});
            console.log(`register chain [${taskArgs.chain}] token [${taskArgs.token}] success`);
        }
    });

task("register:registerTokenChains", "register token Chains")
    .addParam("token", "token address")
    .addParam("chains", "chains list")
    .addParam("enable", "enable bridge", "", types.boolean)
    .addOptionalParam("update", "update token config", false, types.boolean)
    .setAction(async (taskArgs, hre) => {
        const accounts = await ethers.getSigners();
        const deployer = accounts[0];
        let chainList = taskArgs.chains.split(",");

        let register = await getRegister(hre.network.name);

        let tokenAddr = await getToken(hre.network.config.chainId, taskArgs.token);

        let updateList = [];
        for (let i = 0; i < chainList.length; i++) {
            let info = await register.getTargetFeeInfo(tokenAddr, chainList[i]);
            if (taskArgs.enable === info[0]) {
                continue;
            }
            updateList.push(chainList[i]);
        }
        if (updateList.length === 0) {
            console.log(`token [${taskArgs.token}] bridge [${taskArgs.enable}] no update`);
            return;
        }
        console.log(`\t token [${taskArgs.token}] bridgeable [${taskArgs.enable}] chains [${chainList}]`);
        if (taskArgs.update) {
            if (hre.network.name === "Tron" || hre.network.name === "TronTest") {
                await register.registerTokenChains(tokenAddr, updateList, taskArgs.enable).send();
            } else {
                await (await register.registerTokenChains(tokenAddr, updateList, taskArgs.enable)).wait();
            }
            console.log(`set token [${taskArgs.token}] chains [${chainList}] bridgeable [${taskArgs.enable}]`);
        }
    });

task("register:setFromChainFee", "set transfer outFee")
    .addParam("token", "relay chain token address")
    .addParam("chain", "from chain id")
    .addParam("lowest", "lowest fee cast")
    .addParam("highest", "highest fee cast")
    .addParam("rate", "fee rate")
    .addParam("decimals", "relay chain token decimals", 18, types.int)
    .addOptionalParam("update", "update token config", "false", types.boolean)
    .setAction(async (taskArgs, hre) => {
        const accounts = await ethers.getSigners();
        const deployer = accounts[0];
        // console.log("deployer address:", deployer.address);

        let register = await getRegister(hre.network.name);

        let decimals = taskArgs.decimals;
        let min = ethers.utils.parseUnits(taskArgs.lowest, decimals);
        let max = ethers.utils.parseUnits(taskArgs.highest, decimals);
        let rate = ethers.utils.parseUnits(taskArgs.rate, 6);

        let info = await register.getTargetFeeInfo(taskArgs.token, taskArgs.chain);
        if (min.eq(info[3][0]) && max.eq(info[3][1]) && rate.eq(info[3][2])) {
            console.log(`chain [${taskArgs.chain}] token [${taskArgs.token}] from chain fee no update`);
            return;
        }
        console.log(
            `${taskArgs.chain} => on-chain outFee min(${info[3][0]}), max(${info[3][1]}), rate(${info[3][2]}) `
        );
        console.log(`\tconfig outFee min(${taskArgs.lowest}), max(${taskArgs.highest}), rate(${taskArgs.rate})`);

        if (taskArgs.update) {
            await register.setFromChainFee(taskArgs.token, taskArgs.chain, min, max, rate);
        }

        console.log(`set chain [${taskArgs.chain}] token [${taskArgs.token}] from chain fee success`);
    });

task("register:setToChainFee", "set to chain token outFee")
    .addParam("token", "token address")
    .addParam("chain", "from chain id")
    .addParam("lowest", "lowest fee cast")
    .addParam("highest", "highest fee cast")
    .addParam("rate", "fee rate")
    .addParam("decimals", "relay chain token decimals", 18, types.int)
    .addOptionalParam("update", "update token config", "false", types.boolean)
    .setAction(async (taskArgs, hre) => {
        const accounts = await ethers.getSigners();
        const deployer = accounts[0];
        // console.log("deployer address:", deployer.address);

        let register = await getRegister(hre.network.name);

        let decimals = taskArgs.decimals;
        let min = ethers.utils.parseUnits(taskArgs.lowest, decimals);
        let max = ethers.utils.parseUnits(taskArgs.highest, decimals);
        let rate = ethers.utils.parseUnits(taskArgs.rate, 6);

        let info = await register.getTargetFeeInfo(taskArgs.token, taskArgs.chain);
        if (min.eq(info[2][0]) && max.eq(info[2][1]) && rate.eq(info[2][2])) {
            console.log(`chain [${taskArgs.chain}] token [${taskArgs.token}] to chain fee no update`);
            return;
        }
        console.log(`${taskArgs.chain} => on-chain fee min(${info[2][0]}), max(${info[2][1]}), rate(${info[2][2]}) `);
        console.log(`\tconfig fee min(${min}), max(${max}), rate(${rate})`);
        if (taskArgs.update) {
            await register.setToChainTokenFee(taskArgs.token, taskArgs.chain, min, max, rate);
            console.log(`set chain [${taskArgs.chain}] token [${taskArgs.token}] to chain fee success`);
        }

        // await register.setTokenFee(taskArgs.token, taskArgs.from, taskArgs.lowest, taskArgs.highest, taskArgs.rate);
    });

task("register:setBaseFee", "set target chain token base fee")
    .addParam("token", "token address")
    .addParam("chain", "from chain id")
    .addParam("swap", "with swap on target chain")
    .addParam("bridge", "no swap on target chain")
    .addParam("decimals", "relay chain token decimals", 18, types.int)
    .addOptionalParam("update", "update token config", "false", types.boolean)
    .setAction(async (taskArgs, hre) => {
        // const accounts = await ethers.getSigners();
        // const deployer = accounts[0];
        // console.log("deployer address:", deployer.address);

        let register = await getRegister(hre.network.name);
        let decimals = taskArgs.decimals;
        let withswap = ethers.utils.parseUnits(taskArgs.swap, decimals);
        let noswap = ethers.utils.parseUnits(taskArgs.bridge, decimals);

        let info = await register.getTargetFeeInfo(taskArgs.token, taskArgs.chain);
        if (withswap.eq(info[1][0]) && noswap.eq(info[1][1])) {
            console.log(`chain [${taskArgs.chain}] token [${taskArgs.token}] base fee no update`);
            return;
        }
        console.log(`${taskArgs.chain} => on-chain base fee swap(${info[1][0]}), bridge(${info[1][1]})`);
        console.log(`\tconfig base fee swap(${withswap}), noswap(${noswap})`);

        if (taskArgs.update) {
            await register.setBaseFee(taskArgs.token, taskArgs.chain, withswap, noswap);
            console.log(`set chain ${taskArgs.chain} token ${taskArgs.token} base fee success`);
        }
    });


task("register:setBaseFeeReceiver", "set set baseFee Receiver")
    .addParam("receiver", "base fee receiver")
    .setAction(async (taskArgs, hre) => {
        const accounts = await ethers.getSigners();
        const deployer = accounts[0];
        console.log("deployer address:", deployer.address);

        let register = await getRegister(hre.network.name);

        await (await register.setBaseFeeReceiver(taskArgs.receiver)).wait();

        console.log(`set chain ${taskArgs.chain} token ${taskArgs.token} base fee success`);
    });

task("register:updateTokenChains", "update token target chain")
    .addParam("token", "token name")
    .addOptionalParam("update", "update token config", false, types.boolean)
    .setAction(async (taskArgs, hre) => {
        const accounts = await ethers.getSigners();
        const deployer = accounts[0];
        console.log("deployer address:", deployer.address);

        outputAddr = false;

        let tokenAddr = await getToken(hre.network.config.chainId, taskArgs.token);
        console.log(`token ${taskArgs.token}  address: ${tokenAddr}`);

        let chain = await getChain(hre.network.config.chainId);
        let feeInfo = await getFeeInfo(chain.chain, taskArgs.token);

        let chainList = await getChainList();
        let addList = [];
        let removeList = [];
        for (let i = 0; i < chainList.length; i++) {
            if (feeInfo.target.includes(chainList[i].chain)) {
                addList.push(chainList[i].chainId);
            } else {
                removeList.push(chainList[i].chainId);
            }
        }
        await hre.run("register:registerTokenChains", {
            token: taskArgs.token,
            chains: addList.toString(),
            enable: true,
            update: taskArgs.update
        });

        await hre.run("register:registerTokenChains", {
            token: taskArgs.token,
            chains: removeList.toString(),
            enable: false,
            update: taskArgs.update
        });

        outputAddr = true;

        console.log(`update token [${taskArgs.token}] chains success`);
    });

task("register:update", "update token bridge and fee to target chain")
    .addOptionalParam("chain", "chain name", "", types.string)
    .addOptionalParam("update", "update token config", false, types.boolean)
    .setAction(async (taskArgs, hre) => {
        const accounts = await ethers.getSigners();
        const deployer = accounts[0];
        // console.log("deployer address:", deployer.address);

        let chainList = [];
        if (taskArgs.chain === "") {
            chainList = await getChainList();
        } else {
            let chain = await getChain(taskArgs.chain);
            chainList.push(chain);
        }

        for (let chain of chainList) {
            console.log(`\n============ update chain [${chain.chain}] ============`)

            let feeList = await getFeeList(chain.chain);

            let tokenList = Object.keys(feeList);
            for (let tokenName of tokenList) {
                console.log(`\nUpdate token [${tokenName}] ...`);
                let feeInfo = feeList[tokenName];
                let tokenAddr = await getToken(hre.network.config.chainId, tokenName);
                let token = await ethers.getContractAt("IERC20MetadataUpgradeable", tokenAddr);
                let decimals = await token.decimals();
                // console.log(`token ${taskArgs.token} address: ${token.address}, decimals ${decimals}`);

                await hre.run("register:updateTokenChains", {
                    token: tokenName,
                    update: taskArgs.update
                });

                let targetToken = await getToken(chain.chainId, tokenName);
                // console.log(`target ${chain.chainId}, ${targetToken}, ${chainFee.decimals}`)
                await hre.run("register:mapToken", {
                    token: tokenAddr,
                    chain: chain.chainId,
                    target: targetToken,
                    decimals: feeInfo.decimals,
                    mintable: feeInfo.mintable,
                    update: taskArgs.update
                });

                await hre.run("register:setBaseFee", {
                    token: tokenAddr,
                    chain: chain.chainId,
                    bridge: feeInfo.base.bridge,
                    swap: feeInfo.base.swap,
                    decimals: decimals,
                    update: taskArgs.update
                });

                await hre.run("register:setToChainFee", {
                    token: tokenAddr,
                    chain: chain.chainId,
                    lowest: feeInfo.fee.min,
                    highest: feeInfo.fee.max,
                    rate: feeInfo.fee.rate,
                    decimals: decimals,
                    update: taskArgs.update
                });

                let transferOutFee = feeInfo.outFee;
                if (transferOutFee === undefined) {
                    transferOutFee = { min: "0", max: "0", rate: "0" };
                }
                await hre.run("register:setFromChainFee", {
                    token: tokenAddr,
                    chain: chain.chainId,
                    lowest: transferOutFee.min,
                    highest: transferOutFee.max,
                    rate: transferOutFee.rate,
                    decimals: decimals,
                    update: taskArgs.update
                });
            }
        }
    });


task("register:grantRole", "set token outFee")
    .addParam("role", "role address")
    .addParam("account", "account address")
    .addOptionalParam("grant", "grant or revoke", true, types.boolean)
    .setAction(async (taskArgs, hre) => {
        const accounts = await ethers.getSigners();
        const deployer = accounts[0];
        console.log("deployer address:", deployer.address);

        let TokenRegister = await ethers.getContractFactory("TokenRegisterV3");
        let deployment = await readFromFile(hre.network.name);
        let register = TokenRegister.attach(deployment[hre.network.name]["registerProxy"]);
        console.log("token register:", register.address);

        let role;
        if (taskArgs.role === "upgrade" || taskArgs.role === "upgrader") {
            role = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("UPGRADER_ROLE"));
        } else if (taskArgs.role === "manage" || taskArgs.role === "manager") {
            role = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("MANAGER_ROLE"));
        } else {
            role = ethers.constants.HashZero;
        }

        if (taskArgs.grant) {
            await (await register.grantRole(role, taskArgs.account)).wait();
            console.log(`grant ${taskArgs.account} role ${role}`);
        } else {
            await register.revokeRole(role, taskArgs.account);
            console.log(`revoke ${taskArgs.account} role ${role}`);
        }
    });
