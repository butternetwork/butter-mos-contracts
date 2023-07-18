let {getMos} = require("../utils/helper.js")
module.exports = async (taskArgs,hre) => {
    const accounts = await ethers.getSigners()
    const deployer = accounts[0];
    const chainId = await deployer.getChainId();
    console.log("deployer address:",deployer.address);

    let mos = await getMos(chainId,hre.network.name)
    if(!mos) {
        throw "mos not deployed ..."
    }

    console.log("mos address", mos.address);

    if(chainId === 212 || chainId === 22776){
        await (await mos.connect(deployer).setLightClientManager(taskArgs.manager)).wait();
        console.log("set client manager:", taskArgs.client);
    } else {
        await (await mos.connect(deployer).setLightClient(taskArgs.client)).wait();
        console.log(`mos set  light client ${taskArgs.client} successfully `);

    }

}
