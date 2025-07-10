const { ethers } = require("hardhat");

// ==================== CONFIGURATION ====================
const DEFAULT_CONFIG = {
    // Chain IDs for testing
    chains: [212, 97],

    // Fee configuration
    fees: {
        fromChainFee: {
            rate: 5000,
            amount: ethers.utils.parseEther("0.1"),
            minAmount: ethers.utils.parseEther("0"),
        },
        toChainTokenFee: {
            rate: 5000,
            amount: ethers.utils.parseEther("0.5"),
            minAmount: ethers.utils.parseEther("0.001"),
        },
        baseFee: {
            swapAmount: ethers.utils.parseEther("0.5"),
            bridgeAmount: ethers.utils.parseEther("0.1")
        }
    },

    // Token configuration
    tokens: {
        wToken: {
            name: "Wrapped Token",
            symbol: "WToken",
            decimals: 18
        },
        usdt: {
            name: "USDT",
            symbol: "USDT",
            decimals: 18
        }
    },

    // Vault configuration
    vaults: {
        wToken: {
            name: "wVault",
            symbol: "wVault"
        },
        usdt: {
            name: "uVault",
            symbol: "uVault"
        }
    }
};

// ==================== HELPER FUNCTIONS ====================
/**
 * Deploy a token with specified configuration
 * @param {string} name - Token name
 * @param {string} symbol - Token symbol
 * @returns {Promise<Contract>} Deployed token contract
 */
async function deployToken(name, symbol) {
    const MockToken = await ethers.getContractFactory("MockToken");
    return await MockToken.deploy(name, symbol);
}

/**
 * Deploy a vault for a token
 * @param {Contract} token - Token contract
 * @param {string} name - Vault name
 * @param {string} symbol - Vault symbol
 * @returns {Promise<Contract>} Deployed vault contract
 */
async function deployVault(token, name, symbol) {
    const VaultTokenV3 = await ethers.getContractFactory("VaultTokenV3");
    return await VaultTokenV3.deploy(token.address, name, symbol);
}

/**
 * Configure token registration with fees
 * @param {Contract} register - Token register contract
 * @param {Contract} token - Token contract
 * @param {Contract} vault - Vault contract
 * @param {Array<number>} chains - Chain IDs
 * @param {Object} config - Fee configuration
 */
async function configureTokenRegistration(register, token, vault, chains, config, deployer) {
    // Grant manager role to register
    await vault.grantRole(await vault.MANAGER_ROLE(), register.address);

    // Register token and vault
    await register.connect(deployer).registerToken(token.address, vault.address, false);
    await register.connect(deployer).mapToken(token.address, chains[0], token.address, 18, false);
    await register.connect(deployer).registerTokenChains(token.address, chains, true);

    // Configure fees for each chain
    for (const chainId of chains) {
        await register.connect(deployer).setFromChainFee(
            token.address,
            chainId,
            config.fees.fromChainFee.minAmount,
            config.fees.fromChainFee.amount,
            config.fees.fromChainFee.rate
        );

        await register.connect(deployer).setToChainTokenFee(
            token.address,
            chainId,
            config.fees.toChainTokenFee.minAmount,
            config.fees.toChainTokenFee.amount,
            config.fees.toChainTokenFee.rate
        );

        await register.connect(deployer).setBaseFee(
            token.address,
            chainId,
            config.fees.baseFee.swapAmount,
            config.fees.baseFee.bridgeAmount
        );
    }
}

/**
 * Deploy and configure a proxy contract
 * @param {ContractFactory} contractFactory - Contract factory
 * @param {string} implementationAddress - Implementation address
 * @param {string} initData - Initialization data
 * @returns {Promise<Contract>} Configured proxy contract
 */
async function deployProxy(contractFactory, implementationAddress, initData) {
    const BridgeProxy = await ethers.getContractFactory("OmniServiceProxy");
    const proxy = await BridgeProxy.deploy(implementationAddress, initData);
    return contractFactory.attach(proxy.address);
}

