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

    console.log("MAPOmnichainServiceV2 address:", mos.address);


    let data = mos.interface.encodeFunctionData("initialize", [taskArgs.wrapped, taskArgs.lightnode]);

    await deploy('MAPOmnichainServiceProxyV2', {
        from: deployer.address,
        args: [mos.address, data],
        log: true,
        contract: 'MAPOmnichainServiceProxyV2',
    })

    let mosProxy = await ethers.getContract('MAPOmnichainServiceProxyV2');

    mos = await ethers.getContractAt('MAPOmnichainServiceV2', mosProxy.address);

    await (await mos.connect(deployer).setRelayContract('212', '0xEbD0E665F871c888D3EEf17aDB2361eFB7CD126C')).wait();
    console.log("st realy", mosProxy.address)

    await (await mos.connect(deployer).setButterCoreAddress('0xb401355440842aAb5A4DeA8ABFC7439d9Cb8ab55')).wait();
    console.log('set core')
}