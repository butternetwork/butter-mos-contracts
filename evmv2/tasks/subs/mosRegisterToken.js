let {getMos} = require("../../utils/helper.js")
module.exports = async (taskArgs,hre) => {
    const accounts = await ethers.getSigners()
    const deployer = accounts[0];
    const chainId = await deployer.getChainId();
    console.log("deployer address:",deployer.address);

    let mos = await getMos(chainId,hre.network.name)

    if(mos === undefined) {
        throw "mos not deployed ..."
    }
    console.log("mos address:", mos.address);

    let ids = taskArgs.chains.split(",");

    for (let i = 0; i < ids.length; i++){
        await (await mos.connect(deployer).registerToken(
            taskArgs.token,
            ids[i],
            taskArgs.enable
        )).wait();

        console.log(`mos register token ${taskArgs.token} to chain ${ids[i]} success`);
    }

    console.log("mos registerToken success");
}
