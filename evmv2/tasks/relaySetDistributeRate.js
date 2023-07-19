let {getMos} = require("../utils/helper.js")
module.exports = async (taskArgs,hre) => {
    const accounts = await ethers.getSigners()
    const deployer = accounts[0];
    const chainId = await deployer.getChainId();
    console.log("deployer address:",deployer.address);

    let mos = await getMos(chainId,hre.network.name);

    if(!mos){
        throw "mos not deployed .."
    }

    console.log("mos address:", mos.address);

    await (await mos.connect(deployer).setDistributeRate(
        taskArgs.type,
        taskArgs.address,
        taskArgs.rate
    )).wait();


    console.log(`mos set distribute ${taskArgs.type} rate ${taskArgs.rate} to ${taskArgs.address} success`)
}