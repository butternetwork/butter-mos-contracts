const { ethers } = require("hardhat");
const { expect } = require("chai");

describe("Bridge Security Tests", function () {
    let env;
    let bridge, wtoken, usdt, authority, feeService, mockReceiver;
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

        // ==================== DEPLOY BRIDGE ====================
        const Bridge = await ethers.getContractFactory("Bridge");
        const bridgeImpl = await Bridge.deploy();
        const bridgeData = await Bridge.interface.encodeFunctionData("initialize", [wtoken.address, authority.address]);
        
        const OmniServiceProxy = await ethers.getContractFactory("OmniServiceProxy");
        const bridgeProxy = await OmniServiceProxy.deploy(bridgeImpl.address, bridgeData);
        bridge = Bridge.attach(bridgeProxy.address);

        // ==================== DEPLOY LIGHTNODE SERVICES ====================
        const MockLightnode = await ethers.getContractFactory("MockLightnode");
        const lightnode = await MockLightnode.deploy();

        // ==================== DEPLOY FEE SERVICE ====================
        const FeeService = await ethers.getContractFactory("FeeService");
        feeService = await FeeService.deploy(authority.address);

        // ==================== DEPLOY MOCK RECEIVER ====================
        const MockReceiver = await ethers.getContractFactory("MockReceiver");
        mockReceiver = await MockReceiver.deploy();

        // ==================== CONFIGURE BRIDGE ====================
        
        // Configure bridge permissions
        const bridgeFunctions = [
            "registerTokenChains",
            "updateTokens",
            "setRelay",
            "setServiceContract",
            "upgradeToAndCall"
        ];
        const bridgeFunSigs = bridgeFunctions.map(sig => bridge.interface.getSighash(sig));
        await authority.connect(deployer).setTargetFunctionRole(bridge.address, bridgeFunSigs, 0);

        // Configure bridge tokens (chain 212 -> chain 97)
        await bridge.connect(deployer).registerTokenChains(wtoken.address, [97], true);
        await bridge.connect(deployer).registerTokenChains(usdt.address, [97], true);
        await bridge.connect(deployer).updateTokens([wtoken.address], 0);
        await bridge.connect(deployer).updateTokens([usdt.address], 1);

        // Configure bridge service contracts
        await bridge.connect(deployer).setServiceContract(0, wtoken.address);
        await bridge.connect(deployer).setServiceContract(1, lightnode.address);
        await bridge.connect(deployer).setServiceContract(2, feeService.address);

        // Configure fee service for target chain (97)
        await feeService.connect(deployer).setBaseGas(97, 100000);
        await feeService.connect(deployer).setChainGasPrice(97, ethers.constants.AddressZero, ethers.utils.parseEther("0.001"));
        await feeService.connect(deployer).setFeeReceiver(deployer.address);
        await feeService.connect(deployer).setTokenDecimals(ethers.constants.AddressZero, 18);

        // Set relay for chain 97 (bridge is on chain 212, relay is on chain 97)
        await bridge.connect(deployer).setRelay(97, mockReceiver.address);

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

    describe("Pause/Unpause Tests", function () {
        it("Should allow deployer to pause bridge", async function () {
            await expect(bridge.connect(deployer).trigger())
                .to.emit(bridge, "Paused")
                .withArgs(deployer.address);
            
            expect(await bridge.paused()).to.be.true;
        });

        it("Should allow deployer to unpause bridge", async function () {
            await bridge.connect(deployer).trigger();
            
            await expect(bridge.connect(deployer).trigger())
                .to.emit(bridge, "Unpaused")
                .withArgs(deployer.address);
            
            expect(await bridge.paused()).to.be.false;
        });

        it("Should revert pause by non-deployer", async function () {
            await expect(bridge.connect(owner).trigger())
                .to.be.revertedWithCustomError(bridge, "AccessManagedUnauthorized");
        });

        it("Should revert unpause by non-deployer", async function () {
            await bridge.connect(deployer).trigger();
            
            await expect(bridge.connect(owner).trigger())
                .to.be.revertedWithCustomError(bridge, "AccessManagedUnauthorized");
        });

        it("Should revert operations when bridge is paused", async function () {
            await bridge.connect(deployer).trigger();
            
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
            
            await expect(bridge.transferOut(97, messageDataBytes, ethers.constants.AddressZero, {value: fee}))
                .to.be.reverted;
        });
    });

    describe("Access Control Tests", function () {
        it("Should revert registerTokenChains by non-authorized user", async function () {
            const MockToken = await ethers.getContractFactory("MockToken");
            const newToken = await MockToken.deploy("New", "NEW");
            
            await expect(bridge.connect(owner).registerTokenChains(newToken.address, [97], true))
                .to.be.revertedWithCustomError(bridge, "AccessManagedUnauthorized");
        });

        it("Should revert updateTokens by non-authorized user", async function () {
            await expect(bridge.connect(owner).updateTokens([wtoken.address], 0))
                .to.be.revertedWithCustomError(bridge, "AccessManagedUnauthorized");
        });

        it("Should revert setRelay by non-authorized user", async function () {
            await expect(bridge.connect(owner).setRelay(97, mockReceiver.address))
                .to.be.revertedWithCustomError(bridge, "AccessManagedUnauthorized");
        });

        it("Should revert setServiceContract by non-authorized user", async function () {
            await expect(bridge.connect(owner).setServiceContract(0, wtoken.address))
                .to.be.revertedWithCustomError(bridge, "AccessManagedUnauthorized");
        });

        it("Should allow authorized user to registerTokenChains", async function () {
            const MockToken = await ethers.getContractFactory("MockToken");
            const newToken = await MockToken.deploy("New", "NEW");
            
            await expect(bridge.connect(deployer).registerTokenChains(newToken.address, [97], true))
                .to.not.be.reverted;
        });

        it("Should allow authorized user to updateTokens", async function () {
            await expect(bridge.connect(deployer).updateTokens([wtoken.address], 0))
                .to.not.be.reverted;
        });

        it("Should allow authorized user to setRelay", async function () {
            await expect(bridge.connect(deployer).setRelay(97, mockReceiver.address))
                .to.not.be.reverted;
        });

        it("Should allow authorized user to setServiceContract", async function () {
            await expect(bridge.connect(deployer).setServiceContract(0, wtoken.address))
                .to.not.be.reverted;
        });
    });

    describe("Upgrade Tests", function () {
        it("Should allow deployer to upgrade bridge implementation", async function () {
            const Bridge = await ethers.getContractFactory("Bridge");
            const newBridgeImpl = await Bridge.deploy();
            
            await expect(bridge.connect(deployer).upgradeToAndCall(newBridgeImpl.address, "0x"))
                .to.not.be.reverted;
        });

        it("Should revert upgrade by non-deployer", async function () {
            const Bridge = await ethers.getContractFactory("Bridge");
            const newBridgeImpl = await Bridge.deploy();
            
            await expect(bridge.connect(owner).upgradeToAndCall(newBridgeImpl.address, "0x"))
                .to.be.revertedWithCustomError(bridge, "AccessManagedUnauthorized");
        });

        it("Should maintain state after upgrade", async function () {
            const Bridge = await ethers.getContractFactory("Bridge");
            const newBridgeImpl = await Bridge.deploy();
            
            await bridge.connect(deployer).upgradeToAndCall(newBridgeImpl.address, "0x");
            
            // Check that state is maintained
            expect(await bridge.getServiceContract(0)).to.equal(wtoken.address);
            expect(await bridge.authority()).to.equal(authority.address);
            expect(await bridge.selfChainId()).to.equal(212);
        });
    });

    describe("Configuration Validation Tests", function () {
        it("Should revert setRelay with zero address", async function () {
            await expect(bridge.connect(deployer).setRelay(97, ethers.constants.AddressZero))
                .to.be.reverted;
        });

        it("Should revert setServiceContract with zero address", async function () {
            await expect(bridge.connect(deployer).setServiceContract(0, ethers.constants.AddressZero))
                .to.be.reverted;
        });

        it("Should handle registerTokenChains with empty chains array", async function () {
            // This should not revert, just not register any chains
            await expect(bridge.connect(deployer).registerTokenChains(wtoken.address, [], true))
                .to.not.be.reverted;
        });

        it("Should handle updateTokens with empty tokens array", async function () {
            // This should not revert, just not update any tokens
            await expect(bridge.connect(deployer).updateTokens([], 0))
                .to.not.be.reverted;
        });
    });

    describe("Emergency Tests", function () {
        it("Should allow deployer to withdraw fees", async function () {
            // Send some tokens to bridge contract to create fees
            await usdt.transfer(bridge.address, ethers.utils.parseEther("1"));
            
            const balanceBefore = await usdt.balanceOf(deployer.address);
            await bridge.connect(deployer).withdrawFee(deployer.address, usdt.address);
            const balanceAfter = await usdt.balanceOf(deployer.address);
            
            // Should emit WithdrawFee event
            expect(await bridge.feeList(deployer.address, usdt.address)).to.equal(0);
        });

        it("Should allow anyone to withdraw fees", async function () {
            // Send some tokens to bridge contract to create fees
            await usdt.transfer(bridge.address, ethers.utils.parseEther("1"));
            
            // Anyone should be able to withdraw fees
            await expect(bridge.connect(owner).withdrawFee(owner.address, usdt.address))
                .to.emit(bridge, "WithdrawFee");
        });

        it("Should allow deployer to withdraw native fees", async function () {
            // Send some ETH to bridge contract to create fees
            await deployer.sendTransaction({ to: bridge.address, value: ethers.utils.parseEther("1") });
            
            await expect(bridge.connect(deployer).withdrawFee(deployer.address, ethers.constants.AddressZero))
                .to.emit(bridge, "WithdrawFee");
        });

        it("Should allow anyone to withdraw native fees", async function () {
            // Send some ETH to bridge contract to create fees
            await deployer.sendTransaction({ to: bridge.address, value: ethers.utils.parseEther("1") });
            
            // Anyone should be able to withdraw fees
            await expect(bridge.connect(owner).withdrawFee(owner.address, ethers.constants.AddressZero))
                .to.emit(bridge, "WithdrawFee");
        });
    });

    describe("State Validation Tests", function () {
        it("Should validate bridge initialization state", async function () {
            expect(await bridge.getServiceContract(0)).to.equal(wtoken.address);
            expect(await bridge.authority()).to.equal(authority.address);
            expect(await bridge.selfChainId()).to.equal(212);
            expect(await bridge.paused()).to.be.false;
        });

        it("Should validate token registration state", async function () {
            expect(await bridge.isBridgeable(wtoken.address, 97)).to.be.true;
            expect(await bridge.isBridgeable(usdt.address, 97)).to.be.true;
            expect(await bridge.isBridgeable(ethers.constants.AddressZero, 97)).to.be.false;
        });

        it("Should validate service contract state", async function () {
            expect(await bridge.getServiceContract(0)).to.equal(wtoken.address);
            expect(await bridge.getServiceContract(1)).to.not.equal(ethers.constants.AddressZero);
            expect(await bridge.getServiceContract(2)).to.not.equal(ethers.constants.AddressZero);
        });

        it("Should validate relay state", async function () {
            const [relayChainId, relayAddress] = await bridge.getRelay();
            expect(relayChainId).to.equal(97);
            expect(relayAddress).to.equal(mockReceiver.address);
        });
    });
}); 