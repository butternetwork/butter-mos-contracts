let { saveDeployment } = require("../utils/utils");

task("swapDataValidator:deploy", "Deploy the swapDataValidator")
  .addParam("register", "token register address")
  .setAction(async (taskArgs, hre) => {
    const accounts = await ethers.getSigners();
    const deployer = accounts[0];

    console.log("deployer address:", deployer.address);

    let SwapDataValidator = await ethers.getContractFactory("SwapDataValidator");

    let swapDataValidator = await SwapDataValidator.deploy(taskArgs.register);

    await swapDataValidator.deployed();

    console.log("swapDataValidator addr", swapDataValidator.address);

    await saveDeployment(hre.network.name, "SwapDataValidator", swapDataValidator.address);
  });
