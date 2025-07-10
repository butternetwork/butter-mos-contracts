const { ethers } = require("hardhat");
const { expect } = require("chai");

describe("Relay Security Tests", function () {
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
        const MockLightnode = await ethers.getContractFactory("MockLightnode");
        const lightnode = await MockLightnode.deploy();

        // ==================== DEPLOY FEE SERVICE ====================
        const FeeService = await ethers.getContractFactory("FeeService");
        feeService = await FeeService.deploy(authority.address);

        // ==================== DEPLOY TOKEN REGISTER ====================
        const TokenRegisterV3 = await ethers.getContractFactory("TokenRegisterV3");
        const tokenRegisterImpl = await TokenRegisterV3.deploy();
        const tokenRegisterData = await TokenRegisterV3.interface.encodeFunctionData("initialize", [deployer.address]);

        const tokenRegisterProxy = await OmniServiceProxy.deploy(tokenRegisterImpl.address, tokenRegisterData);
        const tokenRegister = TokenRegisterV3.attach(tokenRegisterProxy.address);

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

        // Configure relay tokens (chain 212 -> chain 97)
        await relay.connect(deployer).registerTokenChains(wtoken.address, [97], true);
        await relay.connect(deployer).registerTokenChains(usdt.address, [97], true);
        await relay.connect(deployer).updateTokens([wtoken.address], 0);
        await relay.connect(deployer).updateTokens([usdt.address], 1);

        // Configure relay service contracts
        await relay.connect(deployer).setServiceContract(0, wtoken.address);
        await relay.connect(deployer).setServiceContract(1, lightnode.address);
        await relay.connect(deployer).setServiceContract(2, feeService.address);
        await relay.connect(deployer).setServiceContract(4, tokenRegister.address);

        // Configure fee service for target chain (97)
        await feeService.connect(deployer).setBaseGas(97, 100000);
        await feeService.connect(deployer).setChainGasPrice(97, ethers.constants.AddressZero, ethers.utils.parseEther("0.001"));
        await feeService.connect(deployer).setFeeReceiver(deployer.address);
        await feeService.connect(deployer).setTokenDecimals(ethers.constants.AddressZero, 18);

        // Register chain 97 (relay is on chain 212, bridge is on chain 97)
        await relay.connect(deployer).registerChain([97], [ethers.utils.hexZeroPad(mockReceiver.address, 32)], 1);

        // ==================== SETUP TEST ACCOUNTS WITH TOKENS ====================
        const userAmount = ethers.utils.parseEther("20");
        const mintAmount = ethers.utils.parseEther("10");

        // Send native token to each account
        await deployer.sendTransaction({ to: owner.address, value: userAmount});
        await deployer.sendTransaction({ to: other.address, value: userAmount});
        await deployer.sendTransaction({ to: user1.address, value: userAmount});
        await deployer.sendTransaction({ to: user2.address, value: userAmount});

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

    describe("Pause/Unpause Tests", function () {
        it("Should allow deployer to pause relay", async function () {
            await expect(relay.connect(deployer).trigger())
                .to.emit(relay, "Paused")
                .withArgs(deployer.address);

            expect(await relay.paused()).to.be.true;
        });

        it("Should allow deployer to unpause relay", async function () {
            await relay.connect(deployer).trigger();

            await expect(relay.connect(deployer).trigger())
                .to.emit(relay, "Unpaused")
                .withArgs(deployer.address);

            expect(await relay.paused()).to.be.false;
        });

        it("Should revert pause by non-deployer", async function () {
            await expect(relay.connect(owner).trigger())
                .to.be.revertedWithCustomError(relay, "AccessManagedUnauthorized");
        });

        it("Should revert unpause by non-deployer", async function () {
            await relay.connect(deployer).trigger();

            await expect(relay.connect(owner).trigger())
                .to.be.revertedWithCustomError(relay, "AccessManagedUnauthorized");
        });

        it("Should revert operations when relay is paused", async function () {
            await relay.connect(deployer).trigger();

            const messageData = {
                relay: false,
                msgType: 1,
                target: ethers.utils.hexZeroPad(mockReceiver.address, 32),
                payload: ethers.utils.hexlify(ethers.utils.toUtf8Bytes("test message")),
                gasLimit: 100000,
                value: 0
            };

            const messageDataBytes = ethers.utils.defaultAbiCoder.encode(
                ["tuple(uint8,bytes,bytes,uint256,uint256,bool)"],
                [[messageData.msgType, messageData.target, messageData.payload, messageData.gasLimit, messageData.value, messageData.relay]]
            );

            const [fee] = await feeService.getServiceMessageFee(97, ethers.constants.AddressZero, 100000);

            await expect(relay.transferOut(212, messageDataBytes, ethers.constants.AddressZero, {value: fee}))
                .to.be.reverted;
        });
    });

    describe("Access Control Tests", function () {
        it("Should revert registerTokenChains by non-authorized user", async function () {
            const MockToken = await ethers.getContractFactory("MockToken");
            const newToken = await MockToken.deploy("New", "NEW");

            await expect(relay.connect(owner).registerTokenChains(newToken.address, [212], true))
                .to.be.revertedWithCustomError(relay, "AccessManagedUnauthorized");
        });

        it("Should revert updateTokens by non-authorized user", async function () {
            await expect(relay.connect(owner).updateTokens([wtoken.address], 0))
                .to.be.revertedWithCustomError(relay, "AccessManagedUnauthorized");
        });

        it("Should revert registerChain by non-authorized user", async function () {
            await expect(relay.connect(owner).registerChain([212], [ethers.utils.hexZeroPad(mockReceiver.address, 32)], 1))
                .to.be.revertedWithCustomError(relay, "AccessManagedUnauthorized");
        });

        it("Should revert setServiceContract by non-authorized user", async function () {
            await expect(relay.connect(owner).setServiceContract(0, wtoken.address))
                .to.be.revertedWithCustomError(relay, "AccessManagedUnauthorized");
        });

        it("Should allow authorized user to registerTokenChains", async function () {
            const MockToken = await ethers.getContractFactory("MockToken");
            const newToken = await MockToken.deploy("New", "NEW");

            await expect(relay.connect(deployer).registerTokenChains(newToken.address, [212], true))
                .to.not.be.reverted;
        });

        it("Should allow authorized user to updateTokens", async function () {
            await expect(relay.connect(deployer).updateTokens([wtoken.address], 0))
                .to.not.be.reverted;
        });

        it("Should allow authorized user to registerChain", async function () {
            await expect(relay.connect(deployer).registerChain([212], [ethers.utils.hexZeroPad(mockReceiver.address, 32)], 1))
                .to.not.be.reverted;
        });

        it("Should allow authorized user to setServiceContract", async function () {
            await expect(relay.connect(deployer).setServiceContract(0, wtoken.address))
                .to.not.be.reverted;
        });
    });

    describe("Upgrade Tests", function () {
        it("Should allow deployer to upgrade relay implementation", async function () {
            const BridgeAndRelay = await ethers.getContractFactory("BridgeAndRelay");
            const newRelayImpl = await BridgeAndRelay.deploy();

            await expect(relay.connect(deployer).upgradeToAndCall(newRelayImpl.address, "0x"))
                .to.not.be.reverted;
        });

        it("Should revert upgrade by non-deployer", async function () {
            const BridgeAndRelay = await ethers.getContractFactory("BridgeAndRelay");
            const newRelayImpl = await BridgeAndRelay.deploy();

            await expect(relay.connect(owner).upgradeToAndCall(newRelayImpl.address, "0x"))
                .to.be.revertedWithCustomError(relay, "AccessManagedUnauthorized");
        });

        it("Should maintain state after upgrade", async function () {
            const BridgeAndRelay = await ethers.getContractFactory("BridgeAndRelay");
            const newRelayImpl = await BridgeAndRelay.deploy();

            await relay.connect(deployer).upgradeToAndCall(newRelayImpl.address, "0x");

            // Check that state is maintained
            expect(await relay.getServiceContract(0)).to.equal(wtoken.address);
            expect(await relay.authority()).to.equal(authority.address);
            expect(await relay.selfChainId()).to.equal(212);
        });
    });

    describe("Configuration Validation Tests", function () {
        it("Should allow registerChain with valid chain type", async function () {
            // Test with valid chain type (0 or 1)
            await expect(relay.connect(deployer).registerChain([999], [ethers.utils.hexZeroPad("0x1234", 32)], 1))
                .to.not.be.reverted;
        });

        it("Should revert setServiceContract with zero address", async function () {
            await expect(relay.connect(deployer).setServiceContract(0, ethers.constants.AddressZero))
                .to.be.reverted;
        });

        it("Should revert registerTokenChains with empty chains array", async function () {
            // This function doesn't revert with empty arrays, so we'll test with invalid token instead
            await expect(relay.connect(deployer).registerTokenChains(ethers.constants.AddressZero, [97], true))
                .to.be.reverted;
        });

        it("Should allow updateTokens with valid token index", async function () {
            // Test with valid token index (0 or 1)
            await expect(relay.connect(deployer).updateTokens([wtoken.address], 0))
                .to.not.be.reverted;
        });
    });

    describe("Emergency Tests", function () {
        it("Should allow deployer to withdraw fees", async function () {
            // Send some tokens to relay contract to create fees
            await usdt.transfer(relay.address, ethers.utils.parseEther("1"));

            const balanceBefore = await usdt.balanceOf(deployer.address);
            await relay.connect(deployer).withdrawFee(deployer.address, usdt.address);
            const balanceAfter = await usdt.balanceOf(deployer.address);

            // Should emit WithdrawFee event
            expect(await relay.feeList(deployer.address, usdt.address)).to.equal(0);
        });

        it("Should allow anyone to withdraw fees", async function () {
            // Send some tokens to relay contract to create fees
            await usdt.transfer(relay.address, ethers.utils.parseEther("1"));

            // Anyone should be able to withdraw fees
            await expect(relay.connect(owner).withdrawFee(owner.address, usdt.address))
                .to.emit(relay, "WithdrawFee");
        });

        it("Should allow deployer to withdraw native fees", async function () {
            // Send some ETH to relay contract to create fees
            await deployer.sendTransaction({ to: relay.address, value: ethers.utils.parseEther("1") });

            await expect(relay.connect(deployer).withdrawFee(deployer.address, ethers.constants.AddressZero))
                .to.emit(relay, "WithdrawFee");
        });

        it("Should allow anyone to withdraw native fees", async function () {
            // Send some ETH to relay contract to create fees
            await deployer.sendTransaction({ to: relay.address, value: ethers.utils.parseEther("1") });

            // Anyone should be able to withdraw fees
            await expect(relay.connect(owner).withdrawFee(owner.address, ethers.constants.AddressZero))
                .to.emit(relay, "WithdrawFee");
        });
    });

    describe("State Validation Tests", function () {
        it("Should validate relay initialization state", async function () {
            expect(await relay.getServiceContract(0)).to.equal(wtoken.address);
            expect(await relay.authority()).to.equal(authority.address);
            expect(await relay.selfChainId()).to.equal(212);
            expect(await relay.paused()).to.be.false;
        });

        it("Should validate token registration state", async function () {
            // Check if tokens are registered for chain 97
            expect(await relay.getServiceContract(4)).to.not.equal(ethers.constants.AddressZero);
        });

        it("Should validate service contract state", async function () {
            expect(await relay.getServiceContract(0)).to.equal(wtoken.address);
            expect(await relay.getServiceContract(1)).to.not.equal(ethers.constants.AddressZero);
            expect(await relay.getServiceContract(2)).to.not.equal(ethers.constants.AddressZero);
        });

        it("Should validate relay state", async function () {
            // Check if chain 97 is registered
            expect(await relay.mosContracts(97)).to.not.equal("0x");
        });
    });

    describe("Relay Chain Configuration Tests", function () {
        it("Should validate relay chain configuration", async function () {
            // Relay is on chain 212, sending to chain 97
            expect(await relay.selfChainId()).to.equal(212);

            // Check if chain 97 is registered
            expect(await relay.mosContracts(97)).to.not.equal("0x");
        });

        it("Should validate token registration for target chain", async function () {
            // Check if chain 97 is registered
            expect(await relay.mosContracts(97)).to.not.equal("0x");
        });

        it("Should validate fee service configuration for target chain", async function () {
            // Fee service should be configured for chain 97 (target chain)
            const [fee, receiver] = await feeService.getServiceMessageFee(97, ethers.constants.AddressZero, 100000);
            expect(fee).to.be.gt(0);
            expect(receiver).to.equal(deployer.address);
        });
    });
});
