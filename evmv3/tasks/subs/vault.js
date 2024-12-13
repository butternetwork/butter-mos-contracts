let { create } = require("../../utils/create.js");
let { getRole } = require("../../utils/helper");

let { getToken, saveDeployment, getDeployment } = require("../utils/utils");

async function getVault(network, vault, token, v2) {
  let vaultAddr = vault;
  if (vaultAddr === "") {
    if (v2) {
      vaultAddr = await getDeployment(network, "vaultV2", token);
    } else {
      vaultAddr = await getDeployment(network, "vault", token);
    }
  }
  let vaultToken = await ethers.getContractAt("VaultTokenV3", vaultAddr);

  return vaultToken;
}

task("vault:deploy", "Deploy the vault token")
  .addParam("token", "The token address on relay chain")
  .addParam("name", "The name of the vault token")
  .addParam("symbol", "The symbol of the vault token")
  .addParam("v2", "bridge version: v2/v3, true is v2", false, types.boolean)
  .addOptionalParam("relay", "relay address", "", types.string)
  .setAction(async (taskArgs, hre) => {
    const { deploy } = hre.deployments;
    const accounts = await ethers.getSigners();
    const deployer = accounts[0];

    console.log("deployer address:", deployer.address);

    let tokenAddr = await getToken(hre.network.config.chainId, taskArgs.token);
    console.log("token address:", tokenAddr);

    let vaultAddr = await create(
      hre,
      deployer,
      "VaultTokenV3",
      ["address", "string", "string"],
      [tokenAddr, taskArgs.name, taskArgs.symbol],
      "",
    );

    console.log("vault addr", vaultAddr);
    if (taskArgs.v2) {
      await saveDeployment(hre.network.name, "vaultV2", vaultAddr, taskArgs.token);
    } else {
      await saveDeployment(hre.network.name, "vault", vaultAddr, taskArgs.token);
    }

    // grant
    let relayAddr = taskArgs.relay;
    if (relayAddr === "") {
      relayAddr = await getDeployment(hre.network.name, "bridgeProxy");
    }
    console.log(relayAddr);

    await hre.run("vault:grantRole", { vault: vaultAddr, role: "manager", account: relayAddr });

    console.log(`VaultToken ${taskArgs.symbol} address: ${vaultAddr}`);
  });

task("vault:grantRole", "grant Role")
  .addOptionalParam("token", "token name", "", types.string)
  .addOptionalParam("vault", "vault address", "", types.string)
  .addParam("v2", "bridge version: v2/v3, true is v2", false, types.boolean)
  .addParam("role", "role address")
  .addParam("account", "account address")
  .addOptionalParam("grant", "grant or revoke", true, types.boolean)
  .setAction(async (taskArgs, hre) => {
    let vaultToken = await getVault(hre.network.name, taskArgs.vault, taskArgs.token, taskArgs.v2);

    let role = await getRole(taskArgs.role);

    /*
    if (taskArgs.role === "manage" || taskArgs.role === "manager") {
      role = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("MANAGER_ROLE"));
    } else {
      role = ethers.constants.HashZero;
    }*/

    if (taskArgs.grant) {
      await vaultToken.grantRole(role, taskArgs.account);
      console.log(`grant ${taskArgs.account} role ${role}`);
    } else {
      await vaultToken.revokeRole(role, taskArgs.account);
      console.log(`revoke ${taskArgs.account} role ${role}`);
    }
  });

task("vault:update", "update vault status")
  .addOptionalParam("token", "token name", "", types.string)
  .addOptionalParam("vault", "vault address", "", types.string)
  .addParam("v2", "bridge version: v2/v3, true is v2", false, types.boolean)
  .addParam("from", "the manager address, default is relay")
  .addParam("to", "the manager address, default is relay")
  .addParam("fromamount", "the manager address, default is relay")
  .addParam("toamount", "the manager address, default is relay")
  .addParam("fee", "the vault fee")
  .setAction(async (taskArgs, hre) => {
    const accounts = await ethers.getSigners();
    const deployer = accounts[0];
    console.log("deployer address:", deployer.address);

    let vaultToken = await getVault(hre.network.name, taskArgs.vault, taskArgs.token, taskArgs.v2);

    console.log("vault address:", vaultToken.address);
    console.log("from chain:", taskArgs.from);
    console.log("to chain:", taskArgs.to);
    console.log("from amount:", taskArgs.fromamount);
    console.log("to amount:", taskArgs.toamount);

    await (
      await vaultToken.updateVault(
        taskArgs.from,
        taskArgs.fromamount,
        taskArgs.to,
        taskArgs.toamount,
        hre.network.config.chainId,
        taskArgs.fee,
      )
    ).wait();
    console.log(`MAPVaultToken ${vaultToken.address} set amount success`);
  });