/**
 * Configure bridge permissions
 * @param {Contract} authority - Authority manager contract
 * @param {Contract} bridge - Bridge contract
 * @param {Array<string>} functionSignatures - Function signatures to authorize
 */
async function configureBridgePermissions(authority, bridge, functionSignatures, deployer) {
    const funSigs = functionSignatures.map(sig => bridge.interface.getSighash(sig));
    await authority.connect(deployer).setTargetFunctionRole(bridge.address, funSigs, 0);
}

/**
 * Configure relay permissions
 * @param {Contract} authority - Authority manager contract
 * @param {Contract} relay - Relay contract
 * @param {Array<string>} functionSignatures - Function signatures to authorize
 */
async function configureRelayPermissions(authority, relay, functionSignatures, deployer) {
    const relayFunSigs = functionSignatures.map(sig => relay.interface.getSighash(sig));
    await authority.connect(deployer).setTargetFunctionRole(relay.address, relayFunSigs, 0);
}

/**
 * Setup test accounts with tokens
 * @param {Contract} wtoken - Wrapped token contract
 * @param {Contract} usdt - USDT contract
 * @param {Array} accounts - Array of signers
 */
async function setupTestAccounts(wtoken, usdt, accounts) {
    const [deployer, owner, other, user1, user2] = accounts;
    const mintAmount = ethers.utils.parseEther("10");

    // Send native token to each account - ensure deployer has enough funds
    const totalNeeded = mintAmount.mul(4); // 4 accounts need funding
    const deployerBalance = await deployer.getBalance();
    
    if (deployerBalance.gte(totalNeeded)) {
        // Send native token to each account
        await deployer.sendTransaction({ to: owner.address, value: mintAmount });
        await deployer.sendTransaction({ to: other.address, value: mintAmount });
        await deployer.sendTransaction({ to: user1.address, value: mintAmount });
        await deployer.sendTransaction({ to: user2.address, value: mintAmount });

        // Each account deposits native token to receive wToken
        await wtoken.connect(owner).deposit({ value: mintAmount });
        await wtoken.connect(other).deposit({ value: mintAmount });
        await wtoken.connect(user1).deposit({ value: mintAmount });
        await wtoken.connect(user2).deposit({ value: mintAmount });
    } else {
        console.log("Warning: Deployer balance insufficient for all accounts, skipping native token distribution");
        // For WrapedToken, we can't mint directly, so we'll skip wToken distribution
        // The tests will need to handle this case
    }

    // Mint USDT to each account
    await usdt.mint(owner.address, mintAmount);
    await usdt.mint(other.address, mintAmount);
    await usdt.mint(user1.address, mintAmount);
    await usdt.mint(user2.address, mintAmount);
}

// ==================== SPECIALIZED DEPLOYMENT FUNCTIONS ====================

/**
 * Deploy only tokens and basic utilities
 * @param {Object} customConfig - Custom configuration (optional)
 * @returns {Promise<Object>} Deployed contracts
 */
async function deployTokensOnly(customConfig = {}) {
    const config = { ...DEFAULT_CONFIG, ...customConfig };
    const [deployer, owner, other, attacker, user1, user2] = await ethers.getSigners();

    // Deploy tokens
    const WrapedToken = await ethers.getContractFactory("WrapedToken");
    const wtoken = await WrapedToken.deploy();
    const usdt = await deployToken(config.tokens.usdt.name, config.tokens.usdt.symbol);

    // Setup test accounts - deployer has funds by default
    await setupTestAccounts(wtoken, usdt, [deployer, owner, other, user1, user2]);

    return {
        wtoken,
        usdt,
        deployer,
        owner,
        other,
        attacker,
        user1,
        user2
    };
}

/**
 * Deploy only TokenRegisterV3 and its dependencies
 * @param {Object} customConfig - Custom configuration (optional)
 * @returns {Promise<Object>} Deployed contracts
 */
