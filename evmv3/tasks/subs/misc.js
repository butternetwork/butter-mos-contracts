// const { types } = require("zksync-web3");
let { getTronContract, tronFromHex, tronToHex } = require("../../utils/create.js");
let { stringToHex, getRole, isRelayChain, isTron } = require("../../utils/helper");

let { getChain, getToken, getDeployment } = require("../utils/utils");

async function getBridge(network) {
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
    console.log("AccessControl address", access.address);

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
    console.log("AccessControl address", access.address);

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

task("misc:deposit", "Cross-chain deposit token")
  .addOptionalParam("token", "The token address", "0x0000000000000000000000000000000000000000", types.string)
  .addOptionalParam("receiver", "The receiver address", "", types.string)
  .addParam("value", "deposit value")
  .setAction(async (taskArgs, hre) => {
    const accounts = await ethers.getSigners();
    const deployer = accounts[0];

    console.log("deposit address:", deployer.address);

    let bridge = await getBridge(hre.network.name);

    let receiver = taskArgs.receiver;
    if (taskArgs.receiver === "") {
      receiver = deployer.address;
    }

    let tokenAddr = await getToken(hre.network.name, taskArgs.token);

    let value;
    let fee = (value = ethers.utils.parseUnits("0", 18));
    if (tokenAddr === "0x0000000000000000000000000000000000000000") {
      value = ethers.utils.parseUnits(taskArgs.value, 18);
      fee = fee.add(value);
    } else {
      let token = await ethers.getContractAt("IERC20Metadata", tokenAddr);
      let decimals = await token.decimals();
      value = ethers.utils.parseUnits(taskArgs.value, decimals);

      let approved = await token.allowance(deployer.address, bridge.address);
      console.log("approved ", approved);
      if (approved.lt(value)) {
        console.log(`${tokenAddr} approve ${bridge.address} value [${value}] ...`);
        await (await token.approve(bridge.address, value)).wait();
      }
    }

    let rst = await (await bridge.depositToken(tokenAddr, receiver, value, { value: fee })).wait();

    console.log(`deposit token ${taskArgs.token} ${taskArgs.value} to ${receiver} successful`);
  });

task("misc:withdraw", "withdraw token")
  .addOptionalParam("token", "The token address", "native", types.string)
  .addOptionalParam("receiver", "The receiver address", "", types.string)
  .addOptionalParam("value", "withdraw value, 0 for all", "0", types.string)
  .setAction(async (taskArgs, hre) => {
    const accounts = await ethers.getSigners();
    const deployer = accounts[0];
    console.log("deployer address:", deployer.address);

    let bridge = await getBridge(hre.network.name);

    let receiver = taskArgs.receiver;
    if (taskArgs.receiver === "") {
      receiver = deployer.address;
    }

    let tokenAddr = await getToken(hre.network.config.chainId, taskArgs.token);

    let managerAddress = await bridge.tokenRegister();
    let manager = await ethers.getContractAt("TokenRegisterV3", managerAddress);

    let vaultAddress = await manager.getVaultToken(tokenAddr);

    let vaultToken = await ethers.getContractAt("VaultTokenV3", vaultAddress);
    let decimals = await vaultToken.decimals();
    let value;
    if (taskArgs.value === "0") {
      value = await vaultToken.balanceOf(deployer.address);
    } else {
      value = ethers.utils.parseUnits(taskArgs.value, decimals);
    }

    console.log(`token address: ${tokenAddr}`);
    console.log(`vault token address: ${vaultAddress}`);
    console.log(`vault token value: ${value}`);
    console.log(`receiver: ${receiver}`);

    await (await bridge.withdraw(vaultAddress, value)).wait();

    console.log(`withdraw token ${taskArgs.token} from vault ${vaultAddress} ${value} successful`);
  });
