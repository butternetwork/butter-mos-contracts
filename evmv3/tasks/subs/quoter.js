let { saveDeployment, getDeployment, getToken} = require("../utils/utils");

task("quoter:deploy", "Deploy the quoter")
  .addParam("swap", "flash swap address")
  .addParam("register", "token register address")
  .setAction(async (taskArgs, hre) => {
    const { deploy } = hre.deployments;
    const accounts = await ethers.getSigners();
    const deployer = accounts[0];

    console.log("deployer address:", deployer.address);

    let Quoter = await ethers.getContractFactory("Quoter");

    let q = await Quoter.deploy(taskArgs.register, taskArgs.swap);

    await q.deployed();

    console.log("Quoter addr", q.address);

    await saveDeployment(hre.network.name, "Quoter", q.address);
  });

task("quoter:set", "grant Role")
  .addParam("swap", "flash swap address")
  .addParam("register", "token register address")
  .setAction(async (taskArgs, hre) => {
    let d = await getDeployment(hre.network.name, "Quoter");

    if (!d) throw "quoter not deployed";

    let Quoter = await ethers.getContractFactory("Quoter");

    let q = Quoter.attach(d);

    await (await q.set(taskArgs.register, taskArgs.swap)).wait();

    console.log("swap :", await q.swap());

    console.log("tokenRegister :", await q.tokenRegister());
  });


let swap_addr = "0xd2947E481666B80D1fC130f9539812de6030de19"
task("quoter:getAmountOut", "getAmountOut")
  .addParam("tokenin", "token in address")
  .addParam("tokenout", "token out address")
  .addParam("amount", "amount in")
  .setAction(async (taskArgs, hre) => {
    let [wallet] = await ethers.getSigners();
    let abi = [
      "function getAmountOut(address _tokenIn, address _tokenOut, uint256 _amountIn) external view returns(uint256 amountOut)",
      "function getAmountIn(address _tokenIn, address _tokenOut, uint256 _amountOut) external view returns(uint256 amountIn) "
    ]

      let tokenInAddr = await getToken(hre.network.name, taskArgs.tokenin);
      let tokenOutAddr = await getToken(hre.network.name, taskArgs.tokenout);

    let swap = await ethers.getContractAt(abi, swap_addr, wallet);

    let amountIn = ethers.utils.parseEther(taskArgs.amount);

    let amountOut = await swap.getAmountOut(tokenInAddr, tokenOutAddr, amountIn);

    console.log(`${taskArgs.amount} ${taskArgs.tokenin} amountOut ${taskArgs.tokenout} ${ethers.utils.formatEther(amountOut)}`);
  });

task("quoter:getAmountIn", "getAmountIn")
  .addParam("tokenin", "token in address")
  .addParam("tokenout", "token out address")
  .addParam("amountout", "amount out")
  .setAction(async (taskArgs, hre) => {
    let [wallet] = await ethers.getSigners();
    let abi = [
      "function getAmountOut(address _tokenIn, address _tokenOut, uint256 _amountIn) external view returns(uint256 amountOut)",
      "function getAmountIn(address _tokenIn, address _tokenOut, uint256 _amountOut) external view returns(uint256 amountIn) "
    ]

    let swap = await ethers.getContractAt(abi, swap_addr, wallet);

    let amountOut = ethers.utils.parseEther(taskArgs.amountout);

    let amountIn = await swap.getAmountIn(taskArgs.tokenin, taskArgs.tokenout, amountOut);

    console.log("amountIn:", ethers.utils.formatEther(amountIn));
  });