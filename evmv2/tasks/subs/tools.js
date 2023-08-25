



task("tool:tokenDeploy","Deploy a token with role control")
    .addParam("name", "token name")
    .addParam("symbol", "token symbol")
    .addOptionalParam("decimals", "default 18", 18, types.int)
    .addOptionalParam("balance", "init balance, default 0", 0, types.int)
    .setAction(async (taskArgs,hre) => {
        const {deploy} = hre.deployments
        const accounts = await ethers.getSigners()
        const deployer = accounts[0];

        console.log("deployer address:",deployer.address);

        await deploy('MintableToken', {
            from: deployer.address,
            args: [taskArgs.name, taskArgs.symbol, taskArgs.decimals],
            log: true,
            contract: 'MintableToken',
        })

        let token = await ethers.getContract('MintableToken');

        console.log(`Deply token '${taskArgs.symbol}' address:`, token.address);

        if (taskArgs.balance > 0) {
            balance = ethers.BigNumber.from(taskArgs.balance).mul(ethers.BigNumber.from("1000000000000000000"))

            await token.mint(deployer.address, balance.toString())

            console.log(`Mint '${taskArgs.name}' Token ${taskArgs.balance} ${taskArgs.symbol}`);
        }
    });


task("tool:tokenGrant","Grant a mintable token mint role")
    .addParam("token", "token address")
    .addOptionalParam("minter", "minter address, default mos", "mos", types.string)
    .setAction(async (taskArgs,hre) => {
        const {deploy} = hre.deployments
        const accounts = await ethers.getSigners()
        const deployer = accounts[0];
    
        let chainId = hre.network.config.chainId;
    
        console.log("deployer address:",deployer.address);
    
        let token = await ethers.getContractAt('MintableToken', taskArgs.token);
    
        console.log("Mintable Token address:",token.address);
    
        let minter = taskArgs.minter;
        if (taskArgs.minter === "mos") {
            let proxy = await getMos(chainId, hre.network.name)
            if(proxy === undefined) {
                throw "mos not deployed ..."
            }
            minter = proxy.address;
        }
        await (await token.connect(deployer).grantRole('0x9f2df0fed2c77648de5860a4cc508cd0818c85b8b8a1ab4ceeef8d981c8956a6', minter))
    
        console.log("Grant token ", token.address, " to address", minter)
    });

task("tool:tokenMint","mint token")
    .addParam("token", "token address")
    .addParam("amount", "mint amount")
    .setAction(async (taskArgs,hre) => {
        const {deploy} = hre.deployments
        const accounts = await ethers.getSigners()
        const deployer = accounts[0];
    
        console.log("deployer address:",deployer.address);
    
        let token = await ethers.getContractAt('MintableToken', taskArgs.token);
    
        console.log("Mintable Token address:",token.address);
    
        await token.mint(deployer.address, taskArgs.amount)
    
        console.log(`Mint '${taskArgs.token}' Token ${taskArgs.amount} `);
    });

task("tool:vaultDeposit","vaultDeposit")
  .addParam("fromchain", "fromchainId")
  .addParam("amount", "deposit amount")
  .setAction(async(taskArgs,hre) => {
        const accounts = await ethers.getSigners()
        const deployer = accounts[0];

        console.log("deployer address:",deployer.address);

        let vault = await hre.deployments.get("VaultTokenV2")

        console.log("vault address:", vault.address);

        let vaultContract = await ethers.getContractAt('VaultTokenV2',vault.address);

        await (await vaultContract.connect(deployer).deposit(taskArgs.fromchain, taskArgs.amount, deployer.address)).wait();

        console.log(`deploy successful`);
  })


