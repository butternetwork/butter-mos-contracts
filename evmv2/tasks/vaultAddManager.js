let {getMos} = require("../utils/helper.js")
module.exports = async (taskArgs,hre) => {
    const accounts = await ethers.getSigners()
    const deployer = accounts[0];
    const chainId = await deployer.getChainId();
    console.log("deployer address:",deployer.address);

    //let proxy = await hre.deployments.get("MAPVaultToken");
    let manager = taskArgs.manager;
    if (taskArgs.manager === "relay") {
        let proxy = await getMos(chainId,hre.network.name)
        if(!proxy) {
            throw "mos not deployed ..."
        }
        manager = proxy.address;
    }

    let vaultToken = await ethers.getContractAt('VaultTokenV2', taskArgs.vault);

    await (await vaultToken.connect(deployer).addManager(manager)).wait();
    console.log(`MAPVaultToken ${taskArgs.vault} add manager ${manager} success`)

}