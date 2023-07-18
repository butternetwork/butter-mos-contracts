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

    console.log("mos address:", mos.address);

    // let mos = await ethers.getContractAt('MAPOmnichainServiceV2',proxy.address);

    let tokens = taskArgs.token.split(",");
    if (taskArgs.mintable) {
        await (await mos.connect(deployer).addMintableToken(
            tokens
        )).wait();

        console.log(`mos set token ${taskArgs.token} mintable ${taskArgs.mintable} success`);
    } else {
        await (await mos.connect(deployer).removeMintableToken(
            tokens
        )).wait();

        console.log(`mos set token ${taskArgs.token} mintable ${taskArgs.mintable}  success`);
    }

}