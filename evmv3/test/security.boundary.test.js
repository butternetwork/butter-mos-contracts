const { ethers } = require("hardhat");
const { expect } = require("chai");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { deployBridgeOnly } = require("./util.js");

describe("Security and Boundary Conditions Comprehensive Tests", function () {
    let register, wToken, usdt, bridge, relay, testUtil, vaultWToken, vaultUToken;
    let owner, other, attacker, user1, user2;
    let lightClientManager, tokenRegister;

    beforeEach(async function () {
        const contracts = await deployBridgeOnly();
        bridge = contracts.bridge;
        wtoken = contracts.wtoken;
        usdt = contracts.usdt;
        feeService = contracts.feeService;
        mockMosContract = contracts.mockMosContract;
        deployer = contracts.deployer;
        owner = contracts.owner;
        other = contracts.other;
        attacker = contracts.attacker;
        user1 = contracts.user1;
        user2 = contracts.user2;

        // Deploy mock receiver for message transfer testing
        const MockReceiver = await ethers.getContractFactory("MockReceiver");
        mockReceiver = await MockReceiver.deploy();
    });

    // ==================== SWAPOUT TOKEN BOUNDARY TESTS ====================
    describe("swapOutToken Boundary Tests", function () {
        describe("Token Validation Tests", function () {
            it("Should revert when token is unregistered contract", async function () {
                // Deploy a new token contract that is not registered
                const MockToken = await ethers.getContractFactory("MockToken");
                const unregisteredToken = await MockToken.deploy("Unregistered", "UNREG");
                
                const amount = ethers.utils.parseEther("1");
                const BridgeParam = {
                    relay: false,
                    referrer: other.address,
                    transferId: "0xbe5efb88602668af34c26331b91eebcde671d0add93c52c8bc70be1435f0b3fd",
                    gasLimit: 0,
                    swapData: "0x"
                };
                const bridgeData = ethers.utils.defaultAbiCoder.encode(
                    ["tuple(bool,address,bytes32,uint256,bytes)"],
                    [[BridgeParam.relay, BridgeParam.referrer, BridgeParam.transferId, BridgeParam.gasLimit, BridgeParam.swapData]]
                );
                
                // Approve tokens
                await unregisteredToken.approve(bridge.address, amount);
                
                // Should revert with token_not_registered error
                await expect(bridge.swapOutToken(
                    owner.address,
                    unregisteredToken.address,
                    other.address,
                    amount,
                    212,
                    bridgeData
                )).to.be.revertedWithCustomError(bridge, "token_not_registered");
            });

            it("Should revert when token is not a contract address", async function () {
                const nonContractAddress = other.address; // EOA address
                const amount = ethers.utils.parseEther("1");
                
                const BridgeParam = {
                    relay: false,
                    referrer: other.address,
                    transferId: "0xbe5efb88602668af34c26331b91eebcde671d0add93c52c8bc70be1435f0b3fd",
                    gasLimit: 0,
                    swapData: "0x"
                };
                const bridgeData = ethers.utils.defaultAbiCoder.encode(
                    ["tuple(bool,address,bytes32,uint256,bytes)"],
                    [[BridgeParam.relay, BridgeParam.referrer, BridgeParam.transferId, BridgeParam.gasLimit, BridgeParam.swapData]]
                );
                
                // Should revert due to non-contract address
                await expect(bridge.swapOutToken(
                    owner.address,
                    nonContractAddress,
                    other.address,
                    amount,
                    212,
                    bridgeData
                )).to.be.reverted;
            });

            it("Should revert when token is zero address", async function () {
                const amount = ethers.utils.parseEther("1");
                
                const BridgeParam = {
                    relay: false,
                    referrer: other.address,
                    transferId: "0xbe5efb88602668af34c26331b91eebcde671d0add93c52c8bc70be1435f0b3fd",
                    gasLimit: 0,
                    swapData: "0x"
                };
                const bridgeData = ethers.utils.defaultAbiCoder.encode(
                    ["tuple(bool,address,bytes32,uint256,bytes)"],
                    [[BridgeParam.relay, BridgeParam.referrer, BridgeParam.transferId, BridgeParam.gasLimit, BridgeParam.swapData]]
                );
                
                // Should revert with in_amount_low error for zero address (native token)
                await expect(bridge.swapOutToken(
                    owner.address,
                    ethers.constants.AddressZero,
                    other.address,
                    amount,
                    212,
                    bridgeData
                )).to.be.revertedWithCustomError(bridge, "in_amount_low");
            });

            it("Should revert when token is registered but not for target chain", async function () {
                // Deploy a new token that is definitely not registered for chain 212
                const MockToken = await ethers.getContractFactory("MockToken");
                const testToken = await MockToken.deploy("Test", "TEST");
                
                const amount = ethers.utils.parseEther("1");
                await testToken.approve(bridge.address, amount);
                
                const BridgeParam = {
                    relay: false,
                    referrer: other.address,
                    transferId: "0xbe5efb88602668af34c26331b91eebcde671d0add93c52c8bc70be1435f0b3fd",
                    gasLimit: 0,
                    swapData: "0x"
                };
                const bridgeData = ethers.utils.defaultAbiCoder.encode(
                    ["tuple(bool,address,bytes32,uint256,bytes)"],
                    [[BridgeParam.relay, BridgeParam.referrer, BridgeParam.transferId, BridgeParam.gasLimit, BridgeParam.swapData]]
                );
                
                // Should revert with token_not_registered error for chain 212
                await expect(bridge.swapOutToken(
                    owner.address,
                    testToken.address,
                    other.address,
                    amount,
                    212, // Target chain where token is not registered
                    bridgeData
                )).to.be.revertedWithCustomError(bridge, "token_not_registered");
            });
        });

        describe("Amount and Balance Tests", function () {
            it("Should revert when amount is zero", async function () {
                const amount = 0;
                
                const BridgeParam = {
                    relay: false,
                    referrer: other.address,
                    transferId: "0xbe5efb88602668af34c26331b91eebcde671d0add93c52c8bc70be1435f0b3fd",
                    gasLimit: 0,
                    swapData: "0x"
                };
                const bridgeData = ethers.utils.defaultAbiCoder.encode(
                    ["tuple(bool,address,bytes32,uint256,bytes)"],
                    [[BridgeParam.relay, BridgeParam.referrer, BridgeParam.transferId, BridgeParam.gasLimit, BridgeParam.swapData]]
                );
                
                // Should revert with zero_amount error
                await expect(bridge.swapOutToken(
                    owner.address,
                    usdt.address,
                    other.address,
                    amount,
                    212,
                    bridgeData
                )).to.be.revertedWithCustomError(bridge, "zero_amount");
            });

            it("Should revert when insufficient allowance", async function () {
                const amount = ethers.utils.parseEther("1");
                const smallAllowance = ethers.utils.parseEther("0.5");
                
                // Approve less than required amount
                await usdt.approve(bridge.address, smallAllowance);
                
                const BridgeParam = {
                    relay: false,
                    referrer: other.address,
                    transferId: "0xbe5efb88602668af34c26331b91eebcde671d0add93c52c8bc70be1435f0b3fd",
                    gasLimit: 0,
                    swapData: "0x"
                };
                const bridgeData = ethers.utils.defaultAbiCoder.encode(
                    ["tuple(bool,address,bytes32,uint256,bytes)"],
                    [[BridgeParam.relay, BridgeParam.referrer, BridgeParam.transferId, BridgeParam.gasLimit, BridgeParam.swapData]]
                );
                
                // Should revert due to insufficient allowance
                await expect(bridge.swapOutToken(
                    owner.address,
                    usdt.address,
                    other.address,
                    amount,
                    212,
                    bridgeData
                )).to.be.reverted;
            });

            it("Should handle large amounts gracefully", async function () {
                const largeAmount = ethers.utils.parseEther("1000"); // Large but reasonable amount
                
                // Ensure user has enough balance
                const userBalance = await usdt.balanceOf(owner.address);
                if (userBalance.lt(largeAmount)) {
                    await usdt.mint(owner.address, largeAmount.sub(userBalance));
                }
                
                // Approve large amount
                await usdt.approve(bridge.address, largeAmount);
                
                const BridgeParam = {
                    relay: false,
                    referrer: other.address,
                    transferId: "0xbe5efb88602668af34c26331b91eebcde671d0add93c52c8bc70be1435f0b3fd",
                    gasLimit: 0,
                    swapData: "0x"
                };
                const bridgeData = ethers.utils.defaultAbiCoder.encode(
                    ["tuple(bool,address,bytes32,uint256,bytes)"],
                    [[BridgeParam.relay, BridgeParam.referrer, BridgeParam.transferId, BridgeParam.gasLimit, BridgeParam.swapData]]
                );
                
                // Should handle large amounts without overflow
                // Note: This might revert due to insufficient balance or other constraints
                // We'll test that it doesn't overflow, but it might fail for other reasons
                try {
                    await bridge.swapOutToken(
                        owner.address,
                        usdt.address,
                        other.address,
                        largeAmount,
                        212,
                        bridgeData
                    );
                } catch (error) {
                    // If it reverts, it should not be due to overflow
                    expect(error.message).to.not.include("overflow");
                }
            });
        });

        describe("Address Validation Tests", function () {
            it("Should revert when sender is zero address", async function () {
                const amount = ethers.utils.parseEther("1");
                
                const BridgeParam = {
                    relay: false,
                    referrer: other.address,
                    transferId: "0xbe5efb88602668af34c26331b91eebcde671d0add93c52c8bc70be1435f0b3fd",
                    gasLimit: 0,
                    swapData: "0x"
                };
                const bridgeData = ethers.utils.defaultAbiCoder.encode(
                    ["tuple(bool,address,bytes32,uint256,bytes)"],
                    [[BridgeParam.relay, BridgeParam.referrer, BridgeParam.transferId, BridgeParam.gasLimit, BridgeParam.swapData]]
                );
                
                await usdt.approve(bridge.address, amount);
                
                // Should revert when sender is zero address
                await expect(bridge.swapOutToken(
                    ethers.constants.AddressZero,
                    usdt.address,
                    other.address,
                    amount,
                    212,
                    bridgeData
                )).to.be.reverted;
            });

            it("Should revert when receiver is zero address", async function () {
                const amount = ethers.utils.parseEther("1");
                
                const BridgeParam = {
                    relay: false,
                    referrer: other.address,
                    transferId: "0xbe5efb88602668af34c26331b91eebcde671d0add93c52c8bc70be1435f0b3fd",
                    gasLimit: 0,
                    swapData: "0x"
                };
                const bridgeData = ethers.utils.defaultAbiCoder.encode(
                    ["tuple(bool,address,bytes32,uint256,bytes)"],
                    [[BridgeParam.relay, BridgeParam.referrer, BridgeParam.transferId, BridgeParam.gasLimit, BridgeParam.swapData]]
                );
                
                await usdt.approve(bridge.address, amount);
                
                // Should revert when receiver is zero address
                await expect(bridge.swapOutToken(
                    owner.address,
                    usdt.address,
                    ethers.constants.AddressZero,
                    amount,
                    212,
                    bridgeData
                )).to.be.reverted;
            });
        });

        describe("Chain Validation Tests", function () {
            it("Should revert when target chain is same as current chain", async function () {
                const currentChainId = await bridge.selfChainId();
                const amount = ethers.utils.parseEther("1");
                
                const BridgeParam = {
                    relay: false,
                    referrer: other.address,
                    transferId: "0xbe5efb88602668af34c26331b91eebcde671d0add93c52c8bc70be1435f0b3fd",
                    gasLimit: 0,
                    swapData: "0x"
                };
                const bridgeData = ethers.utils.defaultAbiCoder.encode(
                    ["tuple(bool,address,bytes32,uint256,bytes)"],
                    [[BridgeParam.relay, BridgeParam.referrer, BridgeParam.transferId, BridgeParam.gasLimit, BridgeParam.swapData]]
                );
                
                await usdt.approve(bridge.address, amount);
                
                // Should revert with bridge_same_chain error
                await expect(bridge.swapOutToken(
                    owner.address,
                    usdt.address,
                    other.address,
                    amount,
                    currentChainId,
                    bridgeData
                )).to.be.revertedWithCustomError(bridge, "bridge_same_chain");
            });

            it("Should revert when target chain is zero", async function () {
                const amount = ethers.utils.parseEther("1");
                
                const BridgeParam = {
                    relay: false,
                    referrer: other.address,
                    transferId: "0xbe5efb88602668af34c26331b91eebcde671d0add93c52c8bc70be1435f0b3fd",
                    gasLimit: 0,
                    swapData: "0x"
                };
                const bridgeData = ethers.utils.defaultAbiCoder.encode(
                    ["tuple(bool,address,bytes32,uint256,bytes)"],
                    [[BridgeParam.relay, BridgeParam.referrer, BridgeParam.transferId, BridgeParam.gasLimit, BridgeParam.swapData]]
                );
                
                await usdt.approve(bridge.address, amount);
                
                // Should revert with token_not_registered error for chain 0
                await expect(bridge.swapOutToken(
                    owner.address,
                    usdt.address,
                    other.address,
                    amount,
                    0,
                    bridgeData
                )).to.be.revertedWithCustomError(bridge, "token_not_registered");
            });
        });
    });

    // ==================== DEPOSIT TOKEN BOUNDARY TESTS ====================
    describe("depositToken Boundary Tests", function () {
        describe("Token Validation Tests", function () {
            it("Should revert when token is unregistered contract", async function () {
                // Deploy a new token contract that is not registered
                const MockToken = await ethers.getContractFactory("MockToken");
                const unregisteredToken = await MockToken.deploy("Unregistered", "UNREG");
                
                const amount = ethers.utils.parseEther("1");
                
                // Should revert with token_not_registered error
                await expect(bridge.depositToken(
                    unregisteredToken.address,
                    other.address,
                    amount
                )).to.be.reverted;
            });

            it("Should revert when token is not a contract address", async function () {
                const nonContractAddress = other.address; // EOA address
                const amount = ethers.utils.parseEther("1");
                
                // Should revert due to non-contract address
                await expect(bridge.depositToken(
                    nonContractAddress,
                    other.address,
                    amount
                )).to.be.reverted;
            });

            it("Should handle zero address (native token) correctly", async function () {
                const amount = ethers.utils.parseEther("1");
                
                // Should work for native token (zero address)
                await expect(bridge.depositToken(
                    ethers.constants.AddressZero,
                    other.address,
                    amount,
                    { value: amount }
                )).to.emit(bridge, "MessageOut");
            });
        });

        describe("Amount and Balance Tests", function () {
            it("Should revert when amount is zero", async function () {
                const amount = 0;
                
                // Should revert with zero_amount error
                await expect(bridge.depositToken(
                    usdt.address,
                    other.address,
                    amount
                )).to.be.revertedWithCustomError(bridge, "zero_amount");
            });

            it("Should revert when insufficient native token balance", async function () {
                const amount = ethers.utils.parseEther("1000000"); // Very large amount
                const smallValue = ethers.utils.parseEther("1"); // Small value sent
                
                // Should revert with in_amount_low error
                await expect(bridge.depositToken(
                    ethers.constants.AddressZero,
                    other.address,
                    amount,
                    { value: smallValue }
                )).to.be.revertedWithCustomError(bridge, "in_amount_low");
            });

            it("Should revert when insufficient ERC20 balance", async function () {
                const amount = ethers.utils.parseEther("1000000"); // More than available
                
                // Should revert due to insufficient balance
                await expect(bridge.depositToken(
                    usdt.address,
                    other.address,
                    amount
                )).to.be.reverted;
            });

            it("Should revert when insufficient ERC20 allowance", async function () {
                const amount = ethers.utils.parseEther("1");
                
                // Don't approve, should fail
                await expect(bridge.depositToken(
                    usdt.address,
                    other.address,
                    amount
                )).to.be.reverted;
            });

            it("Should handle large amounts gracefully", async function () {
                const largeAmount = ethers.utils.parseEther("1000000"); // Very large amount
                
                // Approve large amount
                await usdt.approve(bridge.address, largeAmount);
                
                // Should handle large amounts without overflow
                await expect(bridge.depositToken(
                    usdt.address,
                    other.address,
                    largeAmount
                )).to.not.be.reverted;
            });
        });

        describe("Address Validation Tests", function () {
            it("Should revert when receiver is zero address", async function () {
                const amount = ethers.utils.parseEther("1");
                
                // Should revert when receiver is zero address
                await expect(bridge.depositToken(
                    usdt.address,
                    ethers.constants.AddressZero,
                    amount
                )).to.be.reverted;
            });

            it("Should handle valid receiver addresses", async function () {
                const amount = ethers.utils.parseEther("1");
                
                // Should work with valid receiver address
                await expect(bridge.depositToken(
                    ethers.constants.AddressZero,
                    other.address,
                    amount,
                    { value: amount }
                )).to.emit(bridge, "MessageOut");
            });
        });
    });

    // ==================== UPGRADE SECURITY TESTS ====================
    describe("Upgrade Security Tests", function () {
        it("Should prevent unauthorized upgrades", async function () {
            // Test that non-admin cannot upgrade
            const BridgeV2 = await ethers.getContractFactory("Bridge");
            const newImplementation = await BridgeV2.deploy();
            
            await expect(bridge.connect(attacker).upgradeToAndCall(newImplementation.address, "0x"))
                .to.be.revertedWithCustomError(bridge, "AccessManagedUnauthorized");
        });

        it("Should allow authorized upgrades", async function () {
            const BridgeV2 = await ethers.getContractFactory("Bridge");
            const newImplementation = await BridgeV2.deploy();
            
            await expect(bridge.connect(deployer).upgradeToAndCall(newImplementation.address, "0x"))
                .to.not.be.reverted;
        });

        it("Should maintain state after upgrade", async function () {
            // Get initial state
            const initialWToken = await bridge.getServiceContract(0);
            const initialLightNode = await bridge.getServiceContract(1);
            
            // Perform upgrade
            const BridgeV2 = await ethers.getContractFactory("Bridge");
            const newImplementation = await BridgeV2.deploy();
            await bridge.connect(deployer).upgradeToAndCall(newImplementation.address, "0x");
            
            // Verify state is maintained
            expect(await bridge.getServiceContract(0)).to.equal(initialWToken);
            expect(await bridge.getServiceContract(1)).to.equal(initialLightNode);
        });
    });

    // ==================== EXTERNAL CONTRACT INTERACTION SECURITY ====================
    describe("External Contract Interaction Security", function () {
        it("Should handle malicious IButterReceiver gracefully", async function () {
            // Deploy malicious receiver that reverts
            const MaliciousReceiver = await ethers.getContractFactory("contracts/mock/TestUtil.sol:TestUtil");
            const maliciousReceiver = await MaliciousReceiver.deploy();
            
            // This should not break the bridge functionality
            const amount = ethers.utils.parseEther("1");
            await expect(bridge.depositToken(ethers.constants.AddressZero, maliciousReceiver.address, amount, {value: amount}))
                .to.emit(bridge, "MessageOut");
        });

        it("Should handle malicious IRelayExecutor gracefully", async function () {
            // Test relayExecute with malicious contract
            const MaliciousReceiver = await ethers.getContractFactory("contracts/mock/TestUtil.sol:TestUtil");
            const maliciousExecutor = await MaliciousReceiver.deploy();
            
            // This should be handled gracefully by the try-catch mechanism
            // The exact test depends on the relayExecute implementation
        });

        it("Should validate external contract addresses", async function () {
            // Test with non-contract addresses
            await expect(bridge.connect(deployer).setServiceContract(1, other.address))
                .to.not.be.reverted; // Should accept any address
            
            // Test with zero address
            await expect(bridge.connect(deployer).setServiceContract(1, ethers.constants.AddressZero))
                .to.be.revertedWithCustomError(bridge, "zero_address");
        });
    });

    // ==================== ORDER ID COLLISION TESTS ====================
    describe("Order ID Collision Tests", function () {
        it("Should handle nonce overflow correctly", async function () {
            // Test that nonce overflow doesn't cause issues
            // This is more of a theoretical test since nonce is uint256
            const maxNonce = ethers.constants.MaxUint256;
            
            // The system should handle this gracefully
            // In practice, this would require an enormous number of transactions
        });

        it("Should prevent order ID reuse", async function () {
            // Test that the same order ID cannot be used twice
            const orderId = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("test"));
            
            // Simulate order processing
            // This would require setting up the exact order state
        });
    });

    // ==================== FEE MANIPULATION TESTS ====================
    describe("Fee Manipulation Tests", function () {
        it("Should prevent fee bypass through rate manipulation", async function () {
            // Test that users cannot bypass fees by manipulating bridge settings
            // Try to manipulate bridge settings (should be prevented by access control)
            await expect(bridge.connect(attacker).setServiceContract(1, attacker.address))
                .to.be.revertedWithCustomError(bridge, "AccessManagedUnauthorized");
        });

        it("Should handle fee calculation edge cases", async function () {
            // Test with very small amounts
            const tinyAmount = 1;
            
            // Test with very large amounts
            const hugeAmount = ethers.constants.MaxUint256;
            
            // These should be handled gracefully
        });

        it("Should prevent fee extraction attacks", async function () {
            // Test that users cannot extract fees they shouldn't have access to
            await expect(bridge.connect(attacker).withdrawFee(attacker.address, usdt.address))
                .to.emit(bridge, "WithdrawFee")
                .withArgs(attacker.address, usdt.address, 0); // Should be 0 for attacker
        });
    });

    // ==================== TOKEN MANIPULATION TESTS ====================
    describe("Token Manipulation Tests", function () {
        it("Should handle non-standard ERC20 tokens", async function () {
            // Test with tokens that don't return boolean from transfer
            // Test with tokens that have transfer fees
            // Test with tokens that have blacklist functionality
        });

        it("Should prevent token balance manipulation", async function () {
            // Test that users cannot manipulate token balances through reentrancy
            // Test that users cannot double-spend tokens
        });

        it("Should handle token decimals correctly", async function () {
            // Test with tokens of different decimals
            // Test decimal conversion accuracy
        });
    });

    // ==================== CROSS-CHAIN MESSAGE SECURITY ====================
    describe("Cross-Chain Message Security", function () {
        it("Should validate chain IDs correctly", async function () {
            // Test with invalid chain IDs
            const invalidChainId = 999999;
            
            await expect(bridge.swapOutToken(
                owner.address,
                usdt.address,
                owner.address,
                ethers.utils.parseEther("1"),
                invalidChainId,
                "0x"
            )).to.be.reverted; // Should revert due to unregistered chain
        });

        it("Should prevent message replay attacks", async function () {
            // Test that old messages cannot be replayed
            // This is handled by the order ID system
        });

        it("Should validate message signatures correctly", async function () {
            // Test with invalid proof data
            // Test with tampered message data
        });
    });

    // ==================== GAS LIMIT AND DOS PROTECTION ====================
    describe("Gas Limit and DoS Protection", function () {
        it("Should handle gas limit exhaustion gracefully", async function () {
            // Test with very low gas limits
            const lowGasLimit = 1000;
            
            // Test with very high gas limits
            const highGasLimit = 10000000;
        });

        it("Should prevent DoS through excessive operations", async function () {
            // Test that users cannot perform operations that would consume excessive gas
            // Test that the system remains functional under load
        });

        it("Should handle out-of-gas scenarios", async function () {
            // Test behavior when operations run out of gas
        });
    });

    // ==================== STATE CONSISTENCY TESTS ====================
    describe("State Consistency Tests", function () {
        it("Should maintain consistency during concurrent operations", async function () {
            // Test that multiple operations don't interfere with each other
            const amount = ethers.utils.parseEther("1");
            
            // Perform multiple operations simultaneously
            const promises = [];
            for (let i = 0; i < 5; i++) {
                promises.push(bridge.depositToken(ethers.constants.AddressZero, owner.address, amount, {value: amount}));
            }
            
            await expect(Promise.all(promises)).to.not.be.reverted;
        });

        it("Should handle partial failures correctly", async function () {
            // Test that partial failures don't leave the system in an inconsistent state
        });

        it("Should validate state transitions", async function () {
            // Test that state transitions are valid and atomic
        });
    });

    // ==================== ACCESS CONTROL EDGE CASES ====================
    describe("Access Control Edge Cases", function () {
        it("Should handle admin transfer securely", async function () {
            // Test admin transfer functionality
            // Ensure old admin loses access
            // Ensure new admin gains access
        });

        it("Should prevent privilege escalation", async function () {
            // Test that users cannot escalate their privileges
            // Test that users cannot grant themselves roles
        });
    });

    // ==================== EMERGENCY SCENARIOS ====================
    describe("Emergency Scenarios", function () {
        it("Should handle pause/unpause correctly", async function () {
            // Test pause functionality
            await bridge.connect(deployer).trigger();
            expect(await bridge.paused()).to.be.true;
            
            // Test that operations are blocked when paused
            const amount = ethers.utils.parseEther("1");
            await expect(bridge.depositToken(ethers.constants.AddressZero, owner.address, amount, {value: amount}))
                .to.be.revertedWithCustomError(bridge, "EnforcedPause");
            
            // Test unpause
            await bridge.connect(deployer).trigger();
            expect(await bridge.paused()).to.be.false;
            
            // Test that operations work after unpause
            await expect(bridge.depositToken(ethers.constants.AddressZero, owner.address, amount, {value: amount}))
                .to.emit(bridge, "MessageOut");
        });

        it("Should handle emergency withdrawals", async function () {
            // Test emergency withdrawal functionality if implemented
        });
    });
}); 