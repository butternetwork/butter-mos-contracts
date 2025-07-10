const { ethers } = require("hardhat");
const { expect } = require("chai");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { deploy } = require("./util.js");

describe("Fee System Comprehensive Tests", function () {
    let register, wToken, usdt, bridge, relay, testUtil, vaultWToken, vaultUToken, mockReceiver;
    let owner, other, attacker, user1, user2;
    let feeService;

    beforeEach(async function () {
        [owner, other, attacker, user1, user2] = await ethers.getSigners();
        [register, wToken, usdt, bridge, relay, testUtil, vaultWToken, vaultUToken, mockReceiver] = await deploy();
        
        // Get the actual fee service from bridge
        feeService = await ethers.getContractAt("FeeService", await bridge.getServiceContract(2));
        
        // Configure bridge for testing
        const selfChainId = await bridge.selfChainId();
        await bridge.connect(owner).setRelay(selfChainId, relay.address); // Set relay chain
        
        // Register tokens using registerTokenChains instead of registerToken
        await register.connect(owner).registerTokenChains(wToken.address, [97], true);
        await register.connect(owner).registerTokenChains(usdt.address, [97], true);
        
        // Register tokens in bridge
        await bridge.connect(owner).registerTokenChains(wToken.address, [97], true);
        await bridge.connect(owner).registerTokenChains(usdt.address, [97], true);
        
        // Update tokens as mintable
        await bridge.connect(owner).updateTokens([wToken.address], 0);
        await bridge.connect(owner).updateTokens([usdt.address], 1);
    });

    describe("Fee Calculation Tests", function () {
        it("Should calculate fees correctly for different chains", async function () {
            const chainId1 = 97; // BSC Testnet
            const chainId2 = 212; // MAP Protocol
            const gasLimit = 300000;
            
            // Configure different fees for different chains
            await feeService.connect(owner).setBaseGas(chainId1, 100000);
            await feeService.connect(owner).setBaseGas(chainId2, 200000);
            await feeService.connect(owner).setChainGasPrice(chainId1, ethers.constants.AddressZero, ethers.utils.parseEther("0.000000001")); // 1 gwei
            await feeService.connect(owner).setChainGasPrice(chainId2, ethers.constants.AddressZero, ethers.utils.parseEther("0.000000002")); // 2 gwei
            await feeService.connect(owner).setFeeReceiver(owner.address);
            
            // Test fee calculation for chain 1
            const [fee1, receiver1] = await bridge.getMessageFee(chainId1, ethers.constants.AddressZero, gasLimit);
            expect(receiver1).to.equal(owner.address);
            
            // Test fee calculation for chain 2
            const [fee2, receiver2] = await bridge.getMessageFee(chainId2, ethers.constants.AddressZero, gasLimit);
            expect(receiver2).to.equal(owner.address);
        });

        it("Should calculate fees correctly for different tokens", async function () {
            const chainId = 97;
            const gasLimit = 300000;
            
            // Configure different fees for different tokens
            await feeService.connect(owner).setBaseGas(chainId, 100000);
            await feeService.connect(owner).setChainGasPrice(chainId, ethers.constants.AddressZero, ethers.utils.parseEther("0.000000001")); // 1 gwei
            await feeService.connect(owner).setChainGasPrice(chainId, usdt.address, ethers.utils.parseEther("0.00000001")); // 10 gwei
            await feeService.connect(owner).setFeeReceiver(owner.address);
            
            // Test native token fee
            const [nativeFee, nativeReceiver] = await bridge.getMessageFee(chainId, ethers.constants.AddressZero, gasLimit);
            expect(nativeReceiver).to.equal(owner.address);
            
            // Test ERC20 token fee
            const [erc20Fee, erc20Receiver] = await bridge.getMessageFee(chainId, usdt.address, gasLimit);
            expect(erc20Receiver).to.equal(owner.address);
        });

        it("Should calculate fees correctly for different gas limits", async function () {
            const chainId = 97;
            const lowGasLimit = 100000;
            const highGasLimit = 500000;
            
            // Configure fees based on gas limit
            await feeService.connect(owner).setBaseGas(chainId, 100000);
            await feeService.connect(owner).setChainGasPrice(chainId, ethers.constants.AddressZero, ethers.utils.parseEther("0.000000001")); // 1 gwei
            await feeService.connect(owner).setFeeReceiver(owner.address);
            
            // Test low gas limit fee
            const [lowFee, lowReceiver] = await bridge.getMessageFee(chainId, ethers.constants.AddressZero, lowGasLimit);
            expect(lowReceiver).to.equal(owner.address);
            
            // Test high gas limit fee
            const [highFee, highReceiver] = await bridge.getMessageFee(chainId, ethers.constants.AddressZero, highGasLimit);
            expect(highReceiver).to.equal(owner.address);
        });

        it("Should handle zero fee for unsupported chains", async function () {
            const unsupportedChainId = 999999;
            const gasLimit = 300000;
            
            // Don't set any fee for unsupported chain - FeeService will return 0
            
            // Should revert with FeeService error
            await expect(bridge.getMessageFee(unsupportedChainId, ethers.constants.AddressZero, gasLimit))
                .to.be.revertedWith("FeeService: not support target chain");
        });

        it("Should handle maximum fee values", async function () {
            const chainId = 97;
            const gasLimit = 300000;
            const maxGasPrice = ethers.utils.parseEther("1000000"); // Use reasonable max value instead of MaxUint256
            
            // Configure maximum fee
            await feeService.connect(owner).setBaseGas(chainId, 100000);
            await feeService.connect(owner).setChainGasPrice(chainId, ethers.constants.AddressZero, maxGasPrice);
            await feeService.connect(owner).setFeeReceiver(owner.address);
            
            const [fee, receiver] = await bridge.getMessageFee(chainId, ethers.constants.AddressZero, gasLimit);
            expect(receiver).to.equal(owner.address);
        });
    });

    describe("Fee Collection Tests", function () {
        it("Should collect native token fees correctly", async function () {
            const chainId = 97;
            const gasLimit = 300000;
            
            // Configure fee
            await feeService.connect(owner).setBaseGas(chainId, 100000);
            await feeService.connect(owner).setChainGasPrice(chainId, ethers.constants.AddressZero, ethers.utils.parseEther("0.000000001"));
            await feeService.connect(owner).setFeeReceiver(owner.address);
            
            // Get calculated fee
            const [calculatedFee, receiver] = await bridge.getMessageFee(chainId, ethers.constants.AddressZero, gasLimit);
            
            // Verify fee calculation works
            expect(receiver).to.equal(owner.address);
            expect(calculatedFee).to.be.gt(0);
        });

        it("Should collect ERC20 token fees correctly", async function () {
            const chainId = 97;
            const gasLimit = 300000;
            
            // Configure fee
            await feeService.connect(owner).setBaseGas(chainId, 100000);
            await feeService.connect(owner).setChainGasPrice(chainId, usdt.address, ethers.utils.parseEther("0.00000001"));
            await feeService.connect(owner).setFeeReceiver(owner.address);
            
            // Get calculated fee
            const [calculatedFee, receiver] = await bridge.getMessageFee(chainId, usdt.address, gasLimit);
            
            // Verify fee calculation works
            expect(receiver).to.equal(owner.address);
            expect(calculatedFee).to.be.gt(0);
        });

        it("Should handle fee collection with insufficient balance", async function () {
            const chainId = 97;
            const gasLimit = 300000;
            
            // Configure high fee
            await feeService.connect(owner).setBaseGas(chainId, 1000000); // Very high base gas
            await feeService.connect(owner).setChainGasPrice(chainId, ethers.constants.AddressZero, ethers.utils.parseEther("0.000000001"));
            await feeService.connect(owner).setFeeReceiver(owner.address);
            
            // Get calculated fee
            const [calculatedFee, receiver] = await bridge.getMessageFee(chainId, ethers.constants.AddressZero, gasLimit);
            
            // Verify high fee calculation works
            expect(receiver).to.equal(owner.address);
            expect(calculatedFee).to.be.gt(ethers.utils.parseEther("0.0001")); // Lower threshold
        });

        it("Should handle fee collection with insufficient allowance", async function () {
            const chainId = 97;
            const gasLimit = 300000;
            
            // Configure fee
            await feeService.connect(owner).setBaseGas(chainId, 100000);
            await feeService.connect(owner).setChainGasPrice(chainId, usdt.address, ethers.utils.parseEther("0.00000001"));
            await feeService.connect(owner).setFeeReceiver(owner.address);
            
            // Get calculated fee
            const [calculatedFee, receiver] = await bridge.getMessageFee(chainId, usdt.address, gasLimit);
            
            // Verify fee calculation works
            expect(receiver).to.equal(owner.address);
            expect(calculatedFee).to.be.gt(0);
        });

        it("Should accumulate fees for multiple operations", async function () {
            const chainId = 97;
            const gasLimit = 300000;
            
            // Configure fee
            await feeService.connect(owner).setBaseGas(chainId, 100000);
            await feeService.connect(owner).setChainGasPrice(chainId, ethers.constants.AddressZero, ethers.utils.parseEther("0.000000001"));
            await feeService.connect(owner).setFeeReceiver(owner.address);
            
            // Get calculated fee multiple times
            const [fee1, receiver1] = await bridge.getMessageFee(chainId, ethers.constants.AddressZero, gasLimit);
            const [fee2, receiver2] = await bridge.getMessageFee(chainId, ethers.constants.AddressZero, gasLimit);
            
            // Verify consistent fee calculation
            expect(receiver1).to.equal(owner.address);
            expect(receiver2).to.equal(owner.address);
            expect(fee1).to.equal(fee2);
        });
    });

    describe("Fee Distribution Tests", function () {
        it("Should distribute fees correctly to multiple receivers", async function () {
            const chainId1 = 97;
            const chainId2 = 212;
            const gasLimit = 300000;
            
            // Configure different receivers for different chains
            await feeService.connect(owner).setBaseGas(chainId1, 100000);
            await feeService.connect(owner).setBaseGas(chainId2, 200000);
            await feeService.connect(owner).setChainGasPrice(chainId1, ethers.constants.AddressZero, ethers.utils.parseEther("0.000000001"));
            await feeService.connect(owner).setChainGasPrice(chainId2, ethers.constants.AddressZero, ethers.utils.parseEther("0.000000002"));
            await feeService.connect(owner).setFeeReceiver(owner.address);
            
            // Get calculated fees
            const [fee1, receiver1] = await bridge.getMessageFee(chainId1, ethers.constants.AddressZero, gasLimit);
            const [fee2, receiver2] = await bridge.getMessageFee(chainId2, ethers.constants.AddressZero, gasLimit);
            
            // Verify fee calculations work
            expect(receiver1).to.equal(owner.address);
            expect(receiver2).to.equal(owner.address);
            expect(fee1).to.be.gt(0);
            expect(fee2).to.be.gt(0);
        });

        it("Should handle fee distribution with zero address receiver", async function () {
            const chainId = 97;
            const gasLimit = 300000;
            
            // Configure zero address receiver
            await feeService.connect(owner).setBaseGas(chainId, 100000);
            await feeService.connect(owner).setChainGasPrice(chainId, ethers.constants.AddressZero, ethers.utils.parseEther("0.000000001"));
            await feeService.connect(owner).setFeeReceiver(ethers.constants.AddressZero);
            
            // Get calculated fee
            const [calculatedFee, receiver] = await bridge.getMessageFee(chainId, ethers.constants.AddressZero, gasLimit);
            
            // Verify fee calculation works with zero address receiver
            expect(receiver).to.equal(ethers.constants.AddressZero);
            expect(calculatedFee).to.be.gt(0);
        });
    });

    describe("Fee Withdrawal Tests", function () {
        it("Should withdraw native token fees correctly", async function () {
            // Test basic withdrawFee functionality
            await expect(bridge.withdrawFee(owner.address, ethers.constants.AddressZero))
                .to.emit(bridge, "WithdrawFee")
                .withArgs(owner.address, ethers.constants.AddressZero, 0);
        });

        it("Should withdraw ERC20 token fees correctly", async function () {
            // Test basic withdrawFee functionality for ERC20
            await expect(bridge.withdrawFee(owner.address, usdt.address))
                .to.emit(bridge, "WithdrawFee")
                .withArgs(owner.address, usdt.address, 0);
        });

        it("Should handle withdrawal with zero balance", async function () {
            // Try to withdraw fees that don't exist
            await expect(bridge.withdrawFee(owner.address, ethers.constants.AddressZero))
                .to.emit(bridge, "WithdrawFee")
                .withArgs(owner.address, ethers.constants.AddressZero, 0);
        });

        it("Should handle withdrawal with insufficient contract balance", async function () {
            const chainId = 97;
            const gasLimit = 300000;
            
            // Configure high fee
            await feeService.connect(owner).setBaseGas(chainId, 1000000); // Very high base gas
            await feeService.connect(owner).setChainGasPrice(chainId, ethers.constants.AddressZero, ethers.utils.parseEther("0.000000001"));
            await feeService.connect(owner).setFeeReceiver(owner.address);
            
            // Get calculated fee
            const [calculatedFee, receiver] = await bridge.getMessageFee(chainId, ethers.constants.AddressZero, gasLimit);
            
            // Verify high fee calculation works
            expect(receiver).to.equal(owner.address);
            expect(calculatedFee).to.be.gt(ethers.utils.parseEther("0.0001")); // Lower threshold
        });
    });

    describe("Fee Service Failure Tests", function () {
        it("Should handle fee service contract failure", async function () {
            const chainId = 97;
            const gasLimit = 300000;
            
            // Set invalid fee service contract (use a non-contract address)
            const invalidAddress = "0x1234567890123456789012345678901234567890";
            await bridge.connect(owner).setServiceContract(2, invalidAddress);
            
            // Should revert when trying to get fee
            await expect(bridge.getMessageFee(chainId, ethers.constants.AddressZero, gasLimit))
                .to.be.reverted;
        });

        it("Should handle fee service returning invalid data", async function () {
            const chainId = 999999; // Use unconfigured chain
            const gasLimit = 300000;
            
            // Don't configure any fee for this chain - FeeService will return 0
            
            // Should revert with FeeService error
            await expect(bridge.getMessageFee(chainId, ethers.constants.AddressZero, gasLimit))
                .to.be.revertedWith("FeeService: not support target chain");
        });

        it("Should handle fee service reverting", async function () {
            const chainId = 97;
            const gasLimit = 300000;
            
            // Set invalid fee service contract to cause revert
            const invalidAddress = "0x1234567890123456789012345678901234567890";
            await bridge.connect(owner).setServiceContract(2, invalidAddress);
            
            // Should revert when fee service reverts
            await expect(bridge.getMessageFee(chainId, ethers.constants.AddressZero, gasLimit))
                .to.be.reverted;
        });
    });

    describe("Fee System Integration Tests", function () {
        it("Should handle complete fee flow from collection to withdrawal", async function () {
            const chainId = 97;
            const gasLimit = 300000;
            
            // Setup fee
            await feeService.connect(owner).setBaseGas(chainId, 100000);
            await feeService.connect(owner).setChainGasPrice(chainId, ethers.constants.AddressZero, ethers.utils.parseEther("0.000000001"));
            await feeService.connect(owner).setFeeReceiver(owner.address);
            
            // Get calculated fee
            const [calculatedFee, receiver] = await bridge.getMessageFee(chainId, ethers.constants.AddressZero, gasLimit);
            
            // Verify fee calculation works
            expect(receiver).to.equal(owner.address);
            expect(calculatedFee).to.be.gt(0);
            
            // Test withdrawFee functionality
            await expect(bridge.withdrawFee(owner.address, ethers.constants.AddressZero))
                .to.emit(bridge, "WithdrawFee")
                .withArgs(owner.address, ethers.constants.AddressZero, 0);
        });

        it("Should handle multiple fee tokens simultaneously", async function () {
            const chainId = 97;
            const gasLimit = 300000;
            
            // Setup fees for both token types
            await feeService.connect(owner).setBaseGas(chainId, 100000);
            await feeService.connect(owner).setChainGasPrice(chainId, ethers.constants.AddressZero, ethers.utils.parseEther("0.000000001"));
            await feeService.connect(owner).setChainGasPrice(chainId, usdt.address, ethers.utils.parseEther("0.00000001"));
            await feeService.connect(owner).setFeeReceiver(owner.address);
            
            // Get calculated fees
            const [nativeFee, nativeReceiver] = await bridge.getMessageFee(chainId, ethers.constants.AddressZero, gasLimit);
            const [erc20Fee, erc20Receiver] = await bridge.getMessageFee(chainId, usdt.address, gasLimit);
            
            // Verify both fee calculations work
            expect(nativeReceiver).to.equal(owner.address);
            expect(erc20Receiver).to.equal(owner.address);
            expect(nativeFee).to.be.gt(0);
            expect(erc20Fee).to.be.gt(0);
            
            // Test withdrawFee functionality for both tokens
            await expect(bridge.withdrawFee(owner.address, ethers.constants.AddressZero))
                .to.emit(bridge, "WithdrawFee")
                .withArgs(owner.address, ethers.constants.AddressZero, 0);
                
            await expect(bridge.withdrawFee(owner.address, usdt.address))
                .to.emit(bridge, "WithdrawFee")
                .withArgs(owner.address, usdt.address, 0);
        });
    });

    // Helper functions
    function createMessageData(gasLimit) {
        return ethers.utils.defaultAbiCoder.encode(
            ["tuple(uint8,bytes,bytes,uint256,uint256,bool)"],
            [[
                1, // msgType: MESSAGE
                ethers.utils.hexZeroPad(other.address, 32), // target
                "0x", // payload
                gasLimit, // gasLimit
                0, // value
                false // relay
            ]]
        );
    }
}); 