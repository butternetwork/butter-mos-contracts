const { getMos } = require("../../utils/helper");

task("vault:deploy", "Deploy the vault token")
    .addParam("token", "The token address on relay chain")
    .addParam("name", "The name of the vault token")
    .addParam("symbol", "The symbol of the vault token")
    .setAction(async (taskArgs, hre) => {
        const { deploy } = hre.deployments;
        const accounts = await ethers.getSigners();
        const deployer = accounts[0];

        console.log("deployer address:", deployer.address);

        await deploy("VaultTokenV2", {
            from: deployer.address,
            args: [taskArgs.token, taskArgs.name, taskArgs.symbol],
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

task("vault:deposit", "vaultDeposit")
    .addParam("fromchain", "fromchainId")
    .addParam("amount", "deposit amount")
    .setAction(async (taskArgs, hre) => {
        const accounts = await ethers.getSigners();
        const deployer = accounts[0];

        console.log("deployer address:", deployer.address);

        let vault = await hre.deployments.get("VaultTokenV2");

        console.log("vault address:", vault.address);

        let vaultContract = await ethers.getContractAt("VaultTokenV2", vault.address);

        await (
            await vaultContract.connect(deployer).deposit(taskArgs.fromchain, taskArgs.amount, deployer.address)
        ).wait();

        console.log(`deploy successful`);
    });

task("vault:withdraw", "withdraw token")
    .addParam("mos", "The mos address")
    .addOptionalParam("token", "The token address", "0x0000000000000000000000000000000000000000", types.string)
    .addOptionalParam("address", "The receiver address", "", types.string)
    .addParam("value", "withdraw value")
    .setAction(async (taskArgs, hre) => {
        const accounts = await ethers.getSigners();
        const deployer = accounts[0];

        console.log("deployer address:", deployer.address);

        let mos = await ethers.getContractAt("MAPOmnichainServiceRelayV2", taskArgs.mos);

        let address = taskArgs.address;
        if (taskArgs.address === "") {
            address = deployer.address;
        }

        let token = taskArgs.token;
        if (taskArgs.token === "0x0000000000000000000000000000000000000000") {
            token = await mos.wToken();
        }
        let managerAddress = await mos.tokenRegister();
        let manager = await ethers.getContractAt("TokenRegisterV2", managerAddress);

        let vaultAddress = await manager.getVaultToken(token);

        console.log(`token address: ${token}, vault token address: ${vaultAddress}`);

        let vaultToken = await ethers.getContractAt("IERC20", vaultAddress);

        await (await mos.connect(deployer).withdraw(vaultAddress, taskArgs.value)).wait();

        console.log(`withdraw token ${token} from vault ${vaultAddress} ${taskArgs.value} to  ${address} successful`);
    });