async function deployRegisterOnly(customConfig = {}) {
    const config = { ...DEFAULT_CONFIG, ...customConfig };
    const [deployer, owner, other, attacker, user1, user2] = await ethers.getSigners();

    // Deploy tokens
    const { wtoken, usdt } = await deployTokensOnly(customConfig);

    // Deploy TokenRegisterV3
    const TokenRegisterV3 = await ethers.getContractFactory("TokenRegisterV3");
    const tokenRegisterV3 = await TokenRegisterV3.deploy();
    const registerData = await tokenRegisterV3.interface.encodeFunctionData("initialize", [owner.address]);
    const register = await deployProxy(TokenRegisterV3, tokenRegisterV3.address, registerData);
    await register.connect(owner).setBaseFeeReceiver(owner.address);

    // Deploy vaults
    const vaultWToken = await deployVault(wtoken, config.vaults.wToken.name, config.vaults.wToken.symbol);
    const vaultUToken = await deployVault(usdt, config.vaults.usdt.name, config.vaults.usdt.symbol);

    // Configure token registrations
    await configureTokenRegistration(register, wtoken, vaultWToken, config.chains, config, owner);
    await configureTokenRegistration(register, usdt, vaultUToken, config.chains, config, owner);

    return {
        register,
        wtoken,
        usdt,
        vaultWToken,
        vaultUToken,
        deployer,
        owner,
        other,
        attacker,
        user1,
        user2
    };
}

/**
 * Deploy only Bridge and its dependencies
 * @param {Object} customConfig - Custom configuration (optional)
 * @returns {Promise<Object>} Deployed contracts
 */
async function deployBridgeOnly(customConfig = {}) {
    const config = { ...DEFAULT_CONFIG, ...customConfig };
    const [deployer, owner, other, attacker, user1, user2] = await ethers.getSigners();

    // Deploy tokens
    const { wtoken, usdt } = await deployTokensOnly(customConfig);

    // Deploy AuthorityManager
    const AuthorityManager = await ethers.getContractFactory("AuthorityManager");
    const authority = await AuthorityManager.deploy(deployer.address);

    // Deploy Bridge
    const Bridge = await ethers.getContractFactory("Bridge");
    const bridge = await Bridge.deploy();
    const bridgeData = await Bridge.interface.encodeFunctionData("initialize", [wtoken.address, authority.address]);
    const bridgeProxy = await deployProxy(Bridge, bridge.address, bridgeData);

    // Configure bridge permissions
    const bridgeFunctions = [
        "registerTokenChains",
        "updateTokens",
        "setRelay",
        "setServiceContract",
        "upgradeToAndCall"
    ];
    await configureBridgePermissions(authority, bridgeProxy, bridgeFunctions, deployer);

    // Configure bridge tokens
    await bridgeProxy.connect(deployer).registerTokenChains(wtoken.address, config.chains, true);
    await bridgeProxy.connect(deployer).registerTokenChains(usdt.address, config.chains, true);
    await bridgeProxy.connect(deployer).updateTokens([wtoken.address], 0);
    await bridgeProxy.connect(deployer).updateTokens([usdt.address], 1);

    // Deploy and configure fee service
    const FeeService = await ethers.getContractFactory("FeeService");
    const feeService = await FeeService.deploy(authority.address);
    await bridgeProxy.connect(deployer).setServiceContract(2, feeService.address);
    
    // Configure fee service for test chains
    await feeService.connect(deployer).setBaseGas(97, 100000);
    await feeService.connect(deployer).setChainGasPrice(97, ethers.constants.AddressZero, ethers.utils.parseEther("0.001"));
    await feeService.connect(deployer).setFeeReceiver(deployer.address);
    await feeService.connect(deployer).setTokenDecimals(ethers.constants.AddressZero, 18);
    await feeService.connect(deployer).setBaseGas(212, 100000);
    await feeService.connect(deployer).setChainGasPrice(212, ethers.constants.AddressZero, ethers.utils.parseEther("0.001"));

    // Deploy mock lightnode
    const MockLightnode = await ethers.getContractFactory("MockLightnode");
    const lightnode = await MockLightnode.deploy();
    await bridgeProxy.connect(deployer).setServiceContract(0, wtoken.address);
    await bridgeProxy.connect(deployer).setServiceContract(1, lightnode.address);

    // Deploy mock MOS contract for target chain (97)
    const MockReceiver = await ethers.getContractFactory("MockReceiver");
    const mockMosContract = await MockReceiver.deploy();
    
    // Set relay for target chain (97) - this sets the MOS contract
    await bridgeProxy.connect(deployer).setRelay(97, mockMosContract.address);

    return {
        bridge: bridgeProxy,
        authority,
        feeService,
        wtoken,
        usdt,
        mockMosContract,
        deployer,
        owner,
        other,
        attacker,
        user1,
        user2
    };
}

