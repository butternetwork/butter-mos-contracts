let { create, readFromFile, writeToFile } = require("../../utils/create.js");
let { verify } = require("../utils/verify.js");
const { stringToHex, isRelayChain } = require("../../utils/helper");
const {getTronContract} = require("../../utils/create");

function getRole(role) {
    if (role.substr(0, 2) === "0x") {
        return role;
    }

    if (role == "root") {
        return 0;
    } if (role == "admin") {
        return 1;
    }
    else if (role == "manager") {
        return 2;
    } else if (role == "minter") {
        return 10;
    }
    throw "unknown role ..";
}

async function getBridge(network) {
    let deployment = await readFromFile(network);
    let addr = deployment[network]["bridgeProxy"];
    if (!addr) {
        throw "bridge not deployed.";
    }

    let bridge;
    if (network === "Tron" || network === "TronTest") {
        bridge = await getTronContract("Bridge", hre.artifacts, hre.network.name, addr);
    } else {
        let contract = isRelayChain(network) ? "BridgeAndRelay" : "Bridge";
        bridge = await ethers.getContractAt(contract, addr);
    }

    return bridge;
}

async function getAuth(network) {
    let deployment = await readFromFile(hre.network.name);
    if (!deployment[network]["authority"]) {
        throw "authority not deployed";
    }
    let Authority = await ethers.getContractFactory("AuthorityManager");
    let authority = Authority.attach(deployment[hre.network.name]["authority"]);

    return authority;
}

task("auth:deploy", "mos relay deploy")
    .addOptionalParam("admin", "default admin address", "", types.string)
    .setAction(async (taskArgs, hre) => {
        const accounts = await ethers.getSigners();
        const deployer = accounts[0];
        const chainId = await hre.network.config.chainId;
        console.log("deployer address:", deployer.address);

        let admin = taskArgs.admin;
        if (admin === "") {
            admin = deployer.address;
        }

        let Authority = await ethers.getContractFactory("AuthorityManager");
        let salt = process.env.AUTH_SALT;

        let authority = await create(hre, deployer, "AuthorityManager", ["address"], [admin], salt);

        console.log(`Deploy authority address ${authority} successful`);
        let deployment = await readFromFile(hre.network.name);
        deployment[hre.network.name]["authority"] = authority;
        await writeToFile(deployment);

        await verify(authority, [admin], "contracts/AuthorityManager.sol:AuthorityManager", chainId, true);
    });

task("auth:closeTarget", "add control")
    .addOptionalParam("target", "call target address", "mos", types.string)
    .addParam("close", "close target")
    .setAction(async (taskArgs, hre) => {
        const accounts = await ethers.getSigners();
        const deployer = accounts[0];
        console.log("deployer address:", deployer.address);

        let authority = await getAuth(hre.network.name);
        console.log("authority address", authority.address);

        let role = getRole(taskArgs.role);
        console.log("role:", role);

        let target = taskArgs.target;
        if (taskArgs.target === "mos") {
            let bridge = await getBridge(hre.network.name);
            console.log("mos address:", bridge.address);
            target = bridge.address;
        }

        console.log("target:", target);

        await (await authority.setTargetClosed(target, taskArgs.close)).wait();

        console.log(`add target address ${taskArgs.target} close ${taskArgs.close} successfully`);
    });

task("auth:setTarget", "add control")
    .addOptionalParam("target", "call target address", "mos", types.string)
    .addParam("funcs", "call function signature")
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
        let funSigs = [];
        // let funSig = taskArgs.func;
        if (taskArgs.target === "mos") {
            let bridge = await getBridge(hre.network.name);
            console.log("mos address:", bridge.address);
            target = bridge.address;
            funSigs.push(bridge.interface.getSighash(taskArgs.funcs));
        } else {
            funSigs = taskArgs.funcs.split(',');
        }

        console.log("target:", target);
        console.log("func sig:", funSigs);

        await (await authority.setTargetFunctionRole(target, funSigs, role)).wait();

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
    .addOptionalParam("delay", "delay time", 0, types.int)
    .setAction(async (taskArgs, hre) => {
        const accounts = await ethers.getSigners();
        const deployer = accounts[0];
        console.log("deployer address:", deployer.address);

        let authority = await getAuth(hre.network.name);
        console.log("authority address", authority.address);

        let role = getRole(taskArgs.role);
        console.log("role:", role);

        await (await authority.grantRole(role, taskArgs.account, taskArgs.delay)).wait();

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
        let Authority = await ethers.getContractFactory("AuthorityManager");
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
