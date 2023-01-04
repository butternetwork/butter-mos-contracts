module.exports = async (taskArgs, hre) => {
    const {deploy} = hre.deployments
    const accounts = await ethers.getSigners()
    const deployer = accounts[0];

    const chainId = await deployer.getChainId();

    console.log("deployer address:", deployer.address);

    await deploy('MAPOmnichainServiceV2', {
        from: deployer.address,
        args: [],
        log: true,
        contract: 'MAPOmnichainServiceV2',
    })

    let mos = await ethers.getContract('MAPOmnichainServiceV2');



    let data = mos.interface.encodeFunctionData("initialize", [taskArgs.wrapped, taskArgs.lightnode]);

    await deploy('MAPOmnichainServiceProxyV2', {
        from: deployer.address,
        args: [mos.address, data],
        log: true,
        contract: 'MAPOmnichainServiceProxyV2',
    })

    let mosProxy = await ethers.getContract('MAPOmnichainServiceProxyV2');
    console.log("MAPOmnichainServiceV2 relay address:", mosProxy.address);

    mos = await ethers.getContractAt('MAPOmnichainServiceV2', mosProxy.address);

    const relayAddress = '0x9D8ECF3aa8a93be0bb026fAd7529d9Be8F5849B9';
    await (await mos.connect(deployer).setRelayContract('212', relayAddress)).wait();
    console.log("set realy", relayAddress)

    let coreAddress;
    let stablecoinAddress;
    if (chainId === 97) {
        coreAddress = '0xA8d5352e8629B2FFE3d127142FB1D530f8b793eC';
        stablecoinAddress = '0x3F1E91BFC874625f4ee6EF6D8668E79291882373';
    } else if (chainId === 80001) {
        coreAddress = '0x448484ab100D9F374621eE1A520419CF21349F11';
        stablecoinAddress = '0x1E01CF4503808Fb30F17806035A87cf5A5217727'
    } else if (chainId === 5) {
        coreAddress = '0x3c09AF7eb25904Ec62F37540044A48da1a24269A';
        stablecoinAddress = '0x86CBE739888bFbC0bcA6e2D6106cfC5B3B1F69A5';
    } else {
        throw new Error("unsupported chainId", chainId)
    }

    await (await mos.connect(deployer).registerToken(stablecoinAddress, 212, true)).wait();
    await (await mos.connect(deployer).registerToken(stablecoinAddress, chainId, true)).wait();
    await (await mos.connect(deployer).setButterCoreAddress(coreAddress)).wait();
    console.log('set core', coreAddress)

    // send some stable coin for testing
    const amount = "2000000000000000000";
    const token = await ethers.getContractAt('MintableToken', stablecoinAddress);
    await (await token.connect(deployer).transfer(mosProxy.address, amount)).wait();
    console.log(`sent ${amount} stable coin to address ${mosProxy.address}`);

}