/**
 * Deploy only Relay and its dependencies
 * @param {Object} customConfig - Custom configuration (optional)
 * @returns {Promise<Object>} Deployed contracts
 */
async function deployRelayOnly(customConfig = {}) {
    const config = { ...DEFAULT_CONFIG, ...customConfig };
    const [deployer, owner, other, attacker, user1, user2] = await ethers.getSigners();

    // Deploy tokens
    const { wtoken, usdt } = await deployTokensOnly(customConfig);

    // Deploy AuthorityManager
    const AuthorityManager = await ethers.getContractFactory("AuthorityManager");
    const authority = await AuthorityManager.deploy(deployer.address);

    // Deploy TokenRegisterV3 (relay needs it)
    const TokenRegisterV3 = await ethers.getContractFactory("TokenRegisterV3");
    const tokenRegisterV3 = await TokenRegisterV3.deploy();
    const registerData = await tokenRegisterV3.interface.encodeFunctionData("initialize", [deployer.address]);
    const register = await deployProxy(TokenRegisterV3, tokenRegisterV3.address, registerData);
    await register.setBaseFeeReceiver(deployer.address);

    // Deploy vaults
    const vaultWToken = await deployVault(wtoken, config.vaults.wToken.name, config.vaults.wToken.symbol);
    const vaultUToken = await deployVault(usdt, config.vaults.usdt.name, config.vaults.usdt.symbol);

    // Configure token registrations
    await configureTokenRegistration(register, wtoken, vaultWToken, config.chains, config, deployer);
    await configureTokenRegistration(register, usdt, vaultUToken, config.chains, config, deployer);

    // Deploy Relay
    const BridgeAndRelay = await ethers.getContractFactory("BridgeAndRelay");
    const bridgeAndRelay = await BridgeAndRelay.deploy();
    const relayData = await BridgeAndRelay.interface.encodeFunctionData("initialize", [wtoken.address, authority.address]);
    const relay = await deployProxy(BridgeAndRelay, bridgeAndRelay.address, relayData);

    // Configure relay permissions
    const relayFunctions = [
        "registerTokenChains",
        "updateTokens",
        "registerChain",
        "setDistributeRate",
        "setServiceContract",
        "upgradeToAndCall"
    ];
    await configureRelayPermissions(authority, relay, relayFunctions, deployer);

    // Configure relay tokens and chains
    await relay.connect(deployer).registerTokenChains(wtoken.address, config.chains, true);
    await relay.connect(deployer).registerTokenChains(usdt.address, config.chains, true);
    await relay.connect(deployer).updateTokens([wtoken.address], 0);
    await relay.connect(deployer).updateTokens([usdt.address], 1);

    // Configure distribute rates
    await relay.connect(deployer).setDistributeRate(0, deployer.address, 100);
    await relay.connect(deployer).setDistributeRate(1, deployer.address, 200);
    await relay.connect(deployer).setDistributeRate(2, deployer.address, 300);

    // Configure relay service contracts
    await relay.connect(deployer).setServiceContract(0, wtoken.address);
    await relay.connect(deployer).setServiceContract(4, register.address);

    // Deploy mock lightnode manager
    const MockLightnodeManager = await ethers.getContractFactory("MockLightnodeManager");
    const lightnodeManager = await MockLightnodeManager.deploy();
    await relay.connect(deployer).setServiceContract(1, lightnodeManager.address);

    // Grant vault permissions to relay
    await vaultWToken.grantRole(await vaultWToken.MANAGER_ROLE(), relay.address);
    await vaultUToken.grantRole(await vaultUToken.MANAGER_ROLE(), relay.address);

    // Deploy and configure fee service
    const FeeService = await ethers.getContractFactory("FeeService");
    const feeService = await FeeService.deploy(authority.address);
    await relay.connect(deployer).setServiceContract(2, feeService.address);
    await feeService.connect(deployer).setBaseGas(97, 100000);
    await feeService.connect(deployer).setChainGasPrice(97, ethers.constants.AddressZero, ethers.utils.parseEther("0.001"));
    await feeService.connect(deployer).setFeeReceiver(deployer.address);
    await feeService.connect(deployer).setTokenDecimals(ethers.constants.AddressZero, 18);
    await feeService.connect(deployer).setBaseGas(212, 100000);
    await feeService.connect(deployer).setChainGasPrice(212, ethers.constants.AddressZero, ethers.utils.parseEther("0.001"));

    // Deploy mock MOS contract for target chain (97)
    const MockReceiver = await ethers.getContractFactory("MockReceiver");
    const mockMosContract = await MockReceiver.deploy();
    
    // Register chain with MOS contract for target chain (97)
    await relay.connect(deployer).registerChain([97], [ethers.utils.hexZeroPad(mockMosContract.address, 32)], 1);

    return {
        relay,
        register,
        authority,
        wtoken,
        usdt,
        vaultWToken,
        vaultUToken,
        feeService,
        mockMosContract,
        deployer,
        owner,
        other,
        attacker,
        user1,
        user2
    };
}

