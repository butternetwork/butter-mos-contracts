let { saveDeployment, getDeployment } = require("../utils/utils");

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
