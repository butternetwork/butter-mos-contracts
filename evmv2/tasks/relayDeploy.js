
module.exports = async (taskArgs,hre) => {
    const {deploy} = hre.deployments
    const accounts = await ethers.getSigners()
    const deployer = accounts[0];

    console.log("deployer address:",deployer.address);

    await deploy('MAPOmnichainServiceRelayV2', {
        from: deployer.address,
        args: [],
        log: true,
        contract: 'MAPOmnichainServiceRelayV2'
    })

    let mosRelay = await ethers.getContract('MAPOmnichainServiceRelayV2');

    console.log("MAPOmnichainServiceRelayV2 address:",mosRelay.address);

    let data = mosRelay.interface.encodeFunctionData("initialize", [taskArgs.wrapped, taskArgs.lightnode]);

    let proxy = await deployments.get("MAPOmnichainServiceProxyV2")

    let mosRelayProxy = await ethers.getContractAt('MAPOmnichainServiceRelayV2',proxy.address);

    await (await mosRelayProxy.upgradeTo(mosRelay.address)).wait();
    console.log("proxy address:", mosRelayProxy.address);

    console.log("new MAPOmnichainServiceV2 address:", mosRelay.address);

    console.log("upgrade mos to address:", mosRelay.address)


}