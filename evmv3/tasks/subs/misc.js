// const { types } = require("zksync-web3");
let {getTronContract, fromHex, toHex } = require("../../utils/create.js");
let {stringToHex, getRole } = require("../../utils/helper");
let { verify } = require("../../utils/verify.js");

let { getChain, getToken, getFeeList, getChainList,  readFromFile, writeToFile,  } = require("../utils/utils");

let outputAddr = true;

async function getBridge(network, abstract) {
  let deployment = await readFromFile(network);
  let addr = deployment[network]["bridgeProxy"];
  if (!addr) {
    throw "bridge not deployed.";
  }

  let bridge;
  if (network === "Tron" || network === "TronTest") {
    bridge = await getTronContract("Bridge", hre.artifacts, hre.network.name, addr);
  } else {
    let contract = abstract ? "BridgeAbstract" : "Bridge";
    bridge = await ethers.getContractAt(contract, addr);
  }

  if (outputAddr) {
    console.log("bridge address:", bridge.address);
  }
  return bridge;
}


task("misc:setMinterCap", "grant role")
    .addParam("role", "role address")
    .addParam("account", "account address")
    .setAction(async (taskArgs, hre) => {
        console.log("");
    });


task("misc:grant", "grantRole")
    .addParam("account", "account to grantRole")
    .addParam("role", "role, admin/minter/manager")
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

task("misc:revoke", "revokeRole")
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

task("misc:getMember", "get role member")
    .addOptionalParam("addr", "The auth addr", "", types.string)
    .addOptionalParam("role", "The role", "admin", types.string)
    .setAction(async (taskArgs, hre) => {
        const accounts = await ethers.getSigners();
        const deployer = accounts[0];
        console.log("deployer address:", deployer.address);

        let access = await ethers.getContractAt("AccessControlEnumerable", taskArgs.addr);
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

task("misc:transferOut", "Cross-chain transfer token")
  .addOptionalParam("initiator", "The initiator", "", types.string)
  .addOptionalParam("token", "The token address", "0x0000000000000000000000000000000000000000", types.string)
  .addOptionalParam("receiver", "The receiver address", "", types.string)
  .addOptionalParam("chain", "The receiver chain", "22776", types.string)
  .addParam("value", "transfer out value")
  .addOptionalParam("gas", "The gas limit", 0, types.int)
  .setAction(async (taskArgs, hre) => {
    const accounts = await ethers.getSigners();
    const deployer = accounts[0];

    console.log("transfer address:", deployer.address);

    let target = await getChain(taskArgs.chain);
    let targetChainId = target.chainId;
    console.log("target chain:", targetChainId);

    let initiator = taskArgs.initiator;
    if (initiator === "") {
      initiator = deployer.address;
    }

    let receiver = taskArgs.receiver;
    if (taskArgs.receiver === "") {
      receiver = deployer.address;
    } else {
      if (taskArgs.receiver.substr(0, 2) != "0x") {
        receiver = "0x" + stringToHex(taskArgs.receiver);
      }
    }
    console.log("token receiver:", receiver);

    let tokenAddr = await getToken(hre.network.config.chainId, taskArgs.token);
    console.log(`token [${taskArgs.token}] address: ${tokenAddr}`);

    if (hre.network.name === "Tron" || hre.network.name === "TronTest") {
    }

    let bridge = await getBridge(hre.network.name, true);

    let value;
    //let fee = await bridge.getNativeFee(tokenAddr, 0, targetChainId);

    let fee = value = ethers.utils.parseUnits("0", 18);

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
    console.log(`transfer [${taskArgs.token}] with value [${fee}] ...`);
    let rst;
    if (taskArgs.gas === 0) {
      rst = await (
        await bridge.swapOutToken(initiator, tokenAddr, receiver, value, targetChainId, "0x", {
          value: fee,
        })
      ).wait();
    } else {
      rst = await bridge.swapOutToken(initiator, tokenAddr, receiver, value, targetChainId, "0x", {
        value: fee,
        gasLimit: taskArgs.gas,
      });
    }
    // console.log(rst);

    console.log(`transfer token ${taskArgs.token} ${taskArgs.value} to ${receiver} successful`);
  });
