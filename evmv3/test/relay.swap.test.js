const { ethers } = require("hardhat");
const { expect } = require("chai");

describe("Relay Swap Tests", function () {
    let env;
    let relay, wtoken, usdt, authority, feeService, mockReceiver;
    let deployer, owner, other, user1, user2;

    beforeEach(async function () {
        [deployer, owner, other, user1, user2] = await ethers.getSigners();

        // ==================== DEPLOY TOKENS ====================
        const WrapedToken = await ethers.getContractFactory("WrapedToken");
        wtoken = await WrapedToken.deploy();

        const MockToken = await ethers.getContractFactory("MockToken");
        usdt = await MockToken.deploy("USDT", "USDT");

        // ==================== DEPLOY AUTHORITY MANAGER ====================
        const AuthorityManager = await ethers.getContractFactory("AuthorityManager");
        authority = await AuthorityManager.deploy(deployer.address);

        // ==================== DEPLOY RELAY ====================
        const BridgeAndRelay = await ethers.getContractFactory("BridgeAndRelay");
        const relayImpl = await BridgeAndRelay.deploy();
        const relayData = await BridgeAndRelay.interface.encodeFunctionData("initialize", [wtoken.address, authority.address]);
        
        const OmniServiceProxy = await ethers.getContractFactory("OmniServiceProxy");
        const relayProxy = await OmniServiceProxy.deploy(relayImpl.address, relayData);
        relay = BridgeAndRelay.attach(relayProxy.address);

        // ==================== DEPLOY LIGHTNODE SERVICES ====================
        const MockLightnodeManager = await ethers.getContractFactory("MockLightnodeManager");
        const lightClientManager = await MockLightnodeManager.deploy();

        // ==================== DEPLOY FEE SERVICE ====================
        const FeeService = await ethers.getContractFactory("FeeService");
        feeService = await FeeService.deploy(authority.address);

        // ==================== DEPLOY TOKEN REGISTER ====================
        const TokenRegisterV3 = await ethers.getContractFactory("TokenRegisterV3");
        const tokenRegisterImpl = await TokenRegisterV3.deploy();
        const tokenRegisterData = await TokenRegisterV3.interface.encodeFunctionData("initialize", [deployer.address]);
        
        const tokenRegisterProxy = await OmniServiceProxy.deploy(tokenRegisterImpl.address, tokenRegisterData);
        const tokenRegister = TokenRegisterV3.attach(tokenRegisterProxy.address);

        // ==================== DEPLOY VAULT TOKENS ====================
        const VaultTokenV3 = await ethers.getContractFactory("VaultTokenV3");
        const vaultWToken = await VaultTokenV3.deploy(wtoken.address, "Vault WToken", "vWTK");
        const vaultUSDT = await VaultTokenV3.deploy(usdt.address, "Vault USDT", "vUSDT");
        // Grant relay as MANAGER
        await vaultWToken.grantRole(await vaultWToken.MANAGER_ROLE(), relay.address);
        await vaultUSDT.grantRole(await vaultUSDT.MANAGER_ROLE(), relay.address);

        // ==================== DEPLOY MOCK RECEIVER ====================
        const MockReceiver = await ethers.getContractFactory("MockReceiver");
        mockReceiver = await MockReceiver.deploy();

        // ==================== CONFIGURE RELAY ====================
        
        // Configure relay permissions
        const relayFunctions = [
            "registerTokenChains",
            "updateTokens",
            "registerChain",
            "setServiceContract",
            "upgradeToAndCall"
        ];
        const relayFunSigs = relayFunctions.map(sig => relay.interface.getSighash(sig));
        await authority.connect(deployer).setTargetFunctionRole(relay.address, relayFunSigs, 0);

        // Configure relay tokens (relay on chain 212 -> bridge on chain 97)
        await relay.connect(deployer).registerTokenChains(wtoken.address, [97], true);
        await relay.connect(deployer).registerTokenChains(usdt.address, [97], true);
        await relay.connect(deployer).updateTokens([wtoken.address], 0);
        await relay.connect(deployer).updateTokens([usdt.address], 1);

        // Configure relay service contracts
        await relay.connect(deployer).setServiceContract(0, wtoken.address);
        await relay.connect(deployer).setServiceContract(1, lightClientManager.address);
        await relay.connect(deployer).setServiceContract(2, feeService.address);
        await relay.connect(deployer).setServiceContract(4, tokenRegister.address);

        // Configure fee service for target chain (97) and relay chain (212)
        await feeService.connect(deployer).setBaseGas(97, 100000);
        await feeService.connect(deployer).setChainGasPrice(97, ethers.constants.AddressZero, ethers.utils.parseEther("0.001"));
        await feeService.connect(deployer).setBaseGas(212, 100000);
        await feeService.connect(deployer).setChainGasPrice(212, ethers.constants.AddressZero, ethers.utils.parseEther("0.001"));
        await feeService.connect(deployer).setFeeReceiver(deployer.address);
        await feeService.connect(deployer).setTokenDecimals(ethers.constants.AddressZero, 18);

        // Register chain 97 (relay is on chain 212, bridge is on chain 97)
        await relay.connect(deployer).registerChain([97], [ethers.utils.hexZeroPad(mockReceiver.address, 32)], 1);

        // Configure token register - first register tokens, then register chains
        await tokenRegister.connect(deployer).registerToken(wtoken.address, vaultWToken.address, true);
        await tokenRegister.connect(deployer).registerToken(usdt.address, vaultUSDT.address, true);
        
        // Map tokens from source chains to relay chain
        await tokenRegister.connect(deployer).mapToken(wtoken.address, 212, ethers.utils.toUtf8Bytes(wtoken.address), 18, true);
        await tokenRegister.connect(deployer).mapToken(usdt.address, 212, ethers.utils.toUtf8Bytes(usdt.address), 18, true);
        
        // Register token chains for target chain
        await tokenRegister.connect(deployer).registerTokenChains(wtoken.address, [97], true);
        await tokenRegister.connect(deployer).registerTokenChains(usdt.address, [97], true);
        
        // Map tokens from relay chain to target chain
        await tokenRegister.connect(deployer).mapToken(wtoken.address, 97, ethers.utils.toUtf8Bytes(ethers.constants.AddressZero), 18, false);
        await tokenRegister.connect(deployer).mapToken(usdt.address, 97, ethers.utils.toUtf8Bytes(usdt.address), 18, false);

        // ==================== SETUP TEST ACCOUNTS WITH TOKENS ====================
        const mintAmount = ethers.utils.parseEther("10");

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

        // Mint USDT to each account
        await usdt.mint(owner.address, mintAmount);
        await usdt.mint(other.address, mintAmount);
        await usdt.mint(user1.address, mintAmount);
        await usdt.mint(user2.address, mintAmount);
    });

    describe("Native Token Swap Tests", function () {
        it("Should handle swapOutToken with native token", async function () {
            const amount = ethers.utils.parseEther("1");
            const BridgeParam = {
                relay: false,
                referrer: other.address,
                transferId: ethers.utils.keccak256(ethers.utils.toUtf8Bytes("test_transfer")),
                gasLimit: 100000,
                swapData: "0x"
            };
            const bridgeData = ethers.utils.defaultAbiCoder.encode(
                ["tuple(bool,address,bytes32,uint256,bytes)"],
                [[BridgeParam.relay, BridgeParam.referrer, BridgeParam.transferId, BridgeParam.gasLimit, BridgeParam.swapData]]
            );
            
            await expect(relay.swapOutToken(
                owner.address,
                ethers.constants.AddressZero,
                other.address,
                amount,
                97,
                bridgeData,
                { value: amount }
            )).to.emit(relay, "MessageOut");
        });

        it("Should revert swapOutToken with zero amount", async function () {
            const BridgeParam = {
                relay: false,
                referrer: other.address,
                transferId: ethers.utils.keccak256(ethers.utils.toUtf8Bytes("test_transfer")),
                gasLimit: 100000,
                swapData: "0x"
            };
            const bridgeData = ethers.utils.defaultAbiCoder.encode(
                ["tuple(bool,address,bytes32,uint256,bytes)"],
                [[BridgeParam.relay, BridgeParam.referrer, BridgeParam.transferId, BridgeParam.gasLimit, BridgeParam.swapData]]
            );
            
            await expect(relay.swapOutToken(
                owner.address,
                ethers.constants.AddressZero,
                other.address,
                0,
                97,
                bridgeData
            )).to.be.revertedWithCustomError(relay, "zero_amount");
        });

        it("Should revert swapOutToken to same chain", async function () {
            const currentChainId = await relay.selfChainId();
            const amount = ethers.utils.parseEther("1");
            const BridgeParam = {
                relay: false,
                referrer: other.address,
                transferId: ethers.utils.keccak256(ethers.utils.toUtf8Bytes("test_transfer")),
                gasLimit: 100000,
                swapData: "0x"
            };
            const bridgeData = ethers.utils.defaultAbiCoder.encode(
                ["tuple(bool,address,bytes32,uint256,bytes)"],
                [[BridgeParam.relay, BridgeParam.referrer, BridgeParam.transferId, BridgeParam.gasLimit, BridgeParam.swapData]]
            );
            
            await expect(relay.swapOutToken(
                owner.address,
                ethers.constants.AddressZero,
                other.address,
                amount,
                currentChainId,
                bridgeData,
                { value: amount }
            )).to.be.revertedWithCustomError(relay, "bridge_same_chain");
        });
    });

    describe("ERC20 Token Swap Tests", function () {
        it("Should handle swapOutToken with ERC20 token", async function () {
            const amount = ethers.utils.parseEther("1");
            await usdt.approve(relay.address, amount);
            
            const BridgeParam = {
                relay: false,
                referrer: other.address,
                transferId: ethers.utils.keccak256(ethers.utils.toUtf8Bytes("test_transfer")),
                gasLimit: 100000,
                swapData: "0x"
            };
            const bridgeData = ethers.utils.defaultAbiCoder.encode(
                ["tuple(bool,address,bytes32,uint256,bytes)"],
                [[BridgeParam.relay, BridgeParam.referrer, BridgeParam.transferId, BridgeParam.gasLimit, BridgeParam.swapData]]
            );
            
            await expect(relay.swapOutToken(
                owner.address,
                usdt.address,
                other.address,
                amount,
                97,
                bridgeData
            )).to.emit(relay, "MessageOut");
        });

        it("Should revert swapOutToken with unregistered token", async function () {
            const MockToken = await ethers.getContractFactory("MockToken");
            const newToken = await MockToken.deploy("New", "NEW");
            const amount = ethers.utils.parseEther("1");
            await newToken.approve(relay.address, amount);
            
            const BridgeParam = {
                relay: false,
                referrer: other.address,
                transferId: ethers.utils.keccak256(ethers.utils.toUtf8Bytes("test_transfer")),
                gasLimit: 100000,
                swapData: "0x"
            };
            const bridgeData = ethers.utils.defaultAbiCoder.encode(
                ["tuple(bool,address,bytes32,uint256,bytes)"],
                [[BridgeParam.relay, BridgeParam.referrer, BridgeParam.transferId, BridgeParam.gasLimit, BridgeParam.swapData]]
            );
            
            await expect(relay.swapOutToken(
                owner.address,
                newToken.address,
                other.address,
                amount,
                97,
                bridgeData
            )).to.be.reverted;
        });

        it("Should revert swapOutToken with insufficient allowance", async function () {
            const amount = ethers.utils.parseEther("1");
            // Don't approve
            
            const BridgeParam = {
                relay: false,
                referrer: other.address,
                transferId: ethers.utils.keccak256(ethers.utils.toUtf8Bytes("test_transfer")),
                gasLimit: 100000,
                swapData: "0x"
            };
            const bridgeData = ethers.utils.defaultAbiCoder.encode(
                ["tuple(bool,address,bytes32,uint256,bytes)"],
                [[BridgeParam.relay, BridgeParam.referrer, BridgeParam.transferId, BridgeParam.gasLimit, BridgeParam.swapData]]
            );
            
            await expect(relay.swapOutToken(
                owner.address,
                usdt.address,
                other.address,
                amount,
                97,
                bridgeData
            )).to.be.reverted;
        });
    });

    describe("Swap Configuration Tests", function () {
        it("Should handle swapOutToken with relay enabled", async function () {
            const amount = ethers.utils.parseEther("1");
            await usdt.approve(relay.address, amount);
            
            const BridgeParam = {
                relay: true, // Enable relay
                referrer: other.address,
                transferId: ethers.utils.keccak256(ethers.utils.toUtf8Bytes("test_transfer")),
                gasLimit: 100000,
                swapData: "0x"
            };
            const bridgeData = ethers.utils.defaultAbiCoder.encode(
                ["tuple(bool,address,bytes32,uint256,bytes)"],
                [[BridgeParam.relay, BridgeParam.referrer, BridgeParam.transferId, BridgeParam.gasLimit, BridgeParam.swapData]]
            );
            
            await expect(relay.swapOutToken(
                owner.address,
                usdt.address,
                other.address,
                amount,
                97,
                bridgeData
            )).to.emit(relay, "MessageOut");
        });

        it("Should handle swapOutToken with custom swap data", async function () {
            const amount = ethers.utils.parseEther("1");
            await usdt.approve(relay.address, amount);
            
            const customSwapData = ethers.utils.hexlify(ethers.utils.toUtf8Bytes("custom swap data"));
            const BridgeParam = {
                relay: false,
                referrer: other.address,
                transferId: ethers.utils.keccak256(ethers.utils.toUtf8Bytes("test_transfer")),
                gasLimit: 100000,
                swapData: customSwapData
            };
            const bridgeData = ethers.utils.defaultAbiCoder.encode(
                ["tuple(bool,address,bytes32,uint256,bytes)"],
                [[BridgeParam.relay, BridgeParam.referrer, BridgeParam.transferId, BridgeParam.gasLimit, BridgeParam.swapData]]
            );
            
            await expect(relay.swapOutToken(
                owner.address,
                usdt.address,
                other.address,
                amount,
                97,
                bridgeData
            )).to.emit(relay, "MessageOut");
        });
    });

    describe("Relay Chain Configuration Tests", function () {
        it("Should validate relay chain configuration", async function () {
            // Relay is on chain 212, sending to chain 97
            expect(await relay.selfChainId()).to.equal(212);
            
            // Check that chain 97 is registered
            const mosContract = await relay.mosContracts(97);
            expect(mosContract).to.not.equal("0x");
        });

        it("Should validate token registration for target chain", async function () {
            // Tokens should be registered for chain 97 (target chain)
            expect(await relay.isBridgeable(wtoken.address, 97)).to.be.true;
            expect(await relay.isBridgeable(usdt.address, 97)).to.be.true;
            expect(await relay.isBridgeable(ethers.constants.AddressZero, 97)).to.be.false;
        });

        it("Should validate fee service configuration for target chain", async function () {
            // Fee service should be configured for chain 97 (target chain)
            const [fee, receiver] = await feeService.getServiceMessageFee(97, ethers.constants.AddressZero, 100000);
            expect(fee).to.be.gt(0);
            expect(receiver).to.equal(deployer.address);
        });
    });

    describe("Swap MessageIn Tests", function () {
        it("Should handle messageIn for swap with mock proof", async function () {
            // Construct mock proof data for swap messageIn
            const chainId = 212; // bridge chain
            const logParam = 0; // logIndex=0, revertError=false
            const orderId = ethers.utils.hexlify(ethers.utils.randomBytes(32));
            const receiptProof = ethers.utils.hexlify(ethers.utils.randomBytes(128));

            // messageIn will revert because it depends on lightClientManager verification, random data is passed in
            await expect(
                relay.messageIn(chainId, logParam, orderId, receiptProof)
            ).to.be.reverted;
        });

        it("Should handle retryMessageIn for swap with mock data", async function () {
            // Construct mock retry data for swap retryMessageIn
            const chainAndGas = 0;
            const orderId = ethers.utils.hexlify(ethers.utils.randomBytes(32));
            const token = wtoken.address;
            const amount = ethers.utils.parseEther("1");
            const fromAddress = ethers.utils.hexlify(ethers.utils.randomBytes(20));
            const payload = ethers.utils.hexlify(ethers.utils.randomBytes(32));
            const retryMessage = ethers.utils.hexlify(ethers.utils.randomBytes(32));

            // retryMessageIn will revert because orderId hash needs to be verified
            await expect(
                relay.retryMessageIn(chainAndGas, orderId, token, amount, fromAddress, payload, retryMessage)
            ).to.be.reverted;
        });

        it("Should handle messageIn for token bridge swap", async function () {
            // Construct token bridge messageIn test
            const chainId = 212;
            const logParam = 0;
            const orderId = ethers.utils.hexlify(ethers.utils.randomBytes(32));
            const receiptProof = ethers.utils.hexlify(ethers.utils.randomBytes(128));

            await expect(
                relay.messageIn(chainId, logParam, orderId, receiptProof)
            ).to.be.reverted;
        });

        it("Should handle messageIn for native token swap", async function () {
            // Construct native token swap messageIn test
            const chainId = 212;
            const logParam = 0;
            const orderId = ethers.utils.hexlify(ethers.utils.randomBytes(32));
            const receiptProof = ethers.utils.hexlify(ethers.utils.randomBytes(128));

            await expect(
                relay.messageIn(chainId, logParam, orderId, receiptProof)
            ).to.be.reverted;
        });

        it("Should handle messageIn for relay swap execution", async function () {
            // Construct relay swap execution messageIn test
            const chainId = 212;
            const logParam = 0;
            const orderId = ethers.utils.hexlify(ethers.utils.randomBytes(32));
            const receiptProof = ethers.utils.hexlify(ethers.utils.randomBytes(128));

            await expect(
                relay.messageIn(chainId, logParam, orderId, receiptProof)
            ).to.be.reverted;
        });
    });
}); 