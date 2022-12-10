
module.exports = async (taskArgs,hre) => {
    const {deploy} = hre.deployments
    const accounts = await ethers.getSigners()
    const deployer = accounts[0];

    console.log("deployer address:",deployer.address);

    // deploy mos relay and proxy
    await deploy('MAPOmnichainServiceRelayV2', {
        from: deployer.address,
        args: [],
        log: true,
        contract: 'MAPOmnichainServiceRelayV2'
    })

    let mosRelay = await ethers.getContract('MAPOmnichainServiceRelayV2');

    console.log("MAPOmnichainServiceRelayV2 address:",mosRelay.address);

    let data = mosRelay.interface.encodeFunctionData("initialize", [taskArgs.wrapped, taskArgs.lightnode]);

    await deploy('MAPOmnichainServiceProxyV2', {
        from: deployer.address,
        args: [mosRelay.address,data],
        log: true,
        contract: 'MAPOmnichainServiceProxyV2',
    })

    let mosRelayProxy = await ethers.getContract('MAPOmnichainServiceProxyV2');

    console.log("MAPCrossChainServiceRelayProxy address:",mosRelayProxy.address);
    let mos = await ethers.getContractAt('MAPOmnichainServiceRelayV2', mosRelayProxy.address);

    // deploy tokenRegister
    await deploy('TokenRegisterV2', {
        from: deployer.address,
        args: [],
        log: true,
        contract: 'TokenRegisterV2',
    })
    let tokenRegister = await ethers.getContract('TokenRegisterV2');
    console.log("TokenRegisterV2 address:",tokenRegister.address);
    data = tokenRegister.interface.encodeFunctionData("initialize", []);
    await deploy('TokenRegisterProxy', {
        from: deployer.address,
        args: [tokenRegister.address,data],
        log: true,
        contract: 'TokenRegisterProxy',
    })
    let tokenRegisterProxy = await ethers.getContract('TokenRegisterProxy');
    const tokenManager = await ethers.getContractAt('TokenRegisterV2', tokenRegisterProxy.address);
    console.log("TokenRegisterProxy address:",tokenRegisterProxy.address);

    // set token manager
    await (await mos.connect(deployer).setTokenManager(tokenRegisterProxy.address)).wait();
    console.log("set token manager:", tokenRegisterProxy.address);

    // deploy mintable token mapping usdc on map
    await deploy('MintableToken', {
        from: deployer.address,
        args: ["map usdc", "mUSDC"],
        log: true,
        contract: 'MintableToken',
    })
    let usdc = await ethers.getContract('MintableToken');
    console.log(`deploy token mUSDC on address:`, usdc.address);

    // deploy vault
    await deploy('VaultTokenV2', {
        from: deployer.address,
        args: [usdc.address, 'map usdc', 'mUSDC'],
        log: true,
        contract: 'VaultTokenV2',
    })
    let vault = await ethers.getContract('VaultTokenV2');
    console.log(`usdc vault address: ${vault.address}`);

    // add mos as manager
    await (await vault.connect(deployer).addManager(mos.address)).wait();
    console.log(`assign ${mos.address}  vault manager role`)

    // register token
    await (await tokenManager.connect(deployer).registerToken(
        usdc.address,
        vault.address,
        "true"
    )).wait()
    console.log(`register mintable mUSDC to vault ${vault.address}`)

    // map token
    const bscUSDCAddress = '0x3F1E91BFC874625f4ee6EF6D8668E79291882373'
    const maticUSDCAddress = '0x1E01CF4503808Fb30F17806035A87cf5A5217727'

    await (await tokenManager.connect(deployer).mapToken(
        usdc.address,
        '97',
        bscUSDCAddress,
        18
    )).wait()
    console.log(`map 97 ${bscUSDCAddress} to mUSDC on map`)

    await (await tokenManager.connect(deployer).mapToken(
        usdc.address,
        '80001',
        maticUSDCAddress,
        18
    )).wait()
    console.log(`map 80001 ${maticUSDCAddress} to mUSDC on map`)

    // set token fee
    await (await tokenManager.connect(deployer).setTokenFee(
        usdc.address,
        '97',
        '100000000000000000',
        '10000000000000000000',
        '1000'
    )).wait()
    console.log(`set mUSDC fee to 97`)

    await (await tokenManager.connect(deployer).setTokenFee(
        usdc.address,
        '80001',
        '100000000000000000',
        '10000000000000000000',
        '1000'
    )).wait()
    console.log(`set mUSDC fee to 80001`)

    await (await usdc.connect(deployer).mint(deployer.address, '1000000000000000000000'))
    await (await usdc.connect(deployer).grantRole('0x9f2df0fed2c77648de5860a4cc508cd0818c85b8b8a1ab4ceeef8d981c8956a6', mosRelayProxy.address))
    console.log(`mint 1000 musdc to deployer for testing`)

}