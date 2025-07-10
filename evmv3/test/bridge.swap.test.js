const { ethers } = require("hardhat");
const { expect } = require("chai");

describe("Bridge Swap Tests", function () {
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

            await expect(bridge.swapOutToken(
                owner.address,
                ethers.constants.AddressZero,
                other.address,
                amount,
                97,
                bridgeData,
                { value: amount }
            )).to.emit(bridge, "MessageOut");
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

            await expect(bridge.swapOutToken(
                owner.address,
                ethers.constants.AddressZero,
                other.address,
                0,
                97,
                bridgeData
            )).to.be.revertedWithCustomError(bridge, "zero_amount");
        });

        it("Should revert swapOutToken to same chain", async function () {
            const currentChainId = await bridge.selfChainId();
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

            await expect(bridge.swapOutToken(
                owner.address,
                ethers.constants.AddressZero,
                other.address,
                amount,
                currentChainId,
                bridgeData,
                { value: amount }
            )).to.be.revertedWithCustomError(bridge, "token_not_registered");
        });
    });

    describe("ERC20 Token Swap Tests", function () {
        it("Should handle swapOutToken with ERC20 token", async function () {
            const amount = ethers.utils.parseEther("1");
            await usdt.approve(bridge.address, amount);

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

            await expect(bridge.swapOutToken(
                owner.address,
                usdt.address,
                other.address,
                amount,
                97,
                bridgeData
            )).to.emit(bridge, "MessageOut");
        });

        it("Should revert swapOutToken with unregistered token", async function () {
            const MockToken = await ethers.getContractFactory("MockToken");
            const newToken = await MockToken.deploy("New", "NEW");
            const amount = ethers.utils.parseEther("1");
            await newToken.approve(bridge.address, amount);

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

            await expect(bridge.swapOutToken(
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

            await expect(bridge.swapOutToken(
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
            await usdt.approve(bridge.address, amount);

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

            await expect(bridge.swapOutToken(
                owner.address,
                usdt.address,
                other.address,
                amount,
                97,
                bridgeData
            )).to.emit(bridge, "MessageOut");
        });

        it("Should handle swapOutToken with custom swap data", async function () {
            const amount = ethers.utils.parseEther("1");
            await usdt.approve(bridge.address, amount);

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

            await expect(bridge.swapOutToken(
                owner.address,
                usdt.address,
                other.address,
                amount,
                97,
                bridgeData
            )).to.emit(bridge, "MessageOut");
        });
    });

});
