const { task } = require("hardhat/config");

task("vault:deploy", "Deploy the vault token")
    .addParam("token", "The token address on relay chain")
    .addParam("name", "The name of the vault token")
    .addParam("symbol", "The symbol of the vault token")
    .setAction(async (taskArgs, hre) => {
        const { deploy } = hre.deployments;
        const accounts = await ethers.getSigners();
        const deployer = accounts[0];

        console.log("deployer address:", deployer.address);

        let tokenAddr = await getToken(hre.network.config.chainId, taskArgs.token);
        console.log("token address:", tokenAddr);

        await deploy("VaultTokenV2", {
            from: deployer.address,
            args: [tokenAddr, taskArgs.name, taskArgs.symbol],
            log: true,
            contract: "VaultTokenV2",
        });

        let vault = await ethers.getContract("VaultTokenV2");

        console.log(`VaultTokenV2 ${taskArgs.symbol} address: ${vault.address}`);
    });

task("vault:grantRole", "grant Role")
    .addParam("vault", "vault address")
    .addParam("role", "role address")
    .addParam("account", "account address")
    .setAction(async (taskArgs, hre) => {
        let VaultTokenV2 = await ethers.getContractFactory("VaultTokenV2");
        let vault = VaultTokenV2.attach(taskArgs.vault);
        let role;
        if (taskArgs.role === "manage") {
            role = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("MANAGER_ROLE"));
        } else {
            role = ethers.constants.HashZero;
        }
        await (await vault.grantRole(role, taskArgs.account)).wait();
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
