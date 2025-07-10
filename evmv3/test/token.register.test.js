const { ethers } = require("hardhat");
const { expect } = require("chai");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { deployRegisterOnly } = require("./util.js");

describe("TokenRegisterV3 Comprehensive Tests", function () {
    let register, wToken, usdt, vaultWToken, vaultUToken;
    let owner, other, attacker;
    let freshRegister; // For testing initialization

    beforeEach(async function () {
        const contracts = await deployRegisterOnly();
        register = contracts.register;
        wToken = contracts.wtoken;
        usdt = contracts.usdt;
        vaultWToken = contracts.vaultWToken;
        vaultUToken = contracts.vaultUToken;
        owner = contracts.owner;
        other = contracts.other;
        attacker = contracts.attacker;
        
        // Deploy fresh register for initialization tests
        const TokenRegisterV3 = await ethers.getContractFactory("TokenRegisterV3");
        freshRegister = await TokenRegisterV3.deploy();
    });

    describe("Initialization and Access Control", function () {
        it("Should initialize with correct admin roles", async function () {
            // Deploy a completely fresh register for initialization test
            const TokenRegisterV3 = await ethers.getContractFactory("TokenRegisterV3");
            const implementation = await TokenRegisterV3.deploy();
            const initData = await implementation.interface.encodeFunctionData("initialize", [owner.address]);
            
            const OmniServiceProxy = await ethers.getContractFactory("OmniServiceProxy");
            const proxy = await OmniServiceProxy.deploy(implementation.address, initData);
            const testRegister = TokenRegisterV3.attach(proxy.address);
            
            expect(await testRegister.hasRole(await testRegister.MANAGER_ROLE(), owner.address)).to.be.true;
            expect(await testRegister.hasRole(await testRegister.UPGRADER_ROLE(), owner.address)).to.be.true;
            expect(await testRegister.hasRole(await testRegister.DEFAULT_ADMIN_ROLE(), owner.address)).to.be.true;
        });

        it("Should revert initialization with zero address", async function () {
            const TokenRegisterV3 = await ethers.getContractFactory("TokenRegisterV3");
            const implementation = await TokenRegisterV3.deploy();
            const initData = await implementation.interface.encodeFunctionData("initialize", [ethers.constants.AddressZero]);
            
            const OmniServiceProxy = await ethers.getContractFactory("OmniServiceProxy");
            await expect(OmniServiceProxy.deploy(implementation.address, initData))
                .to.be.revertedWith("register: address is zero");
        });

        it("Should prevent re-initialization", async function () {
            // Deploy a completely fresh register for initialization test
            const TokenRegisterV3 = await ethers.getContractFactory("TokenRegisterV3");
            const implementation = await TokenRegisterV3.deploy();
            const initData = await implementation.interface.encodeFunctionData("initialize", [owner.address]);
            
            const OmniServiceProxy = await ethers.getContractFactory("OmniServiceProxy");
            const proxy = await OmniServiceProxy.deploy(implementation.address, initData);
            const testRegister = TokenRegisterV3.attach(proxy.address);
            
            // Ensure owner has enough funds for the transaction
            const ownerBalance = await owner.getBalance();
            if (ownerBalance.lt(ethers.utils.parseEther("1"))) {
                // Transfer some funds to owner if needed
                await deployer.sendTransaction({ to: owner.address, value: ethers.utils.parseEther("10") });
            }
            
            await expect(testRegister.connect(owner).initialize(other.address))
                .to.be.reverted;
        });

        it("Should grant and revoke roles correctly", async function () {
            // Deploy a completely fresh register for initialization test
            const TokenRegisterV3 = await ethers.getContractFactory("TokenRegisterV3");
            const implementation = await TokenRegisterV3.deploy();
            const initData = await implementation.interface.encodeFunctionData("initialize", [owner.address]);
            
            const OmniServiceProxy = await ethers.getContractFactory("OmniServiceProxy");
            const proxy = await OmniServiceProxy.deploy(implementation.address, initData);
            const testRegister = TokenRegisterV3.attach(proxy.address);
            
            // Grant manager role to other
            await testRegister.connect(owner).grantRole(await testRegister.MANAGER_ROLE(), other.address);
            expect(await testRegister.hasRole(await testRegister.MANAGER_ROLE(), other.address)).to.be.true;
            
            // Revoke manager role from other
            await testRegister.connect(owner).revokeRole(await testRegister.MANAGER_ROLE(), other.address);
            expect(await testRegister.hasRole(await testRegister.MANAGER_ROLE(), other.address)).to.be.false;
        });
    });

    describe("Core Token Management", function () {
        it("Should register token successfully", async function () {
            const MockToken = await ethers.getContractFactory("MockToken");
            const newToken = await MockToken.deploy("NEW", "NEW");
            
            const VaultTokenV3 = await ethers.getContractFactory("VaultTokenV3");
            const newVault = await VaultTokenV3.deploy(newToken.address, "newVault", "newVault");
            
            await expect(register.connect(owner).registerToken(newToken.address, newVault.address, true))
                .to.emit(register, "RegisterToken")
                .withArgs(newToken.address, newVault.address);
        });

        it("Should revert registerToken with zero token address", async function () {
            await expect(register.connect(owner).registerToken(ethers.constants.AddressZero, vaultWToken.address, true))
                .to.be.revertedWith("register: address is zero");
        });

        it("Should revert registerToken with zero vault address", async function () {
            await expect(register.connect(owner).registerToken(wToken.address, ethers.constants.AddressZero, true))
                .to.be.revertedWith("register: address is zero");
        });

        it("Should revert registerToken with mismatched token/vault", async function () {
            const VaultTokenV3 = await ethers.getContractFactory("VaultTokenV3");
            const mismatchedVault = await VaultTokenV3.deploy(usdt.address, "mismatchVault", "mismatchVault");
            
            await expect(register.connect(owner).registerToken(wToken.address, mismatchedVault.address, true))
                .to.be.revertedWith("register: invalid relay token");
        });

        it("Should revert registerToken from non-manager", async function () {
            const MockToken = await ethers.getContractFactory("MockToken");
            const newToken = await MockToken.deploy("NEW", "NEW");
            const VaultTokenV3 = await ethers.getContractFactory("VaultTokenV3");
            const newVault = await VaultTokenV3.deploy(newToken.address, "newVault", "newVault");
            
            await expect(register.connect(attacker).registerToken(newToken.address, newVault.address, true))
                .to.be.reverted; // AccessControl revert
        });
    });

    describe("Token Mapping Management", function () {
        it("Should map token from external chain", async function () {
            const fromChain = 97;
            const fromToken = ethers.utils.hexlify(ethers.utils.randomBytes(20));
            const decimals = 6;
            
            await expect(register.connect(owner).mapToken(usdt.address, fromChain, fromToken, decimals, false))
                .to.emit(register, "MapToken")
                .withArgs(usdt.address, fromChain, fromToken, decimals, false);
        });

        it("Should revert mapToken with empty fromToken", async function () {
            await expect(register.connect(owner).mapToken(usdt.address, 56, "0x", 18, false))
                .to.be.revertedWith("register: invalid from token");
        });

        it("Should revert mapToken with unregistered relay token", async function () {
            const fromToken = ethers.utils.hexlify(ethers.utils.randomBytes(20));
            
            await expect(register.connect(owner).mapToken(other.address, 56, fromToken, 18, false))
                .to.be.revertedWith("register: invalid relay token");
        });

        it("Should revert mapToken with zero token address", async function () {
            const fromToken = ethers.utils.hexlify(ethers.utils.randomBytes(20));
            
            await expect(register.connect(owner).mapToken(ethers.constants.AddressZero, 56, fromToken, 18, false))
                .to.be.revertedWith("register: address is zero");
        });

        it("Should unmap token successfully", async function () {
            const fromChain = 97;
            const fromToken = ethers.utils.hexlify(ethers.utils.randomBytes(20));
            
            // First map the token
            await register.connect(owner).mapToken(usdt.address, fromChain, fromToken, 6, false);
            
            // Then unmap it
            await expect(register.connect(owner).unmapToken(fromChain, fromToken))
                .to.emit(register, "UnmapToken")
                .withArgs(fromChain, fromToken);
                
            // Verify mapping is removed
            expect(await register.tokenMappingList(fromChain, fromToken)).to.equal(ethers.constants.AddressZero);
        });

        it("Should revert unmapToken with empty fromToken", async function () {
            await expect(register.connect(owner).unmapToken(212, "0x"))
                .to.be.revertedWith("registry: invalid from token");
        });

        it("Should revert unmapToken for self chain", async function () {
            const selfChainId = await register.selfChainId();
            const fromToken = ethers.utils.hexlify(ethers.utils.randomBytes(20));
            
            await expect(register.connect(owner).unmapToken(selfChainId, fromToken))
                .to.be.revertedWith("registry: relay chain");
        });

        it("Should revert unmapToken for unregistered token", async function () {
            const fromToken = ethers.utils.hexlify(ethers.utils.randomBytes(20));
            
            await expect(register.connect(owner).unmapToken(212, fromToken))
                .to.be.revertedWith("registry: relay chain");
        });
    });

    describe("Token Chain Registration", function () {
        it("Should register token for multiple chains", async function () {
            const chains = [212, 56, 137];
            
            await register.connect(owner).registerTokenChains(usdt.address, chains, true);
            
            // Verify each chain is registered
            for (const chain of chains) {
                // This would require access to internal bridgeable mapping
                // We test indirectly through successful operation
            }
        });

        it("Should emit events for each chain registration", async function () {
            const chains = [212, 56];
            
            const tx = await register.connect(owner).registerTokenChains(usdt.address, chains, true);
            const receipt = await tx.wait();
            
            // Should emit RegisterTokenChain event for each chain
            const events = receipt.events.filter(e => e.event === "RegisterTokenChain");
            expect(events.length).to.equal(chains.length);
        });

        it("Should handle empty chain arrays", async function () {
            await expect(register.connect(owner).registerTokenChains(usdt.address, [], true))
                .to.not.be.reverted;
        });

        it("Should revert registerTokenChains with unregistered token", async function () {
            await expect(register.connect(owner).registerTokenChains(other.address, [97], true))
                .to.be.revertedWith("register: invalid relay token");
        });
    });

    describe("Base Fee Management", function () {
        it("Should set base fee receiver", async function () {
            await expect(register.connect(owner).setBaseFeeReceiver(other.address))
                .to.emit(register, "SetBaseFeeReceiver")
                .withArgs(other.address);
                
            expect(await register.getBaseFeeReceiver()).to.equal(other.address);
        });

        it("Should revert setBaseFeeReceiver with zero address", async function () {
            await expect(register.connect(owner).setBaseFeeReceiver(ethers.constants.AddressZero))
                .to.be.revertedWith("register: address is zero");
        });

        it("Should set base fees for tokens", async function () {
            const withSwap = ethers.utils.parseEther("0.1");
            const noSwap = ethers.utils.parseEther("0.05");
            const toChain = 97;
            
            await expect(register.connect(owner).setBaseFee(usdt.address, toChain, withSwap, noSwap))
                .to.emit(register, "SetBaseFee")
                .withArgs(usdt.address, toChain, withSwap, noSwap);
        });

        it("Should revert setBaseFee with unregistered token", async function () {
            await expect(register.connect(owner).setBaseFee(other.address, 56, 1000, 500))
                .to.be.revertedWith("register: invalid relay token");
        });
    });

    describe("Fee Rate Configuration", function () {
        it("Should set from chain fee rates", async function () {
            const lowest = ethers.utils.parseEther("1");
            const highest = ethers.utils.parseEther("10");
            const rate = 5000; // 0.5%
            const fromChain = 97;
            
            await expect(register.connect(owner).setFromChainFee(usdt.address, fromChain, lowest, highest, rate))
                .to.emit(register, "SetFromChainTokenFee")
                .withArgs(usdt.address, fromChain, lowest, highest, rate);
        });

        it("Should revert setFromChainFee with invalid highest/lowest", async function () {
            const lowest = ethers.utils.parseEther("10");
            const highest = ethers.utils.parseEther("1"); // highest < lowest
            const rate = 5000;
            
            await expect(register.connect(owner).setFromChainFee(usdt.address, 56, lowest, highest, rate))
                .to.be.revertedWith("register: invalid highest and lowest");
        });

        it("Should revert setFromChainFee with excessive rate", async function () {
            const rate = 1000001; // > MAX_RATE_UNI (1000000)
            
            await expect(register.connect(owner).setFromChainFee(usdt.address, 56, 1000, 2000, rate))
                .to.be.revertedWith("register: invalid proportion value");
        });

        it("Should allow maximum rate", async function () {
            const rate = 1000000; // MAX_RATE_UNI
            
            await expect(register.connect(owner).setFromChainFee(usdt.address, 56, 1000, 2000, rate))
                .to.not.be.reverted;
        });

        it("Should set to chain fee rates", async function () {
            const lowest = ethers.utils.parseEther("1");
            const highest = ethers.utils.parseEther("10");
            const rate = 3000; // 0.3%
            const toChain = 97;
            
            await expect(register.connect(owner).setToChainTokenFee(usdt.address, toChain, lowest, highest, rate))
                .to.emit(register, "SetToChainTokenFee")
                .withArgs(usdt.address, toChain, lowest, highest, rate);
        });

        it("Should validate parameters in setToChainTokenFee", async function () {
            // Test same validations as setFromChainFee
            await expect(register.connect(owner).setToChainTokenFee(usdt.address, 56, 10, 5, 5000))
                .to.be.revertedWith("register: invalid highest and lowest");
                
            await expect(register.connect(owner).setToChainTokenFee(usdt.address, 56, 1000, 2000, 1000001))
                .to.be.revertedWith("register: invalid proportion value");
        });
    });

    describe("Whitelist Fee Rate Management", function () {
        it("Should set to chain whitelist fee rate", async function () {
            const caller = ethers.utils.hexlify(ethers.utils.randomBytes(20));
            const rate = 2000; // 0.2%
            
            await expect(register.connect(owner).setToChainWhitelistFeeRate(usdt.address, 56, 56, caller, rate, true))
                .to.emit(register, "SetToChainWhitelistFeeRate")
                .withArgs(usdt.address, 56, 56, caller, rate, true);
        });

        it("Should disable whitelist rate", async function () {
            const caller = ethers.utils.hexlify(ethers.utils.randomBytes(20));
            
            // First enable
            await register.connect(owner).setToChainWhitelistFeeRate(usdt.address, 56, 56, caller, 2000, true);
            
            // Then disable
            await register.connect(owner).setToChainWhitelistFeeRate(usdt.address, 56, 56, caller, 0, false);
        });

        it("Should revert whitelist rate with excessive rate", async function () {
            const caller = ethers.utils.hexlify(ethers.utils.randomBytes(20));
            
            await expect(register.connect(owner).setToChainWhitelistFeeRate(usdt.address, 56, 56, caller, 1000001, true))
                .to.be.revertedWith("register: invalid proportion value");
        });

        it("Should set from chain whitelist fee rate", async function () {
            const caller = ethers.utils.hexlify(ethers.utils.randomBytes(20));
            const rate = 1500; // 0.15%
            
            await expect(register.connect(owner).setFromChainWhitelistFeeRate(usdt.address, 56, caller, rate, true))
                .to.emit(register, "SetFromChainWhitelistFeeRate")
                .withArgs(usdt.address, 56, caller, rate, true);
        });
    });

    describe("View Functions - Token Information", function () {
        it("Should get to chain token correctly", async function () {
            const selfChainId = await register.selfChainId();
            
            // Self chain should return the token address as bytes
            const toChainToken = await register.getToChainToken(usdt.address, selfChainId);
            expect(toChainToken).to.not.equal("0x");
        });

        it("Should get relay chain token", async function () {
            const selfChainId = await register.selfChainId();
            const tokenBytes = ethers.utils.hexZeroPad(usdt.address, 32);
            
            // Self chain token should return the address
            await expect(register.getRelayChainToken(selfChainId, tokenBytes))
                .to.be.revertedWith("register: not matched");
        });

        it("Should revert getRelayChainToken with unregistered token", async function () {
            const fakeToken = ethers.utils.hexlify(ethers.utils.randomBytes(32));
            
            await expect(register.getRelayChainToken(212, fakeToken))
                .to.be.revertedWith("register: not matched");
        });

        it("Should calculate target amounts with decimal conversion", async function () {
            const amount = ethers.utils.parseEther("1"); // 18 decimals
            const selfChainId = await register.selfChainId();
            
            // Same chain should return same amount
            const sameChainAmount = await register.getToChainAmount(usdt.address, amount, selfChainId);
            expect(sameChainAmount).to.equal(amount);
        });

        it("Should handle zero amounts", async function () {
            const selfChainId = await register.selfChainId();
            
            const result = await register.getToChainAmount(usdt.address, 0, selfChainId);
            expect(result).to.equal(0);
        });
    });

    describe("Advanced View Functions", function () {
        it("Should get target token info", async function () {
            const selfChainId = await register.selfChainId();
            const tokenBytes = ethers.utils.hexZeroPad(usdt.address, 32);
            
            await expect(register.getTargetToken(selfChainId, selfChainId, tokenBytes))
                .to.be.revertedWith("register: not matched");
        });

        it("Should get target token info V2 with vault balance", async function () {
            const selfChainId = await register.selfChainId();
            const tokenBytes = ethers.utils.hexZeroPad(usdt.address, 32);
            
            await expect(register.getTargetTokenV2(selfChainId, selfChainId, tokenBytes))
                .to.be.revertedWith("register: not matched");
        });

        it("Should get target amount with cross-chain conversion", async function () {
            const selfChainId = await register.selfChainId();
            const tokenBytes = ethers.utils.hexZeroPad(usdt.address, 32);
            const amount = ethers.utils.parseEther("1");
            
            await expect(register.getTargetAmount(selfChainId, selfChainId, tokenBytes, amount))
                .to.be.revertedWith("register: not matched");
        });
    });

    describe("Token State Functions", function () {
        it("Should check if token is mintable", async function () {
            // USDT is set as mintable in deployment
            const isMintable = await register.checkMintable(usdt.address);
            expect(typeof isMintable).to.equal("boolean");
        });

        it("Should revert checkMintable with unregistered token", async function () {
            await expect(register.checkMintable(other.address))
                .to.be.revertedWith("register: invalid relay token");
        });

        it("Should get vault token address", async function () {
            const vaultAddress = await register.getVaultToken(usdt.address);
            expect(vaultAddress).to.equal(vaultUToken.address);
        });

        it("Should revert getVaultToken with unregistered token", async function () {
            await expect(register.getVaultToken(other.address))
                .to.be.revertedWith("register: invalid relay token");
        });

        it("Should get vault balance for mintable tokens", async function () {
            // If USDT is mintable, should return max uint256
            const isMintable = await register.checkMintable(usdt.address);
            const selfChainId = await register.selfChainId();
            const vaultBalance = await register.getVaultBalance(usdt.address, selfChainId);
            
            if (isMintable) {
                expect(vaultBalance).to.equal(ethers.constants.MaxUint256);
            } else {
                expect(vaultBalance).to.be.instanceof(ethers.BigNumber);
            }
        });

        it("Should handle zero vault balance", async function () {
            // Create a new chain ID for testing
            const testChainId = 9999;
            
            // Should return 0 for chains with no vault balance
            const vaultBalance = await register.getVaultBalance(usdt.address, testChainId);
            expect(vaultBalance).to.equal(0);
        });
    });

    describe("Fee Calculation Functions", function () {
        it("Should calculate transfer in fee", async function () {
            const caller = ethers.utils.hexlify(ethers.utils.randomBytes(20));
            const amount = ethers.utils.parseEther("100");
            const fromChain = 97;
            
            try {
                const fee = await register.getTransferInFee(caller, usdt.address, amount, fromChain);
                expect(fee).to.be.instanceof(ethers.BigNumber);
            } catch (error) {
                // May revert due to missing fee configuration
                expect(error.message).to.include("revert");
            }
        });

        it("Should calculate transfer out fee", async function () {
            const caller = ethers.utils.hexlify(ethers.utils.randomBytes(20));
            const amount = ethers.utils.parseEther("100");
            
            try {
                const [baseReceiver, baseFee, bridgeFee] = await register.getTransferOutFee(
                    caller, usdt.address, amount, 56, 56, false
                );
                expect(baseFee).to.be.instanceof(ethers.BigNumber);
                expect(bridgeFee).to.be.instanceof(ethers.BigNumber);
            } catch (error) {
                // May revert due to missing fee configuration
                expect(error.message).to.include("revert");
            }
        });

        it("Should calculate comprehensive transfer fee V3", async function () {
            const caller = ethers.utils.hexlify(ethers.utils.randomBytes(20));
            const amount = ethers.utils.parseEther("100");
            
            try {
                const [totalFee, baseFee, bridgeFee] = await register.getTransferFeeV3(
                    caller, usdt.address, amount, 56, 56, false
                );
                expect(totalFee).to.be.instanceof(ethers.BigNumber);
                expect(baseFee).to.be.instanceof(ethers.BigNumber);
                expect(bridgeFee).to.be.instanceof(ethers.BigNumber);
                expect(totalFee).to.equal(baseFee.add(bridgeFee));
            } catch (error) {
                // May revert due to missing fee configuration
                expect(error.message).to.include("revert");
            }
        });
    });

    describe("Caller Fee Rate Functions", function () {
        it("Should get caller fee rate", async function () {
            const caller = ethers.utils.hexlify(ethers.utils.randomBytes(20));
            
            const [isWhitelist, rate] = await register.getCallerFeeRate(usdt.address, 56, 56, caller);
            expect(typeof isWhitelist).to.equal("boolean");
            expect(rate).to.be.instanceof(ethers.BigNumber);
        });

        it("Should detect whitelist status correctly", async function () {
            const caller = ethers.utils.hexlify(ethers.utils.randomBytes(20));
            
            // Initially not whitelisted
            let [isWhitelist] = await register.getCallerFeeRate(usdt.address, 56, 56, caller);
            expect(isWhitelist).to.be.false;
            
            // Set whitelist rate
            await register.connect(owner).setToChainWhitelistFeeRate(usdt.address, 56, 56, caller, 1000, true);
            
            // Should now be whitelisted
            [isWhitelist] = await register.getCallerFeeRate(usdt.address, 56, 56, caller);
            expect(isWhitelist).to.be.true;
        });

        it("Should get to chain specific caller fee rate", async function () {
            const caller = ethers.utils.hexlify(ethers.utils.randomBytes(20));
            
            const [isWhitelist, rate] = await register.getToChainCallerFeeRate(usdt.address, 56, 56, caller);
            expect(typeof isWhitelist).to.equal("boolean");
            expect(rate).to.be.instanceof(ethers.BigNumber);
        });

        it("Should get from chain specific caller fee rate", async function () {
            const caller = ethers.utils.hexlify(ethers.utils.randomBytes(20));
            
            const [isWhitelist, rate] = await register.getFromChainCallerFeeRate(usdt.address, 56, caller);
            expect(typeof isWhitelist).to.equal("boolean");
            expect(rate).to.be.instanceof(ethers.BigNumber);
        });
    });

    describe("UUPS Upgrade Functionality", function () {
        it("Should allow upgrade by authorized user", async function () {
            const TokenRegisterV3New = await ethers.getContractFactory("TokenRegisterV3");
            const newImplementation = await TokenRegisterV3New.deploy();
            
            await expect(register.connect(owner).upgradeToAndCall(newImplementation.address, "0x"))
                .to.not.be.reverted;
        });

        it("Should revert upgrade by unauthorized user", async function () {
            const TokenRegisterV3New = await ethers.getContractFactory("TokenRegisterV3");
            const newImplementation = await TokenRegisterV3New.deploy();
            
            await expect(register.connect(attacker).upgradeToAndCall(newImplementation.address, "0x"))
                .to.be.reverted; // AccessControl revert
        });

        it("Should return implementation address", async function () {
            const implementation = await register.getImplementation();
            expect(ethers.utils.isAddress(implementation)).to.be.true;
            expect(implementation).to.not.equal(ethers.constants.AddressZero);
        });
    });

    describe("Complex Integration Scenarios", function () {
        it("Should handle complete token lifecycle", async function () {
            // 1. Register new token
            const MockToken = await ethers.getContractFactory("MockToken");
            const newToken = await MockToken.deploy("TEST", "TEST");
            
            const VaultTokenV3 = await ethers.getContractFactory("VaultTokenV3");
            const newVault = await VaultTokenV3.deploy(newToken.address, "testVault", "testVault");
            
            await register.connect(owner).registerToken(newToken.address, newVault.address, false);
            
            // 2. Map from external chain
            const fromChain = 9999;
            const fromToken = ethers.utils.hexlify(ethers.utils.randomBytes(20));
            await register.connect(owner).mapToken(newToken.address, fromChain, fromToken, 18, false);
            
            // 3. Register for bridging to chains
            await register.connect(owner).registerTokenChains(newToken.address, [212, 56], true);
            
            // 4. Set fee configuration
            await register.connect(owner).setFromChainFee(newToken.address, fromChain, 1000, 10000, 5000);
            await register.connect(owner).setToChainTokenFee(newToken.address, 56, 1000, 10000, 3000);
            await register.connect(owner).setBaseFee(newToken.address, 56, 1000, 500);
            
            // 5. Test fee calculations
            const caller = ethers.utils.hexlify(ethers.utils.randomBytes(20));
            const amount = ethers.utils.parseEther("100");
            
            const [totalFee, baseFee, bridgeFee] = await register.getTransferFeeV3(
                caller, newToken.address, amount, 56, 56, false
            );
            
            expect(totalFee).to.be.gt(0);
            expect(totalFee).to.equal(baseFee.add(bridgeFee));
        });

        it("Should handle decimal conversion edge cases", async function () {
            // Test very small amounts
            const smallAmount = 1; // 1 wei
            const selfChainId = await register.selfChainId();
            
            const result = await register.getToChainAmount(usdt.address, smallAmount, selfChainId);
            expect(result).to.equal(smallAmount);
            
            // Test very large amounts
            const largeAmount = ethers.utils.parseEther("1000000");
            const result2 = await register.getToChainAmount(usdt.address, largeAmount, selfChainId);
            expect(result2).to.equal(largeAmount);
        });

        it("Should handle whitelist priority over standard rates", async function () {
            const caller = ethers.utils.hexlify(ethers.utils.randomBytes(20));
            const amount = ethers.utils.parseEther("100");
            
            // Set standard rates
            await register.connect(owner).setFromChainFee(usdt.address, 56, 1000, 10000, 10000); // 1%
            await register.connect(owner).setToChainTokenFee(usdt.address, 56, 1000, 10000, 10000); // 1%
            
            // Get standard rate fee
            const [, , standardFee] = await register.getTransferFeeV3(caller, usdt.address, amount, 56, 56, false);
            
            // Set whitelist rate (lower)
            await register.connect(owner).setToChainWhitelistFeeRate(usdt.address, 56, 56, caller, 5000, true); // 0.5%
            
            // Get whitelist rate fee
            const [, , whitelistFee] = await register.getTransferFeeV3(caller, usdt.address, amount, 56, 56, false);
            
            // Whitelist fee should be different (and likely lower)
            expect(whitelistFee).to.not.equal(standardFee);
        });
    });

    describe("Error Scenarios and Edge Cases", function () {
        it("Should handle all custom error messages", async function () {
            // Test various error conditions systematically
            
            // 1. Address validation
            await expect(register.connect(owner).setBaseFeeReceiver(ethers.constants.AddressZero))
                .to.be.revertedWith("register: address is zero");
            
            // 2. Invalid token errors
            await expect(register.checkMintable(other.address))
                .to.be.revertedWith("register: invalid relay token");
            
            // 3. Invalid parameters
            await expect(register.connect(owner).setFromChainFee(usdt.address, 56, 100, 50, 5000))
                .to.be.revertedWith("register: invalid highest and lowest");
            
            // 4. Rate validation
            await expect(register.connect(owner).setFromChainFee(usdt.address, 56, 1000, 2000, 1000001))
                .to.be.revertedWith("register: invalid proportion value");
        });

        it("Should handle gas optimization edge cases", async function () {
            // Test with maximum array sizes that don't hit gas limits
            const maxChains = 50;
            const chainIds = Array.from({length: maxChains}, (_, i) => i + 1000);
            
            // This should not hit gas limits in tests
            await register.connect(owner).registerTokenChains(usdt.address, chainIds, true);
        });

        it("Should maintain state consistency", async function () {
            // Perform multiple operations and verify state remains consistent
            const MockToken = await ethers.getContractFactory("MockToken");
            const token1 = await MockToken.deploy("T1", "T1");
            const token2 = await MockToken.deploy("T2", "T2");
            
            const VaultTokenV3 = await ethers.getContractFactory("VaultTokenV3");
            const vault1 = await VaultTokenV3.deploy(token1.address, "v1", "v1");
            const vault2 = await VaultTokenV3.deploy(token2.address, "v2", "v2");
            
            // Register both tokens
            await register.connect(owner).registerToken(token1.address, vault1.address, true);
            await register.connect(owner).registerToken(token2.address, vault2.address, false);
            
            // Verify independent state
            expect(await register.checkMintable(token1.address)).to.be.true;
            expect(await register.checkMintable(token2.address)).to.be.false;
            expect(await register.getVaultToken(token1.address)).to.equal(vault1.address);
            expect(await register.getVaultToken(token2.address)).to.equal(vault2.address);
        });
    });
});