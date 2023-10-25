const { getMos } = require("../../utils/helper");

task("token:deposit", "Cross-chain deposit token")
  .addOptionalParam("token", "The token address", "0x0000000000000000000000000000000000000000", types.string)
  .addOptionalParam("address", "The receiver address", "", types.string)
  .addParam("value", "deposit value, unit WEI")
  .setAction(async (taskArgs, hre) => {
    const accounts = await ethers.getSigners();
    const deployer = accounts[0];

    console.log("deposit address:", deployer.address);

    const chainId = hre.network.chainId;

    let mos = await getMos(chainId, hre.network.name);

    if (!mos) {
      throw "mos not deployed ...";
    }
    console.log("mos address:", mos.address);

    // let mos = await ethers.getContractAt('IButterMosV2', taskArgs.mos);

    let address = taskArgs.address;
    if (taskArgs.address === "") {
      address = deployer.address;
    }

    if (taskArgs.token === "0x0000000000000000000000000000000000000000") {
      await (await mos.connect(deployer).depositNative(address, { value: taskArgs.value })).wait();
    } else {
      let token = await ethers.getContractAt("IERC20", taskArgs.token);
      console.log("approve token... ");
      await (await token.connect(deployer).approve(mos.address, taskArgs.value)).wait();

      console.log("deposit token... ");
      await (await mos.connect(deployer).depositToken(taskArgs.token, address, taskArgs.value)).wait();
    }

    console.log(`deposit token ${taskArgs.token} ${taskArgs.value} to ${address} successful`);
  });

task("token:transfer", "Cross-chain transfer token")
  .addOptionalParam("token", "The token address", "0x0000000000000000000000000000000000000000", types.string)
  .addOptionalParam("address", "The receiver address", "", types.string)
  .addOptionalParam("chain", "The receiver chain", 22776, types.int)
  .addParam("value", "deposit value, unit WEI")
  .setAction(async (taskArgs, hre) => {
    const accounts = await ethers.getSigners();
    const deployer = accounts[0];

    console.log("deposit address:", deployer.address);

    const chainId = hre.network.chainId;

    let mos = await getMos(chainId, hre.network.name);

    if (!mos) {
      throw "mos not deployed ...";
    }
    console.log("mos address:", mos.address);

    // let mos = await ethers.getContractAt('IButterMosV2', taskArgs.mos);

    let address = taskArgs.address;
    if (taskArgs.address === "") {
      address = deployer.address;
    }

    if (taskArgs.token === "0x0000000000000000000000000000000000000000") {
      await (
        await mos.connect(deployer).swapOutNative(deployer.address, address, taskArgs.chain, "0x", {
          value: taskArgs.value,
        })
      ).wait();
    } else {
      let token = await ethers.getContractAt("IERC20", taskArgs.token);
      await (await token.connect(deployer).approve(mos.address, taskArgs.value)).wait();

      await (
        await mos
          .connect(deployer)
          .swapOutToken(deployer.address, taskArgs.token, address, taskArgs.value, taskArgs.chain, "0x")
      ).wait();
    }

    console.log(`transfer token ${taskArgs.token} ${taskArgs.value} to ${address} successful`);
  });

task("token:deploy", "Deploy a token with role control")
  .addParam("name", "token name")
  .addParam("symbol", "token symbol")
  .addOptionalParam("decimals", "default 18", 18, types.int)
  .addOptionalParam("balance", "init balance, default 0", 0, types.int)
  .setAction(async (taskArgs, hre) => {
    const { deploy } = hre.deployments;
    const accounts = await ethers.getSigners();
    const deployer = accounts[0];

    console.log("deployer address:", deployer.address);

    await deploy("MintableToken", {
      from: deployer.address,
      args: [taskArgs.name, taskArgs.symbol, taskArgs.decimals],
      log: true,
      contract: "MintableToken",
    });

    let token = await ethers.getContract("MintableToken");

    console.log(`Deply token '${taskArgs.symbol}' address:`, token.address);

    if (taskArgs.balance > 0) {
      balance = ethers.BigNumber.from(taskArgs.balance).mul(ethers.BigNumber.from("1000000000000000000"));

      await token.mint(deployer.address, balance.toString());

      console.log(`Mint '${taskArgs.name}' Token ${taskArgs.balance} ${taskArgs.symbol}`);
    }
  });

task("token:grant", "Grant a mintable token mint role")
  .addParam("token", "token address")
  .addOptionalParam("minter", "minter address, default mos", "mos", types.string)
  .setAction(async (taskArgs, hre) => {
    const { deploy } = hre.deployments;
    const accounts = await ethers.getSigners();
    const deployer = accounts[0];

    let chainId = hre.network.config.chainId;

    console.log("deployer address:", deployer.address);

    let token = await ethers.getContractAt("MintableToken", taskArgs.token);

    console.log("Mintable Token address:", token.address);

    let minter = taskArgs.minter;
    if (taskArgs.minter === "mos") {
      let proxy = await getMos(chainId, hre.network.name);
      if (proxy === undefined) {
        throw "mos not deployed ...";
      }
      minter = proxy.address;
    }
    await await token
      .connect(deployer)
      .grantRole("0x9f2df0fed2c77648de5860a4cc508cd0818c85b8b8a1ab4ceeef8d981c8956a6", minter);

    console.log("Grant token ", token.address, " to address", minter);
  });

task("token:mint", "mint token")
  .addParam("token", "token address")
  .addParam("amount", "mint amount")
  .setAction(async (taskArgs, hre) => {
    const { deploy } = hre.deployments;
    const accounts = await ethers.getSigners();
    const deployer = accounts[0];

    console.log("deployer address:", deployer.address);

    let token = await ethers.getContractAt("MintableToken", taskArgs.token);

    console.log("Mintable Token address:", token.address);

    await token.mint(deployer.address, taskArgs.amount);

    console.log(`Mint '${taskArgs.token}' Token ${taskArgs.amount} `);
  });
