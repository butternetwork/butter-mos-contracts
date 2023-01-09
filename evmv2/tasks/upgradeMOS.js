module.exports = async (taskArgs, hre) => {
    const {deploy} = hre.deployments
    const accounts = await ethers.getSigners()
    const deployer = accounts[0];

    console.log("deployer address:", deployer.address);

    let proxy = await hre.deployments.get("MAPOmnichainServiceProxyV2")
    console.log("proxy address:", proxy.address);
    let mos = await ethers.getContractAt('MAPOmnichainServiceV2', proxy.address)
    console.log("new MAPOmnichainServiceV2 address:", taskArgs.mos);

    await mos.upgradeTo(taskArgs.mos);

    console.log("upgrade mos to address:", taskArgs.mos)
}