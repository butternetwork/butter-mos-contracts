module.exports = async (taskArgs, hre) => {
    const {deploy} = hre.deployments
    const accounts = await ethers.getSigners()
    const deployer = accounts[0];

    console.log("deployer address:", deployer.address);

    await deploy('MAPOmnichainServiceV2', {
        from: deployer.address,
        args: [],
        log: true,
        contract: 'MAPOmnichainServiceV2',
    })

    let mos = await ethers.getContract('MAPOmnichainServiceV2');
    console.log('new mos successfully deploy: ' + mos.address);

}