module.exports = async (taskArgs,hre) => {
    const accounts = await ethers.getSigners()
    const deployer = accounts[0];

    console.log("deployer address:",deployer.address);

    let vault = await hre.deployments.get("VaultTokenV2")

    console.log("vault address:", vault.address);

    let vaultContract = await ethers.getContractAt('VaultTokenV2',vault.address);

    await (await vaultContract.connect(deployer).deposit(taskArgs.fromchain, "1000000000000000000000", deployer.address)).wait();

    console.log(`deploy successful`);


}