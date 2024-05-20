let { create, createZk, createTron, readFromFile, writeToFile } = require("../../utils/create.js");

task("register:deploy", "mos relay deploy")
    .addParam("wrapped", "native wrapped token address")
    .addParam("mos", "mos address")
    .setAction(async (taskArgs, hre) => {
        const { deploy } = hre.deployments;
        const accounts = await ethers.getSigners();
        const deployer = accounts[0];
        console.log("deployer address:", deployer.address);
        await deploy("TokenRegisterV2", {
            from: deployer.address,
            args: [],
            log: true,
            contract: "TokenRegisterV2",
        });
        let impl = await hre.deployments.get("TokenRegisterV2");
        let implAddr = impl.address;
        let TokenRegisterV2 = await ethers.getContractFactory("TokenRegisterV2");
        let data = await TokenRegisterV2.interface.encodeFunctionData("initialize", [deployer.address]);
        let Proxy = await ethers.getContractFactory("ButterProxy");
        let proxy_salt = process.env.REGISTER_PROXY_SALT;
        let param = ethers.utils.defaultAbiCoder.encode(["address", "bytes"], [implAddr, data]);
        let createResult = await create(proxy_salt, Proxy.bytecode, param);
        if (!createResult[1]) {
            return;
        }
        let register = createResult[0];
        let deployment = await readFromFile(hre.network.name);
        deployment[hre.network.name]["registerProxy"] = register;
        await writeToFile(deployment);
    });

task("register:upgrade", "upgrade bridge evm contract in proxy").setAction(async (taskArgs, hre) => {
    const { deploy } = hre.deployments;
    const accounts = await ethers.getSigners();
    const deployer = accounts[0];
    console.log("deployer address:", deployer.address);
    await deploy("TokenRegisterV2", {
        from: deployer.address,
        args: [],
        log: true,
        contract: "TokenRegisterV2",
    });
    let impl = await  hre.deployments.get("TokenRegisterV2");
    let implAddr = impl.address;
    let TokenRegisterV2 = await ethers.getContractFactory("TokenRegisterV2");
    let deployment = await readFromFile(hre.network.name);
    let register = TokenRegisterV2.attach(deployment[hre.network.name]["registerProxy"]);
    console.log("pre impl", await register.getImplementation());
    await (await register.upgradeTo(implAddr)).wait();
    console.log("new impl", await register.getImplementation());
});

task("register:registerToken", "register token")
    .addParam("token", "token address")
    .addParam("vault", "vault address")
    .addParam("mintable", "vault address")
    .setAction(async (taskArgs, hre) => {
        const accounts = await ethers.getSigners();
        const deployer = accounts[0];
        console.log("deployer address:", deployer.address);
        let TokenRegisterV2 = await ethers.getContractFactory("TokenRegisterV2");
        let deployment = await readFromFile(hre.network.name);
        let register = TokenRegisterV2.attach(deployment[hre.network.name]["registerProxy"]);
        await (await register.registerToken(taskArgs.token, taskArgs.vault, taskArgs.mintable)).wait();
    });

task("register:mapToken", "mapping token")
    .addParam("token", "token address")
    .addParam("from", "from chain id")
    .addParam("fromtoken", "from token")
    .addParam("decimals", "token decimals")
    .addParam("enable", "enable bridge out")
    .setAction(async (taskArgs, hre) => {
        const accounts = await ethers.getSigners();
        const deployer = accounts[0];
        console.log("deployer address:", deployer.address);
        let TokenRegisterV2 = await ethers.getContractFactory("TokenRegisterV2");
        let deployment = await readFromFile(hre.network.name);
        let register = TokenRegisterV2.attach(deployment[hre.network.name]["registerProxy"]);
        await (
            await register.mapToken(
                taskArgs.token,
                taskArgs.from,
                taskArgs.fromtoken,
                taskArgs.decimals,
                taskArgs.enable
            )
        ).wait();
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
    .setAction(async (taskArgs, hre) => {
        const accounts = await ethers.getSigners();
        const deployer = accounts[0];
        console.log("deployer address:", deployer.address);
        let TokenRegisterV2 = await ethers.getContractFactory("TokenRegisterV2");
        let deployment = await readFromFile(hre.network.name);
        let register = TokenRegisterV2.attach(deployment[hre.network.name]["registerProxy"]);
        let role;
        if (taskArgs.role === "upgrade") {
            role = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("UPGRADE_ROLE"));
        } else if (taskArgs.role === "manage") {
            role = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("MANAGE_ROLE"));
        } else {
            role = ethers.constants.HashZero;
        }
        await (await register.grantRole(role, taskArgs.account)).wait();
    });
