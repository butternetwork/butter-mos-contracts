let { create, toHex, fromHex, readFromFile, writeToFile } = require("../../utils/create.js");
const {getToken, stringToHex} = require("../../utils/helper");
const {task} = require("hardhat/config");


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
    .addOptionalParam("vault", "vault address", "", types.string)
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

        await register.registerToken(tokenAddr, vaultAddr);
        console.log("token", await register.tokenList(tokenAddr));
    });

task("register:mapToken", "mapping token")
    .addParam("token", "relay chain token address")
    .addParam("chain", "chain id")
    .addParam("target", "target token")
    .addParam("decimals", "target token decimals", 18, types.int)
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

        let info = await register.getTargetTokenInfo(tokenAddr, taskArgs.chain);
        // console.log(`target ${taskArgs.chain}, ${info[0]}, ${info[1]}`)
        if (targetToken !== info[0] || taskArgs.decimals !== info[1]) {
            // map token
            console.log(`${taskArgs.chain} => onchain token(${info[0]}), decimals(${info[1]}) `);
            console.log(`\tchain token(${targetToken}), decimals(${taskArgs.decimals})`);

            await register.mapToken(tokenAddr, taskArgs.chain, targetToken, taskArgs.decimals, {gasLimit: 150000});

            console.log(`register chain ${taskArgs.chain} token ${taskArgs.token} success`);
        }

        // console.log("target token info: ",await register.getTargetTokenInfo(tokenAddr, taskArgs.chain));
    });

task("register:setTransferOutFee", "set transfer outFee")
    .addParam("token", "relay chain token address")
    .addParam("chain", "from chain id")
    .addParam("lowest", "lowest fee cast")
    .addParam("highest", "highest fee cast")
    .addParam("rate", "fee rate")
    .addParam("decimals", "relay chain token decimals", 18, types.int)
    .setAction(async (taskArgs, hre) => {
        const accounts = await ethers.getSigners();
        const deployer = accounts[0];
        // console.log("deployer address:", deployer.address);

        let register = await getRegister(hre.network.name);

        let decimals = taskArgs.decimals;
        let min = ethers.utils.parseUnits(taskArgs.lowest, decimals);
        let max = ethers.utils.parseUnits(taskArgs.highest, decimals);
        let rate = ethers.utils.parseUnits(taskArgs.rate, 6);

        let info = await register.getTargetTokenInfo(taskArgs.token, taskArgs.chain);
        if (min.eq(info[3][0]) && max.eq(info[3][1]) && rate.eq(info[3][2])) {
            console.log(`chain ${taskArgs.chain} token ${taskArgs.token} transfer out fee no update`);
            return;
        }
        console.log(
            `${taskArgs.chain} => on-chain outFee min(${info[3][0]}), max(${info[3][1]}), rate(${info[3][2]}) `
        );
        console.log(`\tconfig outFee min(${taskArgs.lowest}), max(${taskArgs.highest}), rate(${taskArgs.rate})`);

        await register.setTransferOutFee(taskArgs.token, taskArgs.chain, min, max, rate);

        console.log(`set chain ${taskArgs.chain} token ${taskArgs.token} out fee success`);
    });

task("register:setTokenFee", "set token outFee")
    .addParam("token", "token address")
    .addParam("chain", "from chain id")
    .addParam("lowest", "lowest fee cast")
    .addParam("highest", "highest fee cast")
    .addParam("rate", "fee rate")
    .addParam("decimals", "relay chain token decimals", 18, types.int)
    .setAction(async (taskArgs, hre) => {
        const accounts = await ethers.getSigners();
        const deployer = accounts[0];
        // console.log("deployer address:", deployer.address);

        let register = await getRegister(hre.network.name);

        let decimals = taskArgs.decimals;
        let min = ethers.utils.parseUnits(taskArgs.lowest, decimals);
        let max = ethers.utils.parseUnits(taskArgs.highest, decimals);
        let rate = ethers.utils.parseUnits(taskArgs.rate, 6);

        let info = await register.getTargetTokenInfo(taskArgs.token, taskArgs.chain);
        if (min.eq(info[2][0]) && max.eq(info[2][1]) && rate.eq(info[2][2])) {
            console.log(`chain ${taskArgs.chain} token ${taskArgs.token} fee no update`);
            return;
        }
        console.log(
            `${taskArgs.chain} => on-chain fee min(${info[2][0]}), max(${info[2][1]}), rate(${info[2][2]}) `
        );
        console.log(`\tconfig fee min(${min}), max(${max}), rate(${rate})`);

        await register.setTokenFee(taskArgs.token, taskArgs.chain, min, max, rate);

        console.log(`set chain ${taskArgs.chain} token ${taskArgs.token} fee success`);

        // await register.setTokenFee(taskArgs.token, taskArgs.from, taskArgs.lowest, taskArgs.highest, taskArgs.rate);
    });

task("register:grantRole", "set token outFee")
    .addParam("role", "role address")
    .addParam("account", "account address")
    .addOptionalParam("grant", "grant or revoke", true, types.boolean)
    .setAction(async (taskArgs, hre) => {
        const accounts = await ethers.getSigners();
        const deployer = accounts[0];
        console.log("deployer address:", deployer.address);

        let TokenRegisterV2 = await ethers.getContractFactory("TokenRegisterV3");
        let deployment = await readFromFile(hre.network.name);
        let register = TokenRegisterV2.attach(deployment[hre.network.name]["registerProxy"]);
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
