// const { types } = require("zksync-web3");
let { getTronContract, tronFromHex, tronToHex } = require("../../utils/create.js");
let { stringToHex, getRole, isRelayChain, isTron } = require("../../utils/helper");

let { getChain, getToken, getDeployment } = require("../utils/utils");

async function getBridge(network, abstract) {
  let addr = await getDeployment(network, "bridgeProxy");

  let bridge;
  if (network === "Tron" || network === "TronTest") {
    bridge = await getTronContract("Bridge", hre.artifacts, hre.network.name, addr);
  } else {
    let contract = isRelayChain(network) ? "BridgeAndRelay" : "Bridge";
    bridge = await ethers.getContractAt(contract, addr);
  }

  console.log("bridge address:", bridge.address);

  return bridge;
}

async function getAddress(network, auth) {
  let addr;
  if (auth === "bridge" || auth === "mos" || auth === "relay") {
    addr = await getDeployment(network, "bridgeProxy");
    return addr;
  }
  addr = await getToken(network, auth);
  return addr;
}

let IMintToken_abi = [
  "function setMinterCap(address minter, uint256 cap) external",
  "function getMinterCap(address minter) external view returns (uint256)",
  "function decimals() public view returns (uint8)",
  "function minterCap(address minter) public view returns (uint256 cap,uint256 total)",
];

task("misc:getCap", "grant role")
  .addParam("account", "account address")
  .addOptionalParam("addr", "The auth addr", "", types.string)
  .setAction(async (taskArgs, hre) => {
    let addr = await getAddress(hre.network.name, taskArgs.addr);
    console.log("addr: ", addr);

    let token = await ethers.getContractAt(IMintToken_abi, addr);

    let account = await getAddress(hre.network.name, taskArgs.account);

    console.log("token:", token.address);
    console.log("minter:", account);

    console.log("before cap: ", await token.getMinterCap(account));

    let info = await token.minterCap(account);
    console.log(`cap: ${info.cap}, total: ${info.total}`);
  });

task("misc:setCap", "grant role")
  .addParam("account", "account address")
  .addOptionalParam("addr", "The auth addr", "", types.string)
  .addParam("cap", "cap")
  .setAction(async (taskArgs, hre) => {
    let addr = await getAddress(hre.network.name, taskArgs.addr);
    console.log("addr: ", addr);

    let token = await ethers.getContractAt(IMintToken_abi, addr);

    let account = await getAddress(hre.network.name, taskArgs.account);

    let decimals = await token.decimals();
    console.log("token:", token.address);
    console.log("minter:", account);

    //console.log("before cap: ", await token.getMinterCap(account));
    console.log("before: ", await token.minterCap(account));

    let cap = ethers.utils.parseUnits(taskArgs.cap, decimals);
    await (await token.setMinterCap(account, cap)).wait();

    let info = await token.minterCap(account);
    console.log(`cap: ${info.cap}, total: ${info.total}`);
  });

task("misc:grant", "grantRole")
  .addParam("account", "account to grantRole")
  .addParam("role", "role, admin/minter/manager")
  .addOptionalParam("addr", "The auth addr", "", types.string)
  .setAction(async (taskArgs, hre) => {
    const accounts = await ethers.getSigners();
    const deployer = accounts[0];
    console.log("deployer address:", deployer.address);

    let addr = await getAddress(hre.network.name, taskArgs.addr);

    let access = await ethers.getContractAt("AccessControlEnumerable", addr);
    console.log("auth address", access.address);

    let role = getRole(taskArgs.role);
    console.log("role:", role);

    let account = await getAddress(hre.network.name, taskArgs.account);

    await (await access.grantRole(role, account)).wait();

    console.log(`grant role ${taskArgs.role} to ${account} successfully`);
  });

task("misc:revoke", "revokeRole")
  .addParam("account", "account to revokeRole")
  .addParam("role", "control role")
  .addOptionalParam("addr", "The auth addr", "", types.string)
  .setAction(async (taskArgs, hre) => {
    const accounts = await ethers.getSigners();
    const deployer = accounts[0];
    console.log("deployer address:", deployer.address);

    let addr = await getAddress(hre.network.name, taskArgs.addr);

    let access = await ethers.getContractAt("AccessControlEnumerable", addr);
    console.log("authority address", access.address);

    let role = getRole(taskArgs.role);
    console.log("role:", role);

    let account = await getAddress(hre.network.name, taskArgs.account);

    await (await access.revokeRole(role, account)).wait();

    console.log(`revoke ${taskArgs.account} role ${role} successfully`);
  });

task("misc:getMember", "get role member")
  .addOptionalParam("addr", "The auth addr", "", types.string)
  .addOptionalParam("role", "The role", "admin", types.string)
  .setAction(async (taskArgs, hre) => {
    const accounts = await ethers.getSigners();
    const deployer = accounts[0];
    console.log("deployer address:", deployer.address);

    let addr = await getAddress(hre.network.name, taskArgs.addr);

    let access = await ethers.getContractAt("AccessControlEnumerable", addr);

    console.log("authority address", access.address);

    let role = getRole(taskArgs.role);
    console.log("role:", role);

    let count = await access.getRoleMemberCount(role);
    console.log(`role ${taskArgs.role} has ${count} member(s)`);

    for (let i = 0; i < count; i++) {
      let member = await access.getRoleMember(role, i);
      console.log(`    ${i}: ${member}`);
    }
  });
