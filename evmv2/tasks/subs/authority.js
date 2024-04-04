let { create, readFromFile, writeToFile } = require("../../utils/helper.js");
let { needVerify } = require("../utils/util.js");

task("auth:deploy", "mos relay deploy")
    .addParam("admin", "default admin address")
    .setAction(async (taskArgs, hre) => {
        const accounts = await ethers.getSigners();
        const deployer = accounts[0];
        const chainId = await hre.network.config.chainId;
        console.log("deployer address:", deployer.address);

        let Authority = await ethers.getContractFactory("Authority");
        let salt = process.env.AUTH_SALT;
        let param = ethers.utils.defaultAbiCoder.encode(["address"], [taskArgs.admin]);
        let createResult = await create(salt, Authority.bytecode, param);
        if (!createResult[1]) {
            return;
        }
        let authority = createResult[0];
        console.log(`Deploy authority address ${authority} successful`);
        let deployment = await readFromFile(hre.network.name);
        deployment[hre.network.name]["authority"] = authority;
        await writeToFile(deployment);
        if (needVerify(chainId)) {
            sleep(10000);
            await run("verify:verify", {
                address: authority,
                constructorArguments: [taskArgs.admin],
                contract: "contracts/Authority.sol:Authority",
            });
        }
    });

task("auth:addControl", "add control")
    .addParam("target", "call target address")
    .addParam("func", "call function signature")
    .addParam("role", "control role")
    .setAction(async (taskArgs, hre) => {
        const accounts = await ethers.getSigners();
        const deployer = accounts[0];
        console.log("deployer address:", deployer.address);
        let deployment = await readFromFile(hre.network.name);
        if (!deployment[hre.network.name]["authority"]) {
            throw "authority not deployed";
        }
        let Authority = await ethers.getContractFactory("Authority");
        let authority = Authority.attach(deployment[hre.network.name]["authority"]);

        console.log("authority address", authority.address);

        await (await authority.addToControl(taskArgs.target, taskArgs.func, taskArgs.role)).wait();

        console.log(
            `add target address ${taskArgs.target} function ${taskArgs.func} controlled by role ${taskArgs.role} successfully`
        );
    });

task("auth:grantRole", "grantRole")
    .addParam("account", "account to grantRole")
    .addParam("role", "control role")
    .setAction(async (taskArgs, hre) => {
        const accounts = await ethers.getSigners();
        const deployer = accounts[0];
        console.log("deployer address:", deployer.address);
        let deployment = await readFromFile(hre.network.name);
        if (!deployment[hre.network.name]["authority"]) {
            throw "authority not deployed";
        }
        let Authority = await ethers.getContractFactory("Authority");
        let authority = Authority.attach(deployment[hre.network.name]["authority"]);

        console.log("authority address", authority.address);

        await (await authority.grantRole(taskArgs.role, taskArgs.account)).wait();

        console.log(`grant role ${taskArgs.role} to ${taskArgs.account} successfully`);
    });

task("auth:revokeRole", "revokeRole")
    .addParam("account", "account to revokeRole")
    .addParam("role", "control role")
    .setAction(async (taskArgs, hre) => {
        const accounts = await ethers.getSigners();
        const deployer = accounts[0];
        console.log("deployer address:", deployer.address);
        let deployment = await readFromFile(hre.network.name);
        if (!deployment[hre.network.name]["authority"]) {
            throw "authority not deployed";
        }
        let Authority = await ethers.getContractFactory("Authority");
        let authority = Authority.attach(deployment[hre.network.name]["authority"]);

        console.log("authority address", authority.address);

        await (await authority.revokeRole(taskArgs.role, taskArgs.account)).wait();

        console.log(`revoke ${taskArgs.account} role ${taskArgs.role} successfully`);
    });
