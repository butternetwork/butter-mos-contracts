let { create, readFromFile, writeToFile } = require("../../utils/helper.js");
let { verify } = require("../utils/verify.js");
const { stringToHex } = require("../utils/util");
const { getMos } = require("../../utils/helper");

function getRole(role) {
    if (role.substr(0, 2) === "0x") {
        return role;
    }
    if (role === "admin") {
        return "0x0000000000000000000000000000000000000000000000000000000000000000";
    }
    let roleName = role;
    if (role == "manager") {
        roleName = "MANAGER_ROLE";
    } else if (role == "minter") {
        roleName = "MINTER_ROLE";
    } else if (role == "controller") {
        roleName = "CONTROLLER_ROLE";
    }
    return ethers.utils.keccak256(ethers.utils.toUtf8Bytes(roleName));
}

async function getAuth(network) {
    let deployment = await readFromFile(hre.network.name);
    if (!deployment[network]["authority"]) {
        throw "authority not deployed";
    }
    let Authority = await ethers.getContractFactory("Authority");
    let authority = Authority.attach(deployment[hre.network.name]["authority"]);

    return authority;
}

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

        await verify(authority, [taskArgs.admin], "contracts/utils/Authority.sol:Authority", chainId,true);
    });

task("auth:addControl", "add control")
    .addParam("target", "call target address")
    .addParam("func", "call function signature")
    .addParam("role", "control role")
    .setAction(async (taskArgs, hre) => {
        const accounts = await ethers.getSigners();
        const deployer = accounts[0];
        console.log("deployer address:", deployer.address);

        let authority = await getAuth(hre.network.name);
        console.log("authority address", authority.address);

        let role = getRole(taskArgs.role);
        console.log("role:", role);

        let target = taskArgs.target;
        let funSig = taskArgs.func;
        if (taskArgs.target === "mos") {
            let mos = await getMos(hre.network.config.chainId, hre.network.name);
            if (mos === undefined) {
                throw "mos not deployed ...";
            }
            console.log("mos address:", mos.address);
            target = mos.address;
            funSig = mos.interface.getSighash(taskArgs.func);
        } else if (taskArgs.target === "auth") {
            target = authority.address;
            funSig = authority.interface.getSighash(taskArgs.func);
        }

        console.log("target:", target);
        console.log("func sig:", funSig);

        await (await authority.addControl(target, funSig, role)).wait();

        console.log(
            `add target address ${taskArgs.target} function ${taskArgs.func} controlled by role ${taskArgs.role} successfully`
        );
    });

task("auth:getRole", "get target role")
    .addParam("target", "target address")
    .addParam("funsig", "fun sig")
    .setAction(async (taskArgs, hre) => {
        const accounts = await ethers.getSigners();
        const deployer = accounts[0];
        console.log("deployer address:", deployer.address);

        let authority = await getAuth(hre.network.name);
        console.log("authority address", authority.address);

        let target = taskArgs.target;
        if (taskArgs.target === "mos") {
            let mos = await getMos(hre.network.config.chainId, hre.network.name);
            if (mos === undefined) {
                throw "mos not deployed ...";
            }
            console.log("mos address:", mos.address);
            target = mos.address;
        }

        let role = await authority.getRole(target, taskArgs.funsig);
        console.log(`target ${taskArgs.target} ${taskArgs.funsig} role: ${role}`);
    });

task("auth:authorized", "get target role")
    .addParam("target", "target address")
    .addParam("account", "user address")
    .addParam("funsig", "fun sig")
    .setAction(async (taskArgs, hre) => {
        const accounts = await ethers.getSigners();
        const deployer = accounts[0];
        console.log("deployer address:", deployer.address);

        let authority = await getAuth(hre.network.name);
        console.log("authority address", authority.address);

        let target = taskArgs.target;
        if (taskArgs.target === "mos") {
            let mos = await getMos(hre.network.config.chainId, hre.network.name);
            if (mos === undefined) {
                throw "mos not deployed ...";
            }
            console.log("mos address:", mos.address);
            target = mos.address;
        }

        let rst = await authority.isAuthorized(taskArgs.account, target, taskArgs.funsig);
        console.log(`${taskArgs.account} ${taskArgs.target} ${taskArgs.funsig} result: ${rst}`);
    });

task("auth:grantRole", "grantRole")
    .addParam("account", "account to grantRole")
    .addParam("role", "control role, admin/minter/manager")
    .setAction(async (taskArgs, hre) => {
        const accounts = await ethers.getSigners();
        const deployer = accounts[0];
        console.log("deployer address:", deployer.address);

        let authority = await getAuth(hre.network.name);
        console.log("authority address", authority.address);

        let role = getRole(taskArgs.role);
        console.log("role:", role);

        await (await authority.grantRole(role, taskArgs.account)).wait();

        console.log(`grant role ${taskArgs.role} to ${taskArgs.account} successfully`);
    });

task("auth:revokeRole", "revokeRole")
    .addParam("account", "account to revokeRole")
    .addParam("role", "control role")
    .setAction(async (taskArgs, hre) => {
        const accounts = await ethers.getSigners();
        const deployer = accounts[0];
        console.log("deployer address:", deployer.address);

        let authority = await getAuth(hre.network.name);
        console.log("authority address", authority.address);

        let role = getRole(taskArgs.role);
        console.log("role:", role);

        await (await authority.revokeRole(role, taskArgs.account)).wait();

        console.log(`revoke ${taskArgs.account} role ${taskArgs.role} successfully`);
    });

task("auth:getMember", "get role member")
    .addOptionalParam("addr", "The auth addr", "", types.string)
    .addOptionalParam("role", "The role", "admin", types.string)
    .setAction(async (taskArgs, hre) => {
        const accounts = await ethers.getSigners();
        const deployer = accounts[0];
        console.log("deployer address:", deployer.address);

        let addr = taskArgs.addr;
        if (addr === "") {
            let deployment = await readFromFile(hre.network.name);
            if (!deployment[hre.network.name]["authority"]) {
                throw "authority not deployed";
            }
            addr = deployment[hre.network.name]["authority"];
        }
        let Authority = await ethers.getContractFactory("Authority");
        let authority = Authority.attach(addr);
        console.log("authority address", authority.address);

        let role = getRole(taskArgs.role);
        console.log("role:", role);

        let count = await authority.getRoleMemberCount(role);
        console.log(`role ${taskArgs.role} has ${count} member(s)`);

        for (let i = 0; i < count; i++) {
            let member = await authority.getRoleMember(role, i);
            console.log(`    ${i}: ${member}`);
        }
    });
