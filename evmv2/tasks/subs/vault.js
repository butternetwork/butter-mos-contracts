const { getMos, getToken } = require("../../utils/helper");
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

task("vault:addManager", "Add vaultToken manager")
    .addParam("vault", "The vault token address")
    .addOptionalParam("manager", "the manager address, default is relay", "relay", types.string)
    .setAction(async (taskArgs, hre) => {
        const accounts = await ethers.getSigners();
        const deployer = accounts[0];
        const chainId = await deployer.getChainId();
        console.log("deployer address:", deployer.address);

        //let proxy = await hre.deployments.get("MAPVaultToken");
        let manager = taskArgs.manager;
        if (taskArgs.manager === "relay") {
            let proxy = await getMos(chainId, hre.network.name);
            if (proxy === undefined) {
                throw "mos not deployed ...";
            }
            manager = proxy.address;
        }

        let vaultToken = await ethers.getContractAt("VaultTokenV2", taskArgs.vault);

        await (await vaultToken.connect(deployer).addManager(manager)).wait();
        console.log(`MAPVaultToken ${taskArgs.vault} add manager ${manager} success`);
    });

task("vault:withdraw", "withdraw token")
    .addOptionalParam("token", "The token address", "0x0000000000000000000000000000000000000000", types.string)
    .addOptionalParam("address", "The receiver address", "", types.string)
    .addOptionalParam("value", "withdraw value, 0 for all", "0", types.string)
    .setAction(async (taskArgs, hre) => {
        const accounts = await ethers.getSigners();
        const deployer = accounts[0];
        console.log("deployer address:", deployer.address);

        let mos = await getMos(hre.network.config.chainId, hre.network.name);
        if (!mos) {
            throw "mos not deployed ...";
        }
        console.log("mos address:", mos.address);

        let address = taskArgs.address;
        if (taskArgs.address === "") {
            address = deployer.address;
        }

        let tokenAddr = await getToken(hre.network.config.chainId, taskArgs.token);
        if (taskArgs.token === "0x0000000000000000000000000000000000000000") {
            tokenAddr = await mos.wToken();
        }

        let managerAddress = await mos.tokenRegister();
        let manager = await ethers.getContractAt("TokenRegisterV2", managerAddress);

        let vaultAddress = await manager.getVaultToken(tokenAddr);

        let vaultToken = await ethers.getContractAt("VaultTokenV2", vaultAddress);
        let decimals = await vaultToken.decimals();
        let value;
        if (taskArgs.value === "0") {
            value = await vaultToken.balanceOf(address);
        } else {
            value = ethers.utils.parseUnits(taskArgs.value, decimals);
        }

        console.log(`token address: ${tokenAddr}`);
        console.log(`vault token address: ${vaultAddress}`);
        console.log(`vault token value: ${value}`);
        console.log(`receiver: ${address}`);

        await (await mos.connect(deployer).withdraw(vaultAddress, value)).wait();

        console.log(
            `withdraw token ${taskArgs.token} from vault ${vaultAddress} ${taskArgs.value} to  ${address} successful`
        );
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