/**
 * Deploy Bridge and Relay together (for integration tests)
 * @param {Object} customConfig - Custom configuration (optional)
 * @returns {Promise<Object>} Deployed contracts
 */
async function deployBridgeAndRelay(customConfig = {}) {
    const config = { ...DEFAULT_CONFIG, ...customConfig };
    const [deployer, owner, other, attacker, user1, user2] = await ethers.getSigners();

    // Deploy tokens
    const { wtoken, usdt } = await deployTokensOnly(customConfig);

    // Deploy AuthorityManager
    const AuthorityManager = await ethers.getContractFactory("AuthorityManager");
    const authority = await AuthorityManager.deploy(deployer.address);

    // Deploy TokenRegisterV3
    const TokenRegisterV3 = await ethers.getContractFactory("TokenRegisterV3");
    const tokenRegisterV3 = await TokenRegisterV3.deploy();
    const registerData = await tokenRegisterV3.interface.encodeFunctionData("initialize", [deployer.address]);
    const register = await deployProxy(TokenRegisterV3, tokenRegisterV3.address, registerData);
    await register.setBaseFeeReceiver(deployer.address);

    // Deploy vaults
    const vaultWToken = await deployVault(wtoken, config.vaults.wToken.name, config.vaults.wToken.symbol);
    const vaultUToken = await deployVault(usdt, config.vaults.usdt.name, config.vaults.usdt.symbol);

    // Configure token registrations
    await configureTokenRegistration(register, wtoken, vaultWToken, config.chains, config, deployer);
    await configureTokenRegistration(register, usdt, vaultUToken, config.chains, config, deployer);

    // Deploy Bridge
    const Bridge = await ethers.getContractFactory("Bridge");
    const bridge = await Bridge.deploy();
    const bridgeData = await Bridge.interface.encodeFunctionData("initialize", [wtoken.address, authority.address]);
    const bridgeProxy = await deployProxy(Bridge, bridge.address, bridgeData);

    // Configure bridge permissions
    const bridgeFunctions = [
        "registerTokenChains",
        "updateTokens",
        "setRelay",
        "setServiceContract",
        "upgradeToAndCall"
    ];
    await configureBridgePermissions(authority, bridgeProxy, bridgeFunctions, deployer);

    // Configure bridge tokens
    await bridgeProxy.connect(deployer).registerTokenChains(wtoken.address, config.chains, true);
    await bridgeProxy.connect(deployer).registerTokenChains(usdt.address, config.chains, true);
    await bridgeProxy.connect(deployer).updateTokens([wtoken.address], 0);
    await bridgeProxy.connect(deployer).updateTokens([usdt.address], 1);

    // Deploy Relay
    const BridgeAndRelay = await ethers.getContractFactory("BridgeAndRelay");
    const bridgeAndRelay = await BridgeAndRelay.deploy();
    const relayData = await BridgeAndRelay.interface.encodeFunctionData("initialize", [wtoken.address, authority.address]);
    const relay = await deployProxy(BridgeAndRelay, bridgeAndRelay.address, relayData);

    // Configure relay permissions
    const relayFunctions = [
        "registerTokenChains",
        "updateTokens",
        "registerChain",
        "setDistributeRate",
        "setServiceContract",
        "upgradeToAndCall"
    ];
    await configureRelayPermissions(authority, relay, relayFunctions, deployer);

    // Configure relay tokens and chains
    await relay.connect(deployer).registerTokenChains(wtoken.address, config.chains, true);
    await relay.connect(deployer).registerTokenChains(usdt.address, config.chains, true);
    await relay.connect(deployer).updateTokens([wtoken.address], 0);
    await relay.connect(deployer).updateTokens([usdt.address], 1);

    await relay.connect(deployer).registerChain(config.chains, [bridgeProxy.address, bridgeProxy.address], 1);

    // Configure distribute rates
    await relay.connect(deployer).setDistributeRate(0, deployer.address, 100);
    await relay.connect(deployer).setDistributeRate(1, deployer.address, 200);
    await relay.connect(deployer).setDistributeRate(2, deployer.address, 300);

    // Configure relay service contracts
    await relay.connect(deployer).setServiceContract(0, wtoken.address);
    await relay.connect(deployer).setServiceContract(4, register.address);

    // Deploy mock services
    const MockLightnode = await ethers.getContractFactory("MockLightnode");
    const lightnode = await MockLightnode.deploy();
    const MockLightnodeManager = await ethers.getContractFactory("MockLightnodeManager");
    const lightnodeManager = await MockLightnodeManager.deploy();

    // Configure bridge service contracts
    await bridgeProxy.connect(deployer).setServiceContract(0, wtoken.address);
    await bridgeProxy.connect(deployer).setServiceContract(1, lightnode.address);
    
    // Deploy and configure fee service
    const FeeService = await ethers.getContractFactory("FeeService");
    const feeService = await FeeService.deploy(authority.address);
    await bridgeProxy.connect(deployer).setServiceContract(2, feeService.address);
    
    // Configure fee service for test chains
    await feeService.connect(deployer).setBaseGas(97, 100000);
    await feeService.connect(deployer).setChainGasPrice(97, ethers.constants.AddressZero, ethers.utils.parseEther("0.001"));
    await feeService.connect(deployer).setFeeReceiver(deployer.address);
    await feeService.connect(deployer).setTokenDecimals(ethers.constants.AddressZero, 18);
    await feeService.connect(deployer).setBaseGas(212, 100000);
    await feeService.connect(deployer).setChainGasPrice(212, ethers.constants.AddressZero, ethers.utils.parseEther("0.001"));

    // Configure relay service contracts
    await relay.connect(deployer).setServiceContract(1, lightnodeManager.address);

    // Link bridge and relay
    await bridgeProxy.connect(deployer).setRelay(97, relay.address);

    // Grant vault permissions to relay
    await vaultWToken.grantRole(await vaultWToken.MANAGER_ROLE(), relay.address);
    await vaultUToken.grantRole(await vaultUToken.MANAGER_ROLE(), relay.address);

    return {
        bridge: bridgeProxy,
        relay,
        register,
        authority,
        feeService,
        wtoken,
        usdt,
        vaultWToken,
        vaultUToken,
        deployer,
        owner,
        other,
        attacker,
        user1,
        user2
    };
}

