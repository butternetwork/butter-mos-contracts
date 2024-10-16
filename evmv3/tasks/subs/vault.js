let { create, readFromFile, writeToFile } = require("../../utils/create.js");
let { getChain, getToken } = require("../../utils/helper");

task("vault:deploy", "Deploy the vault token")
  .addParam("token", "The token address on relay chain")
  .addParam("name", "The name of the vault token")
  .addParam("symbol", "The symbol of the vault token")
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
    let deployment = await readFromFile(hre.network.name);
    if (!deployment[hre.network.name]["vault"]) {
      deployment[hre.network.name]["vault"] = {};
    }
    deployment[hre.network.name]["vault"][taskArgs.token] = vaultAddr;
    await writeToFile(deployment);

    // grant
    let relayAddr = taskArgs.relay;
    if (relayAddr === "") {
      relayAddr = deployment[hre.network.name]["bridgeProxy"];
      if (!relayAddr) {
        throw "relay not deployed.";
      }
    }

    await hre.run("vault:grantRole", { vault: vaultAddr, role: "manager", account: relayAddr });

    console.log(`VaultToken ${taskArgs.symbol} address: ${vaultAddr}`);
  });

task("vault:grantRole", "grant Role")
  .addParam("vault", "vault address")
  .addParam("role", "role address")
  .addParam("account", "account address")
  .addOptionalParam("grant", "grant or revoke", true, types.boolean)
  .setAction(async (taskArgs, hre) => {
    let vault = await ethers.getContractAt("VaultTokenV3", taskArgs.vault);
    let role;
    if (taskArgs.role === "manage" || taskArgs.role === "manager") {
      role = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("MANAGER_ROLE"));
    } else {
      role = ethers.constants.HashZero;
    }

    if (taskArgs.grant) {
      await vault.grantRole(role, taskArgs.account);
      console.log(`grant ${taskArgs.account} role ${role}`);
    } else {
      await vault.revokeRole(role, taskArgs.account);
      console.log(`revoke ${taskArgs.account} role ${role}`);
    }
  });

task("vault:transfer", "Add vaultToken manager")
  .addParam("vault", "The vault token address")
  .addParam("from", "the manager address, default is relay")
  .addParam("to", "the manager address, default is relay")
  .addParam("fromamount", "the manager address, default is relay")
  .addParam("toamount", "the manager address, default is relay")
  .addParam("fee", "the manager address, default is relay")
  .setAction(async (taskArgs, hre) => {
    const accounts = await ethers.getSigners();
    const deployer = accounts[0];
    console.log("deployer address:", deployer.address);

    let vaultToken = await ethers.getContractAt("VaultTokenV2", taskArgs.vault);
    console.log("vault address:", vaultToken.address);
    console.log("from chain:", taskArgs.from);
    console.log("to chain:", taskArgs.to);
    console.log("from amount:", taskArgs.fromamount);
    console.log("to amount:", taskArgs.toamount);

    await (
      await vaultToken
        .connect(deployer)
        .transferToken(taskArgs.from, taskArgs.fromamount, taskArgs.to, taskArgs.toamount, 22776, taskArgs.fee)
    ).wait();
    console.log(`MAPVaultToken ${taskArgs.vault} set amount success`);
  });
