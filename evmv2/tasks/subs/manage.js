let { create, readFromFile, writeToFile} = require("../../utils/helper.js");
let { needVerify} = require("../utils/util.js");

task("manage:deploy", "mos relay deploy")
    .addParam("admin", "defualt admin address")
    .setAction(async (taskArgs, hre) => {
        const accounts = await ethers.getSigners();
        const deployer = accounts[0];
        const chainId = await hre.network.config.chainId;
        console.log("deployer address:", deployer.address);

        let MAPOmnichainMange = await ethers.getContractFactory("MAPOmnichainMange");
        let salt = process.env.MANAGE_SALT;
        let param = ethers.utils.defaultAbiCoder.encode(["address"], [taskArgs.admin]);
        let createResult = await create(salt, MAPOmnichainMange.bytecode, param);
        if (!createResult[1]) {
            return;
        }
        let manage = createResult[0];
        console.log(`Deploy manage address ${manage} successful`);
        let deployment = await readFromFile(hre.network.name);
        deployment[hre.network.name]["manage"] = manage;
        await writeToFile(deployment);
        if (needVerify(chainId)) {
            sleep(10000);
            await run("verify:verify", {
                address: manage,
                constructorArguments: [taskArgs.admin],
                contract: "contracts/MAPOmnichainMange.sol:MAPOmnichainMange",
            });
        }
    });

task("manage:addToControl", "add execute AddToControl")
    .addParam("target", "call target address")
    .addParam("func", "call function signature")
    .addParam("role", "control role")
    .setAction(async (taskArgs, hre) => {
        const accounts = await ethers.getSigners();
        const deployer = accounts[0];
        console.log("deployer address:", deployer.address);
        let deployment = await readFromFile(hre.network.name);
        if(!deployment[hre.network.name]["manage"]){
            throw("manage not deployed");
        }
        let MAPOmnichainMange = await ethers.getContractFactory("MAPOmnichainMange");
        let manage = MAPOmnichainMange.attach(deployment[hre.network.name]["manage"]);

        console.log("manage address",manage.address);

        await(await manage.addToControl(taskArgs.target,taskArgs.func,taskArgs.role)).wait();

        console.log(`add target address ${taskArgs.target} function ${taskArgs.func} controled by role ${taskArgs.role} successfully`);

    });

    task("manage:grantRole", "grantRole")
    .addParam("account", "account to grantRole")
    .addParam("role", "control role")
    .setAction(async (taskArgs, hre) => {
        const accounts = await ethers.getSigners();
        const deployer = accounts[0];
        console.log("deployer address:", deployer.address);
        let deployment = await readFromFile(hre.network.name);
        if(!deployment[hre.network.name]["manage"]){
            throw("manage not deployed");
        }
        let MAPOmnichainMange = await ethers.getContractFactory("MAPOmnichainMange");
        let manage = MAPOmnichainMange.attach(deployment[hre.network.name]["manage"]);

        console.log("manage address",manage.address);

        await(await manage.grantRole(taskArgs.role,taskArgs.account)).wait();

        console.log(`grant role ${taskArgs.role} to ${taskArgs.account} successfully`);
    });

    task("manage:revokeRole", "revokeRole")
    .addParam("account", "account to revokeRole")
    .addParam("role", "control role")
    .setAction(async (taskArgs, hre) => {
        const accounts = await ethers.getSigners();
        const deployer = accounts[0];
        console.log("deployer address:", deployer.address);
        let deployment = await readFromFile(hre.network.name);
        if(!deployment[hre.network.name]["manage"]){
            throw("manage not deployed");
        }
        let MAPOmnichainMange = await ethers.getContractFactory("MAPOmnichainMange");
        let manage = MAPOmnichainMange.attach(deployment[hre.network.name]["manage"]);

        console.log("manage address",manage.address);

        await(await manage.revokeRole(taskArgs.role,taskArgs.account)).wait();

        console.log(`revoke ${taskArgs.account} role ${taskArgs.role} successfully`);
    });