// ==================== LEGACY DEPLOYMENT FUNCTION (for backward compatibility) ====================
/**
 * Deploy all contracts for testing (legacy function for backward compatibility)
 * @param {Object} customConfig - Custom configuration (optional)
 * @returns {Promise<Array>} Array of deployed contracts
 */
async function deploy(customConfig = {}) {
    const contracts = await deployBridgeAndRelay(customConfig);
    
    // Deploy test utilities
    const TestUtil = await ethers.getContractFactory("TestUtil");
    const util = await TestUtil.deploy();

    const MockReceiver = await ethers.getContractFactory("MockReceiver");
    const mockReceiver = await MockReceiver.deploy();

    // Return in the same format as before for backward compatibility
    return [
        contracts.register,
        contracts.wtoken,
        contracts.usdt,
        contracts.bridge,
        contracts.relay,
        util,
        contracts.vaultWToken,
        contracts.vaultUToken,
        mockReceiver
    ];
}

// ==================== TEST UTILITY FUNCTIONS ====================
/**
 * Create a fresh deployment for each test
 * @param {Object} config - Custom configuration
 * @returns {Function} Test fixture function
 */
function createTestFixture(config = {}) {
    return async function () {
        return await deploy(config);
    };
}

/**
 * Generate test data for bridge operations
 * @param {Object} options - Test data options
 * @returns {Object} Test data object
 */
