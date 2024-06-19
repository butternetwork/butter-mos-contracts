let { create, createZk, createTron, readFromFile, writeToFile } = require("../../utils/create.js");

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
    .addParam("vault", "vault address")
    .setAction(async (taskArgs, hre) => {
        const accounts = await ethers.getSigners();
        const deployer = accounts[0];
        console.log("deployer address:", deployer.address);

        let TokenRegisterV3 = await ethers.getContractFactory("TokenRegisterV3");
        let deployment = await readFromFile(hre.network.name);
        let register = TokenRegisterV3.attach(deployment[hre.network.name]["registerProxy"]);
        await (await register.registerToken(taskArgs.token, taskArgs.vault, taskArgs.mintable)).wait();
    });

task("register:mapToken", "mapping token")
    .addParam("token", "token address")
    .addParam("from", "from chain id")
    .addParam("fromtoken", "from token")
    .addParam("decimals", "token decimals")
    .setAction(async (taskArgs, hre) => {
        const accounts = await ethers.getSigners();
        const deployer = accounts[0];
        console.log("deployer address:", deployer.address);
        let TokenRegisterV2 = await ethers.getContractFactory("TokenRegisterV2");
        let deployment = await readFromFile(hre.network.name);
        let register = TokenRegisterV2.attach(deployment[hre.network.name]["registerProxy"]);
        await (await register.mapToken(taskArgs.token, taskArgs.from, taskArgs.fromtoken, taskArgs.decimals)).wait();
    });

task("register:setTransferOutFee", "set transfer outFee")
    .addParam("token", "token address")
    .addParam("from", "from chain id")
    .addParam("lowest", "lowest fee cast")
    .addParam("highest", "highest fee cast")
    .addParam("rate", "fee rate")
    .setAction(async (taskArgs, hre) => {
        const accounts = await ethers.getSigners();
        const deployer = accounts[0];
        console.log("deployer address:", deployer.address);
        let TokenRegisterV2 = await ethers.getContractFactory("TokenRegisterV2");
        let deployment = await readFromFile(hre.network.name);
        let register = TokenRegisterV2.attach(deployment[hre.network.name]["registerProxy"]);
        await (
            await register.setTransferOutFee(
                taskArgs.token,
                taskArgs.from,
                taskArgs.lowest,
                taskArgs.highest,
                taskArgs.rate
            )
        ).wait();
    });

task("register:setTokenFee", "set token outFee")
    .addParam("token", "token address")
    .addParam("from", "from chain id")
    .addParam("lowest", "lowest fee cast")
    .addParam("highest", "highest fee cast")
    .addParam("rate", "fee rate")
    .setAction(async (taskArgs, hre) => {
        const accounts = await ethers.getSigners();
        const deployer = accounts[0];
        console.log("deployer address:", deployer.address);
        let TokenRegisterV2 = await ethers.getContractFactory("TokenRegisterV2");
        let deployment = await readFromFile(hre.network.name);
        let register = TokenRegisterV2.attach(deployment[hre.network.name]["registerProxy"]);
        await (
            await register.setTokenFee(taskArgs.token, taskArgs.from, taskArgs.lowest, taskArgs.highest, taskArgs.rate)
        ).wait();
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
            await register.revoke(role, taskArgs.account);
            console.log(`revoke ${taskArgs.account} role ${role}`);
        }
    });
