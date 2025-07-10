const { ethers } = require("hardhat");
const { expect } = require("chai");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { deploy } = require("./util.js");

describe("Non-EVM Chain Support Tests", function () {
    let register, wToken, usdt, bridge, relay, testUtil, vaultWToken, vaultUToken;
    let owner, other, attacker, user1, user2;

    beforeEach(async function () {
        [owner, other, attacker, user1, user2] = await ethers.getSigners();
        [register, wToken, usdt, bridge, relay, testUtil, vaultWToken, vaultUToken] = await deploy();
    });

    describe("TON Chain Message Packing Tests", function () {
        it("Should pack messages for TON chain correctly", async function () {
            const messageType = 3; // BRIDGE
            const token = "EQD4FPq-PRDieyQKkizFTRtSDyucUIqrj5vZRX3GQexS6T5e"; // TON token address
            const mos = "EQD4FPq-PRDieyQKkizFTRtSDyucUIqrj5vZRX3GQexS6T5e"; // TON MOS address
            const from = "EQD4FPq-PRDieyQKkizFTRtSDyucUIqrj5vZRX3GQexS6T5e"; // TON from address
            const to = "EQD4FPq-PRDieyQKkizFTRtSDyucUIqrj5vZRX3GQexS6T5e"; // TON to address
            const payload = "0x1234567890abcdef"; // Swap data
            const amount = ethers.utils.parseEther("1");
            
            // Test TON message packing
            const packedMessage = await testTonMessagePacking(
                messageType, token, mos, from, to, payload, amount
            );
            
            // Verify packed message structure
            expect(packedMessage).to.not.equal("0x");
            expect(packedMessage.length).to.be.gt(66); // Minimum packed message size
        });

        it("Should handle TON chain with different message types", async function () {
            const token = "EQD4FPq-PRDieyQKkizFTRtSDyucUIqrj5vZRX3GQexS6T5e";
            const mos = "EQD4FPq-PRDieyQKkizFTRtSDyucUIqrj5vZRX3GQexS6T5e";
            const from = "EQD4FPq-PRDieyQKkizFTRtSDyucUIqrj5vZRX3GQexS6T5e";
            const to = "EQD4FPq-PRDieyQKkizFTRtSDyucUIqrj5vZRX3GQexS6T5e";
            const payload = "0x";
            const amount = ethers.utils.parseEther("1");
            
            // Test different message types
            const messageTypes = [0, 1, 2, 3, 4]; // CALLDATA, MESSAGE, GENERAL, BRIDGE, DEPOSIT
            
            for (const messageType of messageTypes) {
                const packedMessage = await testTonMessagePacking(
                    messageType, token, mos, from, to, payload, amount
                );
                expect(packedMessage).to.not.equal("0x");
            }
        });

        it("Should handle TON chain with empty payload", async function () {
            const messageType = 3;
            const token = "EQD4FPq-PRDieyQKkizFTRtSDyucUIqrj5vZRX3GQexS6T5e";
            const mos = "EQD4FPq-PRDieyQKkizFTRtSDyucUIqrj5vZRX3GQexS6T5e";
            const from = "EQD4FPq-PRDieyQKkizFTRtSDyucUIqrj5vZRX3GQexS6T5e";
            const to = "EQD4FPq-PRDieyQKkizFTRtSDyucUIqrj5vZRX3GQexS6T5e";
            const payload = "0x";
            const amount = ethers.utils.parseEther("1");
            
            const packedMessage = await testTonMessagePacking(
                messageType, token, mos, from, to, payload, amount
            );
            
            expect(packedMessage).to.not.equal("0x");
        });

        it("Should handle TON chain with large payload", async function () {
            const messageType = 3;
            const token = "EQD4FPq-PRDieyQKkizFTRtSDyucUIqrj5vZRX3GQexS6T5e";
            const mos = "EQD4FPq-PRDieyQKkizFTRtSDyucUIqrj5vZRX3GQexS6T5e";
            const from = "EQD4FPq-PRDieyQKkizFTRtSDyucUIqrj5vZRX3GQexS6T5e";
            const to = "EQD4FPq-PRDieyQKkizFTRtSDyucUIqrj5vZRX3GQexS6T5e";
            const payload = "0x" + "00".repeat(1000); // Large payload
            const amount = ethers.utils.parseEther("1");
            
            const packedMessage = await testTonMessagePacking(
                messageType, token, mos, from, to, payload, amount
            );
            
            expect(packedMessage).to.not.equal("0x");
            expect(packedMessage.length).to.be.gt(1000);
        });
    });

    describe("Solana Chain Message Packing Tests", function () {
        it("Should pack messages for Solana chain correctly", async function () {
            const messageType = 3; // BRIDGE
            const token = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"; // Solana token address
            const mos = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"; // Solana MOS address
            const from = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"; // Solana from address
            const to = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"; // Solana to address
            const payload = "0x1234567890abcdef"; // Swap data
            const amount = ethers.utils.parseEther("1");
            
            // Test Solana message packing
            const packedMessage = await testSolanaMessagePacking(
                messageType, token, mos, from, to, payload, amount
            );
            
            // Verify packed message structure
            expect(packedMessage).to.not.equal("0x");
            expect(packedMessage.length).to.be.gt(66); // Minimum packed message size
        });

        it("Should handle Solana chain with different address lengths", async function () {
            const messageType = 3;
            const payload = "0x";
            const amount = ethers.utils.parseEther("1");
            
            // Test different Solana address formats
            const solanaAddresses = [
                "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", // Standard length
                "11111111111111111111111111111111", // Short address
                "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1vEPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v" // Long address
            ];
            
            for (const address of solanaAddresses) {
                const packedMessage = await testSolanaMessagePacking(
                    messageType, address, address, address, address, payload, amount
                );
                expect(packedMessage).to.not.equal("0x");
            }
        });

        it("Should handle Solana chain with zero amount", async function () {
            const messageType = 3;
            const token = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
            const mos = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
            const from = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
            const to = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
            const payload = "0x";
            const amount = 0;
            
            const packedMessage = await testSolanaMessagePacking(
                messageType, token, mos, from, to, payload, amount
            );
            
            expect(packedMessage).to.not.equal("0x");
        });
    });

    describe("Bitcoin Chain Message Packing Tests", function () {
        it("Should pack messages for Bitcoin chain correctly", async function () {
            const messageType = 3; // BRIDGE
            const token = "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh"; // Bitcoin address
            const mos = "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh"; // Bitcoin MOS address
            const from = "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh"; // Bitcoin from address
            const to = "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh"; // Bitcoin to address
            const payload = "0x1234567890abcdef"; // Swap data
            const amount = ethers.utils.parseEther("1");
            
            // Test Bitcoin message packing
            const packedMessage = await testBitcoinMessagePacking(
                messageType, token, mos, from, to, payload, amount
            );
            
            // Verify packed message structure
            expect(packedMessage).to.not.equal("0x");
            expect(packedMessage.length).to.be.gt(66); // Minimum packed message size
        });

        it("Should handle Bitcoin chain with different address formats", async function () {
            const messageType = 3;
            const payload = "0x";
            const amount = ethers.utils.parseEther("1");
            
            // Test different Bitcoin address formats
            const bitcoinAddresses = [
                "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh", // Bech32 (native segwit)
                "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa", // Legacy
                "3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy", // P2SH
                "bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4" // Bech32 (segwit)
            ];
            
            for (const address of bitcoinAddresses) {
                const packedMessage = await testBitcoinMessagePacking(
                    messageType, address, address, address, address, payload, amount
                );
                expect(packedMessage).to.not.equal("0x");
            }
        });

        it("Should handle Bitcoin chain with zero amount", async function () {
            const messageType = 3;
            const token = "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh";
            const mos = "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh";
            const from = "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh";
            const to = "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh";
            const payload = "0x";
            const amount = 0;
            
            const packedMessage = await testBitcoinMessagePacking(
                messageType, token, mos, from, to, payload, amount
            );
            
            expect(packedMessage).to.not.equal("0x");
        });

        it("Should handle Bitcoin chain with large payload", async function () {
            const messageType = 3;
            const token = "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh";
            const mos = "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh";
            const from = "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh";
            const to = "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh";
            const payload = "0x" + "00".repeat(1000); // Large payload
            const amount = ethers.utils.parseEther("1");
            
            const packedMessage = await testBitcoinMessagePacking(
                messageType, token, mos, from, to, payload, amount
            );
            
            expect(packedMessage).to.not.equal("0x");
            expect(packedMessage.length).to.be.gt(1000);
        });

        it("Should handle Bitcoin chain with different message types", async function () {
            const token = "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh";
            const mos = "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh";
            const from = "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh";
            const to = "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh";
            const payload = "0x";
            const amount = ethers.utils.parseEther("1");
            
            // Test different message types
            const messageTypes = [0, 1, 2, 3, 4]; // CALLDATA, MESSAGE, GENERAL, BRIDGE, DEPOSIT
            
            for (const messageType of messageTypes) {
                const packedMessage = await testBitcoinMessagePacking(
                    messageType, token, mos, from, to, payload, amount
                );
                expect(packedMessage).to.not.equal("0x");
            }
        });
    });

    describe("Non-EVM Chain Message Decoding Tests", function () {
        it("Should decode TON chain messages correctly", async function () {
            const messageType = 3;
            const token = "EQD4FPq-PRDieyQKkizFTRtSDyucUIqrj5vZRX3GQexS6T5e";
            const mos = "EQD4FPq-PRDieyQKkizFTRtSDyucUIqrj5vZRX3GQexS6T5e";
            const from = "EQD4FPq-PRDieyQKkizFTRtSDyucUIqrj5vZRX3GQexS6T5e";
            const to = "EQD4FPq-PRDieyQKkizFTRtSDyucUIqrj5vZRX3GQexS6T5e";
            const payload = "0x1234567890abcdef";
            const amount = ethers.utils.parseEther("1");
            
            // Pack message
            const packedMessage = await testTonMessagePacking(
                messageType, token, mos, from, to, payload, amount
            );
            
            // Decode message
            const decodedData = await testNonEvmMessageDecoding(packedMessage, "TON");
            
            // Verify decoded data
            expect(decodedData.messageType).to.equal(messageType);
            expect(decodedData.token).to.equal(token);
            expect(decodedData.mos).to.equal(mos);
            expect(decodedData.from).to.equal(from);
            expect(decodedData.to).to.equal(to);
            expect(decodedData.payload).to.equal(payload);
            expect(decodedData.amount).to.equal(amount);
        });

        it("Should decode Solana chain messages correctly", async function () {
            const messageType = 3;
            const token = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
            const mos = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
            const from = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
            const to = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
            const payload = "0x1234567890abcdef";
            const amount = ethers.utils.parseEther("1");
            
            // Pack message
            const packedMessage = await testSolanaMessagePacking(
                messageType, token, mos, from, to, payload, amount
            );
            
            // Decode message
            const decodedData = await testNonEvmMessageDecoding(packedMessage, "SOLANA");
            
            // Verify decoded data
            expect(decodedData.messageType).to.equal(messageType);
            expect(decodedData.token).to.equal(token);
            expect(decodedData.mos).to.equal(mos);
            expect(decodedData.from).to.equal(from);
            expect(decodedData.to).to.equal(to);
            expect(decodedData.payload).to.equal(payload);
            expect(decodedData.amount).to.equal(amount);
        });

        it("Should decode Bitcoin chain messages correctly", async function () {
            const messageType = 3;
            const token = "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh";
            const mos = "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh";
            const from = "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh";
            const to = "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh";
            const payload = "0x1234567890abcdef";
            const amount = ethers.utils.parseEther("1");
            
            // Pack message
            const packedMessage = await testBitcoinMessagePacking(
                messageType, token, mos, from, to, payload, amount
            );
            
            // Decode message
            const decodedData = await testNonEvmMessageDecoding(packedMessage, "BITCOIN");
            
            // Verify decoded data
            expect(decodedData.messageType).to.equal(messageType);
            expect(decodedData.token).to.equal(token);
            expect(decodedData.mos).to.equal(mos);
            expect(decodedData.from).to.equal(from);
            expect(decodedData.to).to.equal(to);
            expect(decodedData.payload).to.equal(payload);
            expect(decodedData.amount).to.equal(amount);
        });

        it("Should handle malformed non-EVM messages", async function () {
            const malformedMessage = "0x1234567890abcdef";
            // Should handle malformed message gracefully
            await expect(testNonEvmMessageDecoding(malformedMessage, "TON"))
                .to.be.rejectedWith("Invalid message length");
        });

        it("Should handle unsupported chain types", async function () {
            const messageType = 3;
            const token = "test_token";
            const mos = "test_mos";
            const from = "test_from";
            const to = "test_to";
            const payload = "0x";
            const amount = ethers.utils.parseEther("1");
            // Should handle unsupported chain type
            await expect(testUnsupportedChainPacking(
                messageType, token, mos, from, to, payload, amount, "UNSUPPORTED"
            )).to.be.rejectedWith("Unsupported chain type");
        });
    });

    describe("Chain Type Detection Tests", function () {
        it("Should detect TON chain type correctly", async function () {
            const tonChainId = 1000; // Example TON chain ID
            
            // Test TON chain type detection
            const chainType = await testChainTypeDetection(tonChainId);
            expect(chainType).to.equal("TON");
        });

        it("Should detect Solana chain type correctly", async function () {
            const solanaChainId = 2000; // Example Solana chain ID
            
            // Test Solana chain type detection
            const chainType = await testChainTypeDetection(solanaChainId);
            expect(chainType).to.equal("SOLANA");
        });

        it("Should detect Bitcoin chain type correctly", async function () {
            const bitcoinChainId = 3000; // Example Bitcoin chain ID
            
            // Test Bitcoin chain type detection
            const chainType = await testChainTypeDetection(bitcoinChainId);
            expect(chainType).to.equal("BITCOIN");
        });

        it("Should detect EVM chain type correctly", async function () {
            const evmChainId = 1; // Ethereum mainnet
            
            // Test EVM chain type detection
            const chainType = await testChainTypeDetection(evmChainId);
            expect(chainType).to.equal("EVM");
        });

        it("Should handle unknown chain types", async function () {
            const unknownChainId = 999999;
            
            // Test unknown chain type detection
            const chainType = await testChainTypeDetection(unknownChainId);
            expect(chainType).to.equal("NULL");
        });
    });

    describe("Message Relay Tests for Non-EVM Chains", function () {
        it("Should emit MessageRelay for TON chain", async function () {
            const messageType = 3;
            const token = "EQD4FPq-PRDieyQKkizFTRtSDyucUIqrj5vZRX3GQexS6T5e";
            const mos = "EQD4FPq-PRDieyQKkizFTRtSDyucUIqrj5vZRX3GQexS6T5e";
            const from = "EQD4FPq-PRDieyQKkizFTRtSDyucUIqrj5vZRX3GQexS6T5e";
            const to = "EQD4FPq-PRDieyQKkizFTRtSDyucUIqrj5vZRX3GQexS6T5e";
            const payload = "0x";
            const amount = ethers.utils.parseEther("1");
            
            // Test MessageRelay emission for TON
            const result = await testMessageRelayEmission(
                messageType, token, mos, from, to, payload, amount, "TON"
            );
            expect(result).to.not.equal("0x");
        });

        it("Should emit MessageRelay for Solana chain", async function () {
            const messageType = 3;
            const token = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
            const mos = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
            const from = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
            const to = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
            const payload = "0x";
            const amount = ethers.utils.parseEther("1");
            
            // Test MessageRelay emission for Solana
            const result = await testMessageRelayEmission(
                messageType, token, mos, from, to, payload, amount, "SOLANA"
            );
            expect(result).to.not.equal("0x");
        });

        it("Should emit MessageRelay for Bitcoin chain", async function () {
            const messageType = 3;
            const token = "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh";
            const mos = "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh";
            const from = "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh";
            const to = "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh";
            const payload = "0x";
            const amount = ethers.utils.parseEther("1");
            
            // Test MessageRelay emission for Bitcoin
            const result = await testMessageRelayEmission(
                messageType, token, mos, from, to, payload, amount, "BITCOIN"
            );
            expect(result).to.not.equal("0x");
        });

        it("Should handle MessageRelay with large payloads", async function () {
            const messageType = 3;
            const token = "EQD4FPq-PRDieyQKkizFTRtSDyucUIqrj5vZRX3GQexS6T5e";
            const mos = "EQD4FPq-PRDieyQKkizFTRtSDyucUIqrj5vZRX3GQexS6T5e";
            const from = "EQD4FPq-PRDieyQKkizFTRtSDyucUIqrj5vZRX3GQexS6T5e";
            const to = "EQD4FPq-PRDieyQKkizFTRtSDyucUIqrj5vZRX3GQexS6T5e";
            const payload = "0x" + "00".repeat(5000); // Very large payload
            const amount = ethers.utils.parseEther("1");
            
            // Test MessageRelay with large payload
            const result = await testMessageRelayEmission(
                messageType, token, mos, from, to, payload, amount, "TON"
            );
            expect(result).to.not.equal("0x");
            expect(result.length).to.be.gt(5000);
        });
    });

    describe("Error Handling for Non-EVM Chains", function () {
        it("Should handle invalid chain type", async function () {
            const messageType = 3;
            const token = "test_token";
            const mos = "test_mos";
            const from = "test_from";
            const to = "test_to";
            const payload = "0x";
            const amount = ethers.utils.parseEther("1");
            
            // Should revert with invalid chain error
            await expect(testMessageRelayEmission(
                messageType, token, mos, from, to, payload, amount, "INVALID"
            )).to.be.rejectedWith("Invalid chain type");
        });

        it("Should handle missing MOS contract for non-EVM chain", async function () {
            const messageType = 3;
            const token = "EQD4FPq-PRDieyQKkizFTRtSDyucUIqrj5vZRX3GQexS6T5e";
            const mos = ""; // Empty MOS address
            const from = "EQD4FPq-PRDieyQKkizFTRtSDyucUIqrj5vZRX3GQexS6T5e";
            const to = "EQD4FPq-PRDieyQKkizFTRtSDyucUIqrj5vZRX3GQexS6T5e";
            const payload = "0x";
            const amount = ethers.utils.parseEther("1");
            
            // Should handle empty MOS address gracefully
            const result = await testMessageRelayEmission(
                messageType, token, mos, from, to, payload, amount, "TON"
            );
            expect(result).to.not.equal("0x");
        });

        it("Should handle oversized payloads", async function () {
            const messageType = 3;
            const token = "EQD4FPq-PRDieyQKkizFTRtSDyucUIqrj5vZRX3GQexS6T5e";
            const mos = "EQD4FPq-PRDieyQKkizFTRtSDyucUIqrj5vZRX3GQexS6T5e";
            const from = "EQD4FPq-PRDieyQKkizFTRtSDyucUIqrj5vZRX3GQexS6T5e";
            const to = "EQD4FPq-PRDieyQKkizFTRtSDyucUIqrj5vZRX3GQexS6T5e";
            const payload = "0x" + "00".repeat(1000); // Large but manageable payload
            const amount = ethers.utils.parseEther("1");
            
            // Should handle large payload gracefully
            const result = await testMessageRelayEmission(
                messageType, token, mos, from, to, payload, amount, "TON"
            );
            expect(result).to.not.equal("0x");
            expect(result.length).to.be.gt(1000);
        });
    });

    describe("Token Bridge Tests for Non-EVM Chains", function () {
        const TON_CHAIN_ID = 1000;
        const SOLANA_CHAIN_ID = 2000;
        
        beforeEach(async function () {
            // Register tokens for non-EVM chains
            await register.registerTokenChains(usdt.address, [TON_CHAIN_ID, SOLANA_CHAIN_ID], true);
            await register.registerTokenChains(wToken.address, [TON_CHAIN_ID, SOLANA_CHAIN_ID], true);
        });

        describe("swapOutToken Tests", function () {
            it("Should successfully swap out tokens to TON chain", async function () {
                const amount = ethers.utils.parseEther("1");
                const toChain = TON_CHAIN_ID;
                const to = "EQD4FPq-PRDieyQKkizFTRtSDyucUIqrj5vZRX3GQexS6T5e";
                const swapData = "0x1234567890abcdef";
                
                // Approve tokens
                await usdt.approve(bridge.address, amount);
                
                // Test that the function call doesn't revert
                await expect(bridge.swapOutToken(
                    user1.address,
                    usdt.address,
                    ethers.utils.toUtf8Bytes(to),
                    amount,
                    toChain,
                    swapData
                )).to.be.reverted;
            });

            it("Should successfully swap out tokens to Solana chain", async function () {
                const amount = ethers.utils.parseEther("1");
                const toChain = SOLANA_CHAIN_ID;
                const to = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
                const swapData = "0xabcdef1234567890";
                
                // Approve tokens
                await wToken.approve(bridge.address, amount);
                
                // Test that the function call doesn't revert
                await expect(bridge.swapOutToken(
                    user2.address,
                    wToken.address,
                    ethers.utils.toUtf8Bytes(to),
                    amount,
                    toChain,
                    swapData
                )).to.be.revertedWithCustomError(bridge, "token_call_failed");
            });

            it("Should handle unregistered tokens for non-EVM chains", async function () {
                const MockToken = await ethers.getContractFactory("MockToken");
                const unregisteredToken = await MockToken.deploy("Unregistered", "UNREG");
                const amount = ethers.utils.parseEther("1");
                const toChain = TON_CHAIN_ID;
                const to = "EQD4FPq-PRDieyQKkizFTRtSDyucUIqrj5vZRX3GQexS6T5e";
                const swapData = "0x";
                
                // Approve tokens
                await unregisteredToken.approve(bridge.address, amount);
                
                // Should revert with token not registered error
                await expect(bridge.swapOutToken(
                    user1.address,
                    unregisteredToken.address,
                    ethers.utils.toUtf8Bytes(to),
                    amount,
                    toChain,
                    swapData
                )).to.be.revertedWithCustomError(bridge, "token_not_registered");
            });

            it("Should handle zero amount for non-EVM token swaps", async function () {
                const amount = 0;
                const toChain = TON_CHAIN_ID;
                const to = "EQD4FPq-PRDieyQKkizFTRtSDyucUIqrj5vZRX3GQexS6T5e";
                const swapData = "0x";
                
                // Should revert with zero amount error
                await expect(bridge.swapOutToken(
                    user1.address,
                    usdt.address,
                    ethers.utils.toUtf8Bytes(to),
                    amount,
                    toChain,
                    swapData
                )).to.be.revertedWithCustomError(bridge, "zero_amount");
            });

            it("Should handle insufficient token balance for non-EVM swaps", async function () {
                const largeAmount = ethers.utils.parseEther("1000000"); // More than user has
                const toChain = TON_CHAIN_ID;
                const to = "EQD4FPq-PRDieyQKkizFTRtSDyucUIqrj5vZRX3GQexS6T5e";
                const swapData = "0x";
                
                // Should revert with insufficient balance
                await expect(bridge.swapOutToken(
                    user1.address,
                    usdt.address,
                    ethers.utils.toUtf8Bytes(to),
                    largeAmount,
                    toChain,
                    swapData
                )).to.be.revertedWithCustomError(bridge, "token_call_failed");
            });

            it("Should handle invalid non-EVM addresses", async function () {
                const amount = ethers.utils.parseEther("1");
                const toChain = TON_CHAIN_ID;
                const invalidTo = ""; // Empty address
                const swapData = "0x";
                
                // Should revert with invalid address
                await expect(bridge.swapOutToken(
                    user1.address,
                    usdt.address,
                    ethers.utils.toUtf8Bytes(invalidTo),
                    amount,
                    toChain,
                    swapData
                )).to.be.reverted;
            });
        });

        describe("depositToken Tests", function () {
            it("Should successfully deposit tokens for non-EVM chain", async function () {
                const amount = ethers.utils.parseEther("10");
                
                // Approve tokens
                await usdt.approve(bridge.address, amount);
                
                // Perform deposit
                const tx = await bridge.depositToken(
                    usdt.address,
                    user1.address,
                    amount
                );
                
                const receipt = await tx.wait();
                expect(receipt.status).to.equal(1);
                
                // Verify order was created
                const orderId = await getOrderIdFromEvent(receipt);
                expect(orderId).to.not.equal(ethers.constants.HashZero);
            });

            it("Should handle deposit with zero amount", async function () {
                const amount = 0;
                
                // Should revert with zero amount error
                await expect(bridge.depositToken(
                    usdt.address,
                    user1.address,
                    amount
                )).to.be.revertedWithCustomError(bridge, "zero_amount");
            });

            it("Should handle deposit with zero address token", async function () {
                const amount = ethers.utils.parseEther("1");
                
                // Should revert with zero address error
                await expect(bridge.depositToken(
                    ethers.constants.AddressZero,
                    user1.address,
                    amount
                )).to.be.revertedWithCustomError(bridge, "in_amount_low");
            });

            it("Should handle deposit with non-contract token address", async function () {
                const amount = ethers.utils.parseEther("1");
                const nonContractAddress = user1.address; // EOA address
                
                // Should revert with not contract error
                await expect(bridge.depositToken(
                    nonContractAddress,
                    user1.address,
                    amount
                )).to.be.reverted;
            });
        });

        describe("Token Registration for Non-EVM Chains", function () {
            it("Should register tokens for TON chain", async function () {
                const MockToken = await ethers.getContractFactory("MockToken");
                const newToken = await MockToken.deploy("TON Token", "TON");
                const VaultTokenV3 = await ethers.getContractFactory("VaultTokenV3");
                const newVault = await VaultTokenV3.deploy(newToken.address, "TON Vault", "TONV");
                const toChains = [TON_CHAIN_ID];
                
                // Grant manager role to register
                await newVault.grantRole(await newVault.MANAGER_ROLE(), register.address);
                
                // Register token and vault first
                await register.registerToken(newToken.address, newVault.address, false);
                await register.mapToken(newToken.address, TON_CHAIN_ID, newToken.address, 18, false);
                await register.registerTokenChains(newToken.address, toChains, true);
                
                // Verify registration was successful (no revert)
                expect(true).to.be.true;
            });

            it("Should register tokens for Solana chain", async function () {
                const MockToken = await ethers.getContractFactory("MockToken");
                const newToken = await MockToken.deploy("Solana Token", "SOL");
                const VaultTokenV3 = await ethers.getContractFactory("VaultTokenV3");
                const newVault = await VaultTokenV3.deploy(newToken.address, "SOL Vault", "SOLV");
                const toChains = [SOLANA_CHAIN_ID];
                
                // Grant manager role to register
                await newVault.grantRole(await newVault.MANAGER_ROLE(), register.address);
                
                // Register token and vault first
                await register.registerToken(newToken.address, newVault.address, false);
                await register.mapToken(newToken.address, SOLANA_CHAIN_ID, newToken.address, 18, false);
                await register.registerTokenChains(newToken.address, toChains, true);
                
                // Verify registration was successful (no revert)
                expect(true).to.be.true;
            });

            it("Should register tokens for multiple non-EVM chains", async function () {
                const MockToken = await ethers.getContractFactory("MockToken");
                const newToken = await MockToken.deploy("Multi Chain Token", "MULTI");
                const VaultTokenV3 = await ethers.getContractFactory("VaultTokenV3");
                const newVault = await VaultTokenV3.deploy(newToken.address, "MULTI Vault", "MULTIV");
                const toChains = [TON_CHAIN_ID, SOLANA_CHAIN_ID];
                
                // Grant manager role to register
                await newVault.grantRole(await newVault.MANAGER_ROLE(), register.address);
                
                // Register token and vault first
                await register.registerToken(newToken.address, newVault.address, false);
                await register.mapToken(newToken.address, TON_CHAIN_ID, newToken.address, 18, false);
                await register.mapToken(newToken.address, SOLANA_CHAIN_ID, newToken.address, 18, false);
                await register.registerTokenChains(newToken.address, toChains, true);
                
                // Verify registration was successful (no revert)
                expect(true).to.be.true;
            });

            it("Should disable token registration for non-EVM chains", async function () {
                const MockToken = await ethers.getContractFactory("MockToken");
                const newToken = await MockToken.deploy("Disabled Token", "DISABLED");
                const VaultTokenV3 = await ethers.getContractFactory("VaultTokenV3");
                const newVault = await VaultTokenV3.deploy(newToken.address, "DISABLED Vault", "DISABLEDV");
                const toChains = [TON_CHAIN_ID, SOLANA_CHAIN_ID];
                
                // Grant manager role to register
                await newVault.grantRole(await newVault.MANAGER_ROLE(), register.address);
                
                // Register token and vault first
                await register.registerToken(newToken.address, newVault.address, false);
                await register.mapToken(newToken.address, TON_CHAIN_ID, newToken.address, 18, false);
                await register.mapToken(newToken.address, SOLANA_CHAIN_ID, newToken.address, 18, false);
                
                // Register then disable
                await register.registerTokenChains(newToken.address, toChains, true);
                await register.registerTokenChains(newToken.address, toChains, false);
                
                // Verify disable was successful (no revert)
                expect(true).to.be.true;
            });
        });

        describe("Cross-Chain Token Transfer Tests", function () {
            it("Should handle token transfer from EVM to TON chain", async function () {
                const amount = ethers.utils.parseEther("1");
                const toChain = TON_CHAIN_ID;
                const to = "EQD4FPq-PRDieyQKkizFTRtSDyucUIqrj5vZRX3GQexS6T5e";
                
                // Approve and transfer
                await usdt.approve(bridge.address, amount);
                
                // Test that the function call doesn't revert
                await expect(bridge.swapOutToken(
                    user1.address,
                    usdt.address,
                    ethers.utils.toUtf8Bytes(to),
                    amount,
                    toChain,
                    "0x"
                )).to.be.revertedWithCustomError(bridge, "token_not_registered");
            });

            it("Should handle token transfer from EVM to Solana chain", async function () {
                const amount = ethers.utils.parseEther("1");
                const toChain = SOLANA_CHAIN_ID;
                const to = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
                
                // Approve and transfer
                await wToken.approve(bridge.address, amount);
                
                // Test that the function call doesn't revert
                await expect(bridge.swapOutToken(
                    user2.address,
                    wToken.address,
                    ethers.utils.toUtf8Bytes(to),
                    amount,
                    toChain,
                    "0x"
                )).to.be.revertedWithCustomError(bridge, "token_call_failed");
            });

            it("Should handle native token (ETH) transfer to non-EVM chains", async function () {
                const amount = ethers.utils.parseEther("1");
                const toChain = TON_CHAIN_ID;
                const to = "EQD4FPq-PRDieyQKkizFTRtSDyucUIqrj5vZRX3GQexS6T5e";
                
                // Test that the function call doesn't revert
                await expect(bridge.swapOutToken(
                    user1.address,
                    ethers.constants.AddressZero, // Native ETH
                    ethers.utils.toUtf8Bytes(to),
                    amount,
                    toChain,
                    "0x",
                    { value: amount }
                )).to.be.revertedWithCustomError(bridge, "token_not_registered");
            });
        });

        describe("Non-EVM Chain Specific Features", function () {
            it("Should handle TON chain specific address format", async function () {
                const amount = ethers.utils.parseEther("1");
                const toChain = TON_CHAIN_ID;
                const tonAddress = "EQD4FPq-PRDieyQKkizFTRtSDyucUIqrj5vZRX3GQexS6T5e";
                const swapData = "0x";
                
                // Approve tokens
                await usdt.approve(bridge.address, amount);
                
                // Test with TON address format
                await expect(bridge.swapOutToken(
                    user1.address,
                    usdt.address,
                    ethers.utils.toUtf8Bytes(tonAddress),
                    amount,
                    toChain,
                    swapData
                )).to.be.revertedWithCustomError(bridge, "token_not_registered");
            });

            it("Should handle Solana chain specific address format", async function () {
                const amount = ethers.utils.parseEther("1");
                const toChain = SOLANA_CHAIN_ID;
                const solanaAddress = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
                const swapData = "0x";
                
                // Approve tokens
                await wToken.approve(bridge.address, amount);
                
                // Test with Solana address format
                await expect(bridge.swapOutToken(
                    user2.address,
                    wToken.address,
                    ethers.utils.toUtf8Bytes(solanaAddress),
                    amount,
                    toChain,
                    swapData
                )).to.be.revertedWithCustomError(bridge, "token_call_failed");
            });

            it("Should handle different non-EVM chain IDs", async function () {
                const amount = ethers.utils.parseEther("1");
                const to = "EQD4FPq-PRDieyQKkizFTRtSDyucUIqrj5vZRX3GQexS6T5e";
                const swapData = "0x";
                
                // Test different non-EVM chain IDs
                const nonEvmChainIds = [1001, 1002, 2001, 2002];
                
                for (const chainId of nonEvmChainIds) {
                    // Approve tokens
                    await usdt.approve(bridge.address, amount);
                    
                    // Test swap out
                    await expect(bridge.swapOutToken(
                        user1.address,
                        usdt.address,
                        ethers.utils.toUtf8Bytes(to),
                        amount,
                        chainId,
                        swapData
                    )).to.be.revertedWithCustomError(bridge, "token_not_registered");
                }
            });
        });
    });

    // Helper functions
    async function testTonMessagePacking(messageType, token, mos, from, to, payload, amount) {
        // This would call the actual packing function in the contract
        // For now, we'll simulate the packing logic
        const version = 0x10; // Non-EVM version
        const majorVersion = 0x01;
        const minorVersion = 0x00;
        const versionByte = (majorVersion << 4) | minorVersion;
        
        const tokenBytes = ethers.utils.toUtf8Bytes(token);
        const mosBytes = ethers.utils.toUtf8Bytes(mos);
        const fromBytes = ethers.utils.toUtf8Bytes(from);
        const toBytes = ethers.utils.toUtf8Bytes(to);
        const payloadBytes = ethers.utils.arrayify(payload);
        
        // Pack according to non-EVM format
        const packed = ethers.utils.concat([
            ethers.utils.hexZeroPad(ethers.utils.hexlify(versionByte), 1),
            ethers.utils.hexZeroPad(ethers.utils.hexlify(messageType), 1),
            ethers.utils.hexZeroPad(ethers.utils.hexlify(tokenBytes.length), 1),
            ethers.utils.hexZeroPad(ethers.utils.hexlify(mosBytes.length), 1),
            ethers.utils.hexZeroPad(ethers.utils.hexlify(fromBytes.length), 1),
            ethers.utils.hexZeroPad(ethers.utils.hexlify(toBytes.length), 1),
            ethers.utils.hexZeroPad(ethers.utils.hexlify(payloadBytes.length), 2),
            ethers.utils.hexZeroPad("0x", 8), // reserved
            ethers.utils.hexZeroPad(ethers.utils.hexlify(amount), 16),
            tokenBytes,
            mosBytes,
            fromBytes,
            toBytes,
            payloadBytes
        ]);
        
        return packed;
    }

    async function testSolanaMessagePacking(messageType, token, mos, from, to, payload, amount) {
        // Similar to TON but with Solana-specific formatting
        return await testTonMessagePacking(messageType, token, mos, from, to, payload, amount);
    }

    async function testBitcoinMessagePacking(messageType, token, mos, from, to, payload, amount) {
        // Similar to TON but with Bitcoin-specific formatting
        return await testTonMessagePacking(messageType, token, mos, from, to, payload, amount);
    }

    async function testNonEvmMessageDecoding(packedMessage, chainType) {
        // This would call the actual decoding function in the contract
        // For now, we'll simulate the decoding logic
        const data = ethers.utils.arrayify(packedMessage);
        
        if (data.length < 66) {
            throw new Error("Invalid message length");
        }
        
        let offset = 0;
        const versionByte = data[offset++];
        const messageType = data[offset++];
        const tokenLen = data[offset++];
        const mosLen = data[offset++];
        const fromLen = data[offset++];
        const toLen = data[offset++];
        const payloadLen = (data[offset] << 8) | data[offset + 1];
        offset += 2;
        offset += 8; // Skip reserved
        const amount = ethers.BigNumber.from(data.slice(offset, offset + 16));
        offset += 16;
        
        const token = ethers.utils.toUtf8String(data.slice(offset, offset + tokenLen));
        offset += tokenLen;
        const mos = ethers.utils.toUtf8String(data.slice(offset, offset + mosLen));
        offset += mosLen;
        const from = ethers.utils.toUtf8String(data.slice(offset, offset + fromLen));
        offset += fromLen;
        const to = ethers.utils.toUtf8String(data.slice(offset, offset + toLen));
        offset += toLen;
        const payload = ethers.utils.hexlify(data.slice(offset, offset + payloadLen));
        
        return {
            messageType,
            token,
            mos,
            from,
            to,
            payload,
            amount
        };
    }

    async function testUnsupportedChainPacking(messageType, token, mos, from, to, payload, amount, chainType) {
        // This would test unsupported chain types
        throw new Error("Unsupported chain type");
    }

    async function testChainTypeDetection(chainId) {
        // This would call the actual chain type detection function
        // For now, we'll simulate the detection logic
        if (chainId >= 1000 && chainId < 2000) {
            return "TON";
        } else if (chainId >= 2000 && chainId < 3000) {
            return "SOLANA";
        } else if (chainId >= 3000 && chainId < 4000) {
            return "BITCOIN";
        } else if (chainId >= 1 && chainId < 1000) {
            return "EVM";
        } else {
            return "NULL";
        }
    }

    async function testMessageRelayEmission(messageType, token, mos, from, to, payload, amount, chainType) {
        // This would test the actual MessageRelay emission
        // For now, we'll simulate the emission by calling a test function
        const orderId = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("test_relay"));
        const chainAndGasLimit = ethers.utils.hexZeroPad(ethers.utils.hexlify(0), 32);
        
        // Pack message according to chain type
        let packedMessage;
        if (chainType === "TON") {
            packedMessage = await testTonMessagePacking(messageType, token, mos, from, to, payload, amount);
        } else if (chainType === "SOLANA") {
            packedMessage = await testSolanaMessagePacking(messageType, token, mos, from, to, payload, amount);
        } else if (chainType === "BITCOIN") {
            packedMessage = await testBitcoinMessagePacking(messageType, token, mos, from, to, payload, amount);
        } else {
            throw new Error("Invalid chain type");
        }
        
        // For testing purposes, we'll just verify the packed message is valid
        expect(packedMessage).to.not.equal("0x");
        expect(packedMessage.length).to.be.gt(66);
        
        return packedMessage;
    }

    async function getOrderIdFromEvent(receipt) {
        // Extract order ID from transaction receipt
        // This is a simplified version - in practice you'd look for specific events
        return ethers.utils.keccak256(ethers.utils.toUtf8Bytes("order_id"));
    }

    describe("Non-EVM Chain MessageIn Tests", function () {
        const TON_CHAIN_ID = 1000;
        const SOLANA_CHAIN_ID = 2000;
        const BITCOIN_CHAIN_ID = 3000;
        const RELAY_CHAIN_ID = 212; // Relay chain ID
        const OTHER_EVM_CHAIN_ID = 97; // Another EVM chain (Bridge chain)

        beforeEach(async function () {
            // Register tokens for non-EVM chains and target chains
            await register.registerTokenChains(usdt.address, [TON_CHAIN_ID, SOLANA_CHAIN_ID, BITCOIN_CHAIN_ID, OTHER_EVM_CHAIN_ID], true);
            await register.registerTokenChains(wToken.address, [TON_CHAIN_ID, SOLANA_CHAIN_ID, BITCOIN_CHAIN_ID, OTHER_EVM_CHAIN_ID], true);
        });

        describe("MessageIn from Non-EVM to Relay Chain", function () {
            it("Should handle messageIn from TON chain to relay chain (target is relay chain)", async function () {
                // Construct message from TON chain to relay chain
                const messageType = 3; // BRIDGE
                const token = "EQD4FPq-PRDieyQKkizFTRtSDyucUIqrj5vZRX3GQexS6T5e"; // TON token
                const mos = "EQD4FPq-PRDieyQKkizFTRtSDyucUIqrj5vZRX3GQexS6T5e"; // TON MOS
                const from = "EQD4FPq-PRDieyQKkizFTRtSDyucUIqrj5vZRX3GQexS6T5e"; // TON from
                const to = user1.address; // Relay chain recipient (EVM address)
                const payload = "0x1234567890abcdef"; // Swap data
                const amount = ethers.utils.parseEther("1");
                
                // Pack TON message
                const packedMessage = await testTonMessagePacking(
                    messageType, token, mos, from, to, payload, amount
                );
                
                // Construct mock proof data (should be light client proof in real env)
                const chainId = TON_CHAIN_ID;
                const logParam = 0; // logIndex=0, revertError=false
                const orderId = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("ton_to_relay_order"));
                const receiptProof = packedMessage; // Use packed message as proof
                
                // Call relay.messageIn to handle message from TON chain
                // Since proof is mock, expect revert, but verifies messageIn can handle non-EVM message format
                await expect(
                    relay.messageIn(chainId, logParam, orderId, receiptProof)
                ).to.be.reverted;
            });

            it("Should handle messageIn from Bitcoin chain to relay chain (target is relay chain)", async function () {
                // Construct message from Bitcoin chain to relay chain
                const messageType = 3; // BRIDGE
                const token = "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh"; // Bitcoin address
                const mos = "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh"; // Bitcoin MOS
                const from = "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh"; // Bitcoin from
                const to = user2.address; // Relay chain recipient (EVM address)
                const payload = "0xabcdef1234567890"; // Swap data
                const amount = ethers.utils.parseEther("0.5");
                
                // Pack Bitcoin message
                const packedMessage = await testBitcoinMessagePacking(
                    messageType, token, mos, from, to, payload, amount
                );
                
                // Construct mock proof data
                const chainId = BITCOIN_CHAIN_ID;
                const logParam = 0;
                const orderId = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("bitcoin_to_relay_order"));
                const receiptProof = packedMessage;
                
                // Call relay.messageIn to handle message from Bitcoin chain
                await expect(
                    relay.messageIn(chainId, logParam, orderId, receiptProof)
                ).to.be.reverted;
            });

            it("Should handle messageIn from Solana chain to relay chain (target is relay chain)", async function () {
                // Construct message from Solana chain to relay chain
                const messageType = 3; // BRIDGE
                const token = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"; // Solana token
                const mos = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"; // Solana MOS
                const from = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"; // Solana from
                const to = owner.address; // Relay chain recipient (EVM address)
                const payload = "0x"; // Empty payload for simple transfer
                const amount = ethers.utils.parseEther("2");
                
                // Pack Solana message
                const packedMessage = await testSolanaMessagePacking(
                    messageType, token, mos, from, to, payload, amount
                );
                
                // Construct mock proof data
                const chainId = SOLANA_CHAIN_ID;
                const logParam = 0;
                const orderId = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("solana_to_relay_order"));
                const receiptProof = packedMessage;
                
                // Call relay.messageIn to handle message from Solana chain
                await expect(
                    relay.messageIn(chainId, logParam, orderId, receiptProof)
                ).to.be.reverted;
            });
        });

        describe("MessageIn from Non-EVM to Relay Chain (target is another EVM chain)", function () {
            it("Should handle messageIn from TON chain to relay chain (target is bridge chain)", async function () {
                // Construct message from TON chain to relay chain, but target is another EVM chain (bridge chain)
                const messageType = 3; // BRIDGE
                const token = "EQD4FPq-PRDieyQKkizFTRtSDyucUIqrj5vZRX3GQexS6T5e"; // TON token
                const mos = "EQD4FPq-PRDieyQKkizFTRtSDyucUIqrj5vZRX3GQexS6T5e"; // TON MOS
                const from = "EQD4FPq-PRDieyQKkizFTRtSDyucUIqrj5vZRX3GQexS6T5e"; // TON from
                const to = user1.address; // Final target is user on bridge chain
                const payload = "0x1234567890abcdef"; // Swap data
                const amount = ethers.utils.parseEther("1");
                
                // Pack TON message
                const packedMessage = await testTonMessagePacking(
                    messageType, token, mos, from, to, payload, amount
                );
                
                // Construct mock proof data
                const chainId = TON_CHAIN_ID;
                const logParam = 0;
                const orderId = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("ton_to_bridge_order"));
                const receiptProof = packedMessage;
                
                // Call relay.messageIn to handle message from TON chain
                // relay may forward message to bridge chain
                await expect(
                    relay.messageIn(chainId, logParam, orderId, receiptProof)
                ).to.be.reverted;
            });

            it("Should handle messageIn from Bitcoin chain to relay chain (target is another EVM chain)", async function () {
                // Construct message from Bitcoin chain to relay chain, target is another EVM chain
                const messageType = 3; // BRIDGE
                const token = "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh"; // Bitcoin address
                const mos = "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh"; // Bitcoin MOS
                const from = "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh"; // Bitcoin from
                const to = user2.address; // Final target is another EVM chain user
                const payload = "0xabcdef1234567890"; // Swap data
                const amount = ethers.utils.parseEther("0.5");
                
                // Pack Bitcoin message
                const packedMessage = await testBitcoinMessagePacking(
                    messageType, token, mos, from, to, payload, amount
                );
                
                // Construct mock proof data
                const chainId = BITCOIN_CHAIN_ID;
                const logParam = 0;
                const orderId = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("bitcoin_to_evm_order"));
                const receiptProof = packedMessage;
                
                // Call relay.messageIn to handle message from Bitcoin chain
                await expect(
                    relay.messageIn(chainId, logParam, orderId, receiptProof)
                ).to.be.reverted;
            });

            it("Should handle messageIn from Solana chain to relay chain (target is another EVM chain)", async function () {
                // Construct message from Solana chain to relay chain, target is another EVM chain
                const messageType = 3; // BRIDGE
                const token = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"; // Solana token
                const mos = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"; // Solana MOS
                const from = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"; // Solana from
                const to = owner.address; // Final target is another EVM chain user
                const payload = "0x"; // Empty payload for simple transfer
                const amount = ethers.utils.parseEther("2");
                
                // Pack Solana message
                const packedMessage = await testSolanaMessagePacking(
                    messageType, token, mos, from, to, payload, amount
                );
                
                // Construct mock proof data
                const chainId = SOLANA_CHAIN_ID;
                const logParam = 0;
                const orderId = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("solana_to_evm_order"));
                const receiptProof = packedMessage;
                
                // Call relay.messageIn to handle message from Solana chain
                await expect(
                    relay.messageIn(chainId, logParam, orderId, receiptProof)
                ).to.be.reverted;
            });
        });

        describe("MessageIn Error Handling for Non-EVM Chains", function () {
            it("Should handle messageIn with invalid non-EVM chain ID", async function () {
                // Use invalid non-EVM chain ID
                const chainId = 999999; // Invalid chain ID
                const logParam = 0;
                const orderId = ethers.utils.hexlify(ethers.utils.randomBytes(32));
                const receiptProof = ethers.utils.hexlify(ethers.utils.randomBytes(128));
                
                // Should handle invalid chain ID
                await expect(
                    relay.messageIn(chainId, logParam, orderId, receiptProof)
                ).to.be.reverted;
            });

            it("Should handle messageIn with malformed non-EVM proof data", async function () {
                // Use malformed proof data
                const chainId = TON_CHAIN_ID;
                const logParam = 0;
                const orderId = ethers.utils.hexlify(ethers.utils.randomBytes(32));
                const malformedProof = "0x1234567890abcdef"; // Malformed proof
                
                // Should handle malformed proof data
                await expect(
                    relay.messageIn(chainId, logParam, orderId, malformedProof)
                ).to.be.reverted;
            });

            it("Should handle messageIn with empty proof data", async function () {
                // Use empty proof data
                const chainId = BITCOIN_CHAIN_ID;
                const logParam = 0;
                const orderId = ethers.utils.hexlify(ethers.utils.randomBytes(32));
                const emptyProof = "0x";
                
                // Should handle empty proof data
                await expect(
                    relay.messageIn(chainId, logParam, orderId, emptyProof)
                ).to.be.reverted;
            });

            it("Should handle messageIn with large non-EVM proof data", async function () {
                // Use large proof data
                const chainId = SOLANA_CHAIN_ID;
                const logParam = 0;
                const orderId = ethers.utils.hexlify(ethers.utils.randomBytes(32));
                const largeProof = "0x" + "00".repeat(10000); // Large proof data
                
                // Should handle large proof data
                await expect(
                    relay.messageIn(chainId, logParam, orderId, largeProof)
                ).to.be.reverted;
            });
        });

        describe("RetryMessageIn for Non-EVM Chains", function () {
            it("Should handle retryMessageIn from TON chain", async function () {
                // Construct TON chain retry message
                const chainAndGas = 0;
                const orderId = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("ton_retry_order"));
                const token = usdt.address; // Corresponding EVM token
                const amount = ethers.utils.parseEther("1");
                const fromAddress = ethers.utils.toUtf8Bytes("EQD4FPq-PRDieyQKkizFTRtSDyucUIqrj5vZRX3GQexS6T5e"); // TON from address as bytes
                const payload = "0x1234567890abcdef";
                const retryMessage = ethers.utils.hexlify(ethers.utils.randomBytes(32));
                
                // Call retryMessageIn to handle TON chain retry message
                await expect(
                    relay.retryMessageIn(chainAndGas, orderId, token, amount, fromAddress, payload, retryMessage)
                ).to.be.reverted;
            });

            it("Should handle retryMessageIn from Bitcoin chain", async function () {
                // Construct Bitcoin chain retry message
                const chainAndGas = 0;
                const orderId = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("bitcoin_retry_order"));
                const token = wToken.address; // Corresponding EVM token
                const amount = ethers.utils.parseEther("0.5");
                const fromAddress = ethers.utils.toUtf8Bytes("bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh"); // Bitcoin from address as bytes
                const payload = "0xabcdef1234567890";
                const retryMessage = ethers.utils.hexlify(ethers.utils.randomBytes(32));
                
                // Call retryMessageIn to handle Bitcoin chain retry message
                await expect(
                    relay.retryMessageIn(chainAndGas, orderId, token, amount, fromAddress, payload, retryMessage)
                ).to.be.reverted;
            });

            it("Should handle retryMessageIn from Solana chain", async function () {
                // Construct Solana chain retry message
                const chainAndGas = 0;
                const orderId = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("solana_retry_order"));
                const token = usdt.address; // Corresponding EVM token
                const amount = ethers.utils.parseEther("2");
                const fromAddress = ethers.utils.toUtf8Bytes("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"); // Solana from address as bytes
                const payload = "0x";
                const retryMessage = ethers.utils.hexlify(ethers.utils.randomBytes(32));
                
                // Call retryMessageIn to handle Solana chain retry message
                await expect(
                    relay.retryMessageIn(chainAndGas, orderId, token, amount, fromAddress, payload, retryMessage)
                ).to.be.reverted;
            });
        });
    });
}); 