function generateTestData(options = {}) {
    const defaultOptions = {
        amount: ethers.utils.parseEther("1"),
        chainId: 212,
        gasLimit: 100000,
        relay: false,
        referrer: ethers.constants.AddressZero,
        transferId: ethers.utils.keccak256(ethers.utils.toUtf8Bytes("test")),
        swapData: "0x"
    };

    const testData = { ...defaultOptions, ...options };

    return {
        ...testData,
        bridgeData: ethers.utils.defaultAbiCoder.encode(
            ["tuple(bool,address,bytes32,uint256,bytes)"],
            [[testData.relay, testData.referrer, testData.transferId, testData.gasLimit, testData.swapData]]
        )
    };
}

/**
 * Setup test environment with specific configuration
 * @param {Object} config - Test configuration
 * @returns {Promise<Object>} Test environment object
 */
async function setupTestEnvironment(config = {}) {
    const [deployer, owner, other, attacker, user1, user2] = await ethers.getSigners();
    const contracts = await deploy(config);
    const [register, wtoken, usdt, bridge, relay, util, vaultWToken, vaultUToken, mockReceiver] = contracts;

    // Get authority manager from bridge
    const authority = await ethers.getContractAt("AuthorityManager", await bridge.authority());

    return {
        // Contracts
        contracts,
        register,
        wtoken,
        usdt,
        bridge,
        relay,
        util,
        vaultWToken,
        vaultUToken,
        mockReceiver,
        authority,
        
        // Signers
        deployer,
        owner,
        other,
        attacker,
        user1,
        user2,
        
        // Test utilities
        generateTestData,
        config: { ...DEFAULT_CONFIG, ...config },
        
        // Permission testing helpers
        async testRoleGrant(roleId, account, executionDelay = 0) {
            await authority.connect(deployer).grantRole(roleId, account.address, executionDelay);
        },
        
        async testRoleRevoke(roleId, account) {
            await authority.connect(deployer).revokeRole(roleId, account.address);
        },
        
        async testPermissionDenied(contract, signer, functionCall) {
            await expect(functionCall(contract.connect(signer)))
                .to.be.revertedWithCustomError(contract, "AccessManagedUnauthorized");
        },
        
        async testPermissionGranted(contract, signer, functionCall) {
            await expect(functionCall(contract.connect(signer))).to.not.be.reverted;
        }
    };
}

// ==================== EXPORTS ====================
module.exports = {
    // Legacy exports (for backward compatibility)
    deploy,
    createTestFixture,
    generateTestData,
    setupTestEnvironment,
    DEFAULT_CONFIG,
    
    // New specialized deployment functions
    deployTokensOnly,
    deployRegisterOnly,
    deployBridgeOnly,
    deployRelayOnly,
    deployBridgeAndRelay
};
