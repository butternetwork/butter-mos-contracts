let {getMos} = require("../utils/helper.js")
module.exports = async (taskArgs,hre) => {
    const accounts = await ethers.getSigners()
    const deployer = accounts[0];
    const chainId = await deployer.getChainId();
    console.log("deployer address:",deployer.address);

    let mos = await getMos(chainId,hre.network.name)

    if (mos == undefined) {
        throw "mos not deployed ..."
    }

    console.log("mos address", mos.address);

    // let mos = await ethers.getContractAt('MAPOmnichainServiceV2', proxy.address);
                    
    await (await mos.connect(deployer).setButterRouterAddress(taskArgs.router)).wait();

    console.log(`mos set butter router to ${taskArgs.router} `);

}