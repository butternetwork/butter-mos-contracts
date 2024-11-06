let { create, getTronContract } = require("../../utils/create.js");
let { isRelayChain, isTron } = require("../../utils/helper");
let { verify } = require("../../utils/verify.js");

let { getDeployment, saveDeployment } = require("../utils/utils");

function getRole(role) {
  if (role === "root") {
    return 0;
  } else if (role === "admin") {
    return 1;
  } else if (role === "manager") {
    return 2;
  } else if (role === "minter") {
    return 10;
  }
  throw "unknown role ..";
}

async function getBridge(network) {
  let addr = await getDeployment(network, "bridgeProxy");
  let bridge;
  if (network === "Tron" || network === "TronTest") {
    bridge = await getTronContract("Bridge", hre.artifacts, hre.network.name, addr);
  } else {
    let contract = isRelayChain(network) ? "BridgeAndRelay" : "Bridge";
    bridge = await ethers.getContractAt(contract, addr);
  }

  return bridge;
}

async function getAuth(hre, contractAddress) {
  let addr = contractAddress;
  if (contractAddress === "" || contractAddress === "latest") {
    addr = await getDeployment(hre.network.name, "authority");
  }

  let authority;
  if (isTron(hre.network.config.chainId)) {
    authority = await getTronContract("AuthorityManager", hre.artifacts, hre.network.name, addr);
  } else {
    authority = await ethers.getContractAt("AuthorityManager", addr);
  }

  console.log("authority address:", authority.address);
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

    //let Authority = await ethers.getContractFactory("AuthorityManager");
    let salt = process.env.AUTH_SALT;

    let authority = await create(hre, deployer, "AuthorityManager", ["address"], [admin], salt);

    // console.log(`Deploy authority address ${authority} successful`);

    await saveDeployment(hre.network.name, "authority", authority);

    await verify(authority, [admin], "contracts/AuthorityManager.sol:AuthorityManager", chainId, true);
  });

task("auth:closeTarget", "add control")
  .addOptionalParam("target", "call target address", "mos", types.string)
  .addParam("close", "close target")
  .addOptionalParam("auth", "The auth addr", "", types.string)
  .setAction(async (taskArgs, hre) => {
    const accounts = await ethers.getSigners();
    const deployer = accounts[0];
    console.log("deployer address:", deployer.address);

    let authority = await getAuth(hre, taskArgs.auth);

    let role = getRole(taskArgs.role);
    console.log("role:", role);

    let target = taskArgs.target;
    if (taskArgs.target === "mos") {
      let bridge = await getBridge(hre.network.name);
      console.log("mos address:", bridge.address);
      target = bridge.address;
    }

    console.log("target:", target);

    if (isTron(hre.network.name)) {
      await authority.setTargetClosed(target, taskArgs.close).send();
    } else {
      await (await authority.setTargetClosed(target, taskArgs.close)).wait();
    }

    console.log(`add target address ${taskArgs.target} close ${taskArgs.close} successfully`);
  });

task("auth:setTarget", "add control")
  .addOptionalParam("target", "call target address", "mos", types.string)
  .addParam("funcs", "call function signature")
  .addParam("role", "control role")
  .addOptionalParam("auth", "The auth addr", "", types.string)
  .setAction(async (taskArgs, hre) => {
    const accounts = await ethers.getSigners();
    const deployer = accounts[0];
    console.log("deployer address:", deployer.address);

    let authority = await getAuth(hre, taskArgs.auth);

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
      funSigs = taskArgs.funcs.split(",");
    }

    console.log("target:", target);
    console.log("func sig:", funSigs);

    await (await authority.setTargetFunctionRole(target, funSigs, role)).wait();

    console.log(
      `add target address ${taskArgs.target} function ${taskArgs.func} controlled by role ${taskArgs.role} successfully`,
    );
  });