task("tool:depositOutToken","Cross-chain deposit token")
    .addParam("mos", "The mos address")
    .addOptionalParam("token", "The token address","0x0000000000000000000000000000000000000000",types.string)
    .addOptionalParam("address", "The receiver address","",types.string)
    .addParam("value", "deposit value, unit WEI")
    .setAction(async(taskArgs,hre) => {
        const accounts = await ethers.getSigners()
        const deployer = accounts[0];
    
        console.log("deposit address:",deployer.address);
    
        let mos = await ethers.getContractAt('IButterMosV2', taskArgs.mos);
    
        let address = taskArgs.address;
        if (taskArgs.address === "") {
            address = deployer.address;
        }
    
        if (taskArgs.token === "0x0000000000000000000000000000000000000000") {
    
            await (await mos.connect(deployer).depositNative(
                address,
                {value:taskArgs.value}
            )).wait();
    
        }else {
            let token = await ethers.getContractAt("IERC20", taskArgs.token);
            await (await token.connect(deployer).approve(
                taskArgs.mos,
                taskArgs.value
            )).wait();
    
            await (await mos.connect(deployer).depositToken(
                taskArgs.token,
                address,
                taskArgs.value
            )).wait();
    
        }
    
        console.log(`deposit token ${taskArgs.token} ${taskArgs.value} to ${address} successful`);
    })

task("tool:vaultDeploy","Deploy the vault token")
    .addParam("token", "The token address on relay chain")
    .addParam("name", "The name of the vault token")
    .addParam("symbol", "The symbol of the vault token")
    .setAction(async(taskArgs,hre) => {
        const {deploy} = hre.deployments
        const accounts = await ethers.getSigners()
        const deployer = accounts[0];
    
        console.log("deployer address:", deployer.address);
    
        await deploy('VaultTokenV2', {
            from: deployer.address,
            args: [taskArgs.token, taskArgs.name, taskArgs.symbol],
            log: true,
            contract: 'VaultTokenV2',
        })
    
        let vault = await ethers.getContract('VaultTokenV2');
    
        console.log(`VaultTokenV2 ${taskArgs.symbol} address: ${vault.address}`);
    })

task("tool:vaultAddManager","Add vaultToken manager")
    .addParam("vault", "The vault token address")
    .addOptionalParam("manager", "the manager address, default is relay", "relay", types.string) 
    .setAction(async(taskArgs,hre) => {
        const accounts = await ethers.getSigners()
        const deployer = accounts[0];
        const chainId = await deployer.getChainId();
        console.log("deployer address:",deployer.address);
    
        //let proxy = await hre.deployments.get("MAPVaultToken");
        let manager = taskArgs.manager;
        if (taskArgs.manager === "relay") {
            let proxy = await getMos(chainId, hre.network.name)
            if(proxy === undefined) {
                throw "mos not deployed ..."
            }
            manager = proxy.address;
        }
    
        let vaultToken = await ethers.getContractAt('VaultTokenV2', taskArgs.vault);
    
        await (await vaultToken.connect(deployer).addManager(manager)).wait();
        console.log(`MAPVaultToken ${taskArgs.vault} add manager ${manager} success`)
    }) 


task("tool:withdraw","withdraw token")
    .addParam("mos", "The mos address")
    .addOptionalParam("token", "The token address","0x0000000000000000000000000000000000000000",types.string)
    .addOptionalParam("address", "The receiver address","",types.string)
    .addParam("value", "withdraw value")
    .setAction(async (taskArgs,hre) => {
        const accounts = await ethers.getSigners()
        const deployer = accounts[0];

        console.log("deployer address:",deployer.address);

        let mos = await ethers.getContractAt('MAPOmnichainServiceRelayV2', taskArgs.mos);

        let address = taskArgs.address;
        if (taskArgs.address === "") {
            address = deployer.address;
        }

        let token = taskArgs.token;
        if (taskArgs.token === "0x0000000000000000000000000000000000000000"){
            token = await mos.wToken();
        }
        let managerAddress = await mos.tokenRegister();
        let manager = await ethers.getContractAt('TokenRegisterV2', managerAddress);

        let vaultAddress = await manager.getVaultToken(token);

        console.log(`token address: ${token}, vault token address: ${vaultAddress}`);

        let vaultToken = await ethers.getContractAt("IERC20", vaultAddress);

        await (await mos.connect(deployer).withdraw(
            vaultAddress,
            taskArgs.value
        )).wait();

        console.log(`withdraw token ${token} from vault ${vaultAddress} ${taskArgs.value} to  ${address} successful`);
    });