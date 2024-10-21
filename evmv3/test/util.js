






async function deploy() {
    let [wallet] = await ethers.getSigners();
    // deploy wtoken
    let WrapedToken = await ethers.getContractFactory("WrapedToken");
    let wtoken = await WrapedToken.deploy();
    // console.log("wtoken:", wtoken.address)
    // deploy usdt
    let MockToken = await ethers.getContractFactory("MockToken");
    let usdt = await MockToken.deploy("USDT","USDT");
    // console.log("usdt:", usdt.address)
    // deploy FeeService
    let FeeService = await ethers.getContractFactory("FeeService");
    let feeService = await FeeService.deploy();
    await feeService.initialize();
    await feeService.setBaseGas(212, 300000);
    await feeService.setChainGasPrice(212, usdt.address, 5000);
    await feeService.setFeeReceiver(wallet.address);
    // console.log("feeService:", feeService.address)
    // deploy TokenRegisterV3
    let TokenRegisterV3 = await ethers.getContractFactory("TokenRegisterV3");
    let tokenRegisterV3 = await TokenRegisterV3.deploy();
    let registerData = await tokenRegisterV3.interface.encodeFunctionData("initialize", [wallet.address]);
    let BridgeProxy = await ethers.getContractFactory("OmniServiceProxy");
    let register_proxy = await BridgeProxy.deploy(tokenRegisterV3.address, registerData);
    // console.log("register:", register_proxy.address)
    let register = TokenRegisterV3.attach(register_proxy.address);
    await register.setBaseFeeReceiver(wallet.address);
    let VaultTokenV3 = await ethers.getContractFactory("VaultTokenV3");
    let vaultWToken = await VaultTokenV3.deploy(wtoken.address, "wVault", "wVault");
    await vaultWToken.grantRole(await vaultWToken.MANAGER_ROLE(), register.address);
    await register.registerToken(wtoken.address, vaultWToken.address, false);
    await register.mapToken(wtoken.address, 212, wtoken.address, 18, false);
    await register.registerTokenChains(wtoken.address, [212, 97], true);
    await register.setFromChainFee(wtoken.address, 212, 5000, ethers.utils.parseEther("5"), 2000);
    await register.setFromChainFee(wtoken.address, 97, 5000, ethers.utils.parseEther("5"), 2000);
    await register.setToChainTokenFee(wtoken.address, 212, 5000, ethers.utils.parseEther("5"), 1000);
    await register.setToChainTokenFee(wtoken.address, 97, 5000, ethers.utils.parseEther("5"), 1000);
    await register.setBaseFee(wtoken.address, 212, ethers.utils.parseEther("0.5"), ethers.utils.parseEther("0.1"));
    await register.setBaseFee(wtoken.address, 97, ethers.utils.parseEther("0.5"), ethers.utils.parseEther("0.1"));

    let vaultUToken = await VaultTokenV3.deploy(usdt.address, "uVault", "uVault");
    await vaultUToken.grantRole(await vaultUToken.MANAGER_ROLE(), register.address);
    await register.registerToken(usdt.address, vaultUToken.address, false);
    await register.mapToken(usdt.address, 212, usdt.address, 18, false);
    await register.registerTokenChains(usdt.address, [212, 97], true);
    await register.setFromChainFee(usdt.address, 212, 5000, ethers.utils.parseEther("5"), 2000);
    await register.setFromChainFee(usdt.address, 97, 5000, ethers.utils.parseEther("5"), 2000);
    await register.setToChainTokenFee(usdt.address, 212, 5000, ethers.utils.parseEther("5"), 1000);
    await register.setToChainTokenFee(usdt.address, 97, 5000, ethers.utils.parseEther("5"), 1000);
    await register.setBaseFee(usdt.address, 212, ethers.utils.parseEther("0.5"), ethers.utils.parseEther("0.1"));
    await register.setBaseFee(usdt.address, 97, ethers.utils.parseEther("0.5"), ethers.utils.parseEther("0.1"));

    // deploy bridge
    let Bridge = await ethers.getContractFactory("Bridge");
    let bridge = await Bridge.deploy();
    let bridgeData = await Bridge.interface.encodeFunctionData("initialize", [wtoken.address ,wallet.address]);
    let b_proxy = await BridgeProxy.deploy(bridge.address, bridgeData);
    // console.log("bridge:", b_proxy.address)
    let b = Bridge.attach(b_proxy.address);
    await b.registerTokenChains(wtoken.address, [212, 97], true);
    await b.registerTokenChains(usdt.address, [212, 97], true);
    await b.updateTokens([wtoken.address], 0);
    await b.updateTokens([usdt.address], 1);

    // deploy lightnode
    let MockLightnode = await ethers.getContractFactory("MockLightnode");
    let lightnode = await MockLightnode.deploy();
    // console.log("lightnode:", lightnode.address)
    await b.setServiceContract(0, wtoken.address);
    await b.setServiceContract(1, lightnode.address);
    await b.setServiceContract(2, feeService.address);
    
    // deploy lightManager
    let MockLightnodeManager = await ethers.getContractFactory("MockLightnodeManager");
    let lightnodeManager = await MockLightnodeManager.deploy();
    // console.log("lightnodeManager:", lightnodeManager.address)

    // deploy relay 
    let BridgeAndRelay = await ethers.getContractFactory("BridgeAndRelay");
    let bridgeAndRelay = await BridgeAndRelay.deploy();
    let relayData = await BridgeAndRelay.interface.encodeFunctionData("initialize", [wtoken.address ,wallet.address]);
    let relay_proxy = await BridgeProxy.deploy(bridgeAndRelay.address, relayData);
    // console.log("relay:", relay_proxy.address)
    let relay = BridgeAndRelay.attach(relay_proxy.address);
    await relay.registerTokenChains(wtoken.address, [212, 97], true);
    await relay.registerTokenChains(usdt.address, [212, 97], true);
    await relay.updateTokens([wtoken.address], 0);
    await relay.updateTokens([usdt.address], 1);

    await relay.registerChain([212, 97], [b.address, b.address], 1);
    await relay.setDistributeRate(0, wallet.address, 100);
    await relay.setDistributeRate(1, wallet.address, 200);
    await relay.setDistributeRate(2, wallet.address, 300);

    await relay.setServiceContract(0, wtoken.address);
    await relay.setServiceContract(1, lightnodeManager.address);
    await relay.setServiceContract(2, feeService.address);
    await relay.setServiceContract(4, register.address);
    await b.setRelay(212, relay.address);
    await vaultWToken.grantRole(await vaultWToken.MANAGER_ROLE(), relay.address);
    await vaultUToken.grantRole(await vaultUToken.MANAGER_ROLE(), relay.address);
    let TestUtil = await ethers.getContractFactory("TestUtil");
    let util = await TestUtil.deploy();
    return [register, wtoken, usdt, b, relay, util, vaultWToken, vaultUToken];
}



module.exports = {
    deploy
}