task("auth:getRole", "get target role")
  .addParam("target", "target address")
  .addParam("funsig", "fun sig")
  .addOptionalParam("auth", "The auth addr", "", types.string)
  .setAction(async (taskArgs, hre) => {
    const accounts = await ethers.getSigners();
    const deployer = accounts[0];
    console.log("deployer address:", deployer.address);

    let authority = await getAuth(hre, taskArgs.auth);

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
  .addOptionalParam("auth", "The auth addr", "", types.string)
  .setAction(async (taskArgs, hre) => {
    const accounts = await ethers.getSigners();
    const deployer = accounts[0];
    console.log("deployer address:", deployer.address);

    let authority = await getAuth(hre, taskArgs.auth);
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

task("auth:grant", "grantRole")
  .addParam("account", "account to grantRole")
  .addParam("role", "control role, admin/minter/manager")
  .addOptionalParam("delay", "delay time", 0, types.int)
  .addOptionalParam("auth", "The auth addr", "", types.string)
  .setAction(async (taskArgs, hre) => {
    const accounts = await ethers.getSigners();
    const deployer = accounts[0];
    console.log("deployer address:", deployer.address);

    let authority = await getAuth(hre, taskArgs.auth);

    let role = getRole(taskArgs.role);
    console.log("role:", role);

    if (isTron(hre.network.name)) {
      await authority.grantRole(role, taskArgs.account, taskArgs.delay).send();
    } else {
      await (await authority.grantRole(role, taskArgs.account, taskArgs.delay)).wait();
    }

    console.log(`grant role ${taskArgs.role} to ${taskArgs.account} successfully`);
  });

task("auth:revoke", "revokeRole")
  .addParam("account", "account to revokeRole")
  .addParam("role", "control role")
  .addOptionalParam("auth", "The auth addr", "", types.string)
  .setAction(async (taskArgs, hre) => {
    const accounts = await ethers.getSigners();
    const deployer = accounts[0];
    console.log("deployer address:", deployer.address);

    let authority = await getAuth(hre, taskArgs.auth);

    let role = getRole(taskArgs.role);
    console.log("role:", role);

    if (isTron(hre.network.name)) {
      await authority.revokeRole(role, taskArgs.account).send();
    } else {
      await (await authority.revokeRole(role, taskArgs.account)).wait();
    }

    console.log(`revoke ${taskArgs.account} role ${taskArgs.role} successfully`);
  });

task("auth:setAuth", "set target new authority")
  .addParam("target", "target address")
  .addParam("addr", "new authority address")
  .addOptionalParam("auth", "The auth addr", "", types.string)
  .setAction(async (taskArgs, hre) => {
    const accounts = await ethers.getSigners();
    const deployer = accounts[0];
    console.log("deployer address:", deployer.address);

    let authority = await getAuth(hre, taskArgs.auth);

    let target = await ethers.getContractAt("IAccessManaged", taskArgs.target);

    if (isTron(hre.network.name)) {
      console.log("pre authority: ", await target.authority().call());
      await authority.updateAuthority(taskArgs.target, taskArgs.addr).sned();
      console.log("after authority: ", await target.authority().call());
    } else {
      console.log("pre authority: ", await target.authority());
      await (await authority.updateAuthority(taskArgs.target, taskArgs.addr)).wait();
      console.log("after authority: ", await target.authority());
    }

    console.log(`set target ${taskArgs.target} new authority manager ${taskArgs.addr} successfully`);
  });

task("auth:getMember", "get role member")
  .addOptionalParam("role", "The role", "admin", types.string)
  .addOptionalParam("auth", "The auth addr", "", types.string)
  .setAction(async (taskArgs, hre) => {
    const accounts = await ethers.getSigners();
    const deployer = accounts[0];
    console.log("deployer address:", deployer.address);

    let authority = await getAuth(hre, taskArgs.auth);
    let role = getRole(taskArgs.role);
    console.log("role:", role);

    if (isTron(hre.network.name)) {
      let count = await authority.getRoleMemberCount(role).call();
      console.log(`role ${taskArgs.role} has ${count} member(s)`);

      for (let i = 0; i < count; i++) {
        let member = await authority.getRoleMember(role, i).call();
        console.log(`    ${i}: ${member}`);
      }
    } else {
      let count = await authority.getRoleMemberCount(role);
      console.log(`role ${taskArgs.role} has ${count} member(s)`);

      for (let i = 0; i < count; i++) {
        let member = await authority.getRoleMember(role, i);
        console.log(`    ${i}: ${member}`);
      }
    }
  });
