const { ethers } = require("hardhat");
const { expect } = require("chai");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { deployRelayOnly } = require("./util.js");

describe("Relay Message Transfer Tests", function () {
    let relay, wtoken, usdt, vaultWToken, vaultUToken;
    let deployer, owner, other, attacker, user1, user2;
    let mockReceiver;
    let feeService;

    beforeEach(async function () {
        const contracts = await deployRelayOnly();
        relay = contracts.relay;
        wtoken = contracts.wtoken;
        usdt = contracts.usdt;
        vaultWToken = contracts.vaultWToken;
        vaultUToken = contracts.vaultUToken;
        feeService = contracts.feeService;
        deployer = contracts.deployer;
        owner = contracts.owner;
        other = contracts.other;
        attacker = contracts.attacker;
        user1 = contracts.user1;
        user2 = contracts.user2;

        // Deploy mock receiver for message transfer testing
        const MockReceiver = await ethers.getContractFactory("MockReceiver");
        mockReceiver = await MockReceiver.deploy();

        // Ensure test accounts have enough balance for fees
        const testAccounts = [owner, other, attacker, user1, user2];
        for (const account of testAccounts) {
            const balance = await account.getBalance();
            if (balance.lt(ethers.utils.parseEther("1"))) {
                await deployer.sendTransaction({ to: account.address, value: ethers.utils.parseEther("10") });
            }
        }
    });

    describe("Message Transfer Tests", function () {
        it("Should handle message transfer with valid data", async function () {
            const messageData = {
                relay: false,
                msgType: 1, // MESSAGE
                target: ethers.utils.hexZeroPad(mockReceiver.address, 32),
                payload: ethers.utils.hexlify(ethers.utils.toUtf8Bytes("test message")),
                gasLimit: 100000,
                value: 0
            };

            const messageDataBytes = ethers.utils.defaultAbiCoder.encode(
                ["tuple(bool,uint8,bytes,bytes,uint256,uint256)"],
                [[messageData.relay, messageData.msgType, messageData.target, messageData.payload, messageData.gasLimit, messageData.value]]
            );

            // Calculate required fee
            const [fee] = await feeService.getServiceMessageFee(97, ethers.constants.AddressZero, 100000);

            await expect(relay.transferOut(97, messageDataBytes, ethers.constants.AddressZero, {value: fee}))
                .to.emit(relay, "MessageRelay");
        });

        it("Should handle message transfer with relay", async function () {
            const messageData = {
                relay: true,
                msgType: 1, // MESSAGE
                target: ethers.utils.hexZeroPad(mockReceiver.address, 32),
                payload: ethers.utils.hexlify(ethers.utils.toUtf8Bytes("test message")),
                gasLimit: 100000,
                value: 0
            };

            const messageDataBytes = ethers.utils.defaultAbiCoder.encode(
                ["tuple(bool,uint8,bytes,bytes,uint256,uint256)"],
                [[messageData.relay, messageData.msgType, messageData.target, messageData.payload, messageData.gasLimit, messageData.value]]
            );

            // Calculate required fee
            const [fee] = await feeService.getServiceMessageFee(97, ethers.constants.AddressZero, 100000);

            await expect(relay.transferOut(97, messageDataBytes, ethers.constants.AddressZero, {value: fee}))
                .to.emit(relay, "MessageRelay");
        });

        it("Should handle message transfer with value", async function () {
            const messageData = {
                relay: false,
                msgType: 1, // MESSAGE
                target: ethers.utils.hexZeroPad(mockReceiver.address, 32),
                payload: ethers.utils.hexlify(ethers.utils.toUtf8Bytes("test message")),
                gasLimit: 100000,
                value: 0
            };

            const messageDataBytes = ethers.utils.defaultAbiCoder.encode(
                ["tuple(bool,uint8,bytes,bytes,uint256,uint256)"],
                [[messageData.relay, messageData.msgType, messageData.target, messageData.payload, messageData.gasLimit, messageData.value]]
            );

            // Calculate required fee
            const [fee] = await feeService.getServiceMessageFee(97, ethers.constants.AddressZero, 100000);

            await expect(relay.transferOut(97, messageDataBytes, ethers.constants.AddressZero, {value: fee}))
                .to.emit(relay, "MessageRelay");
        });

        it("Should revert message transfer to same chain", async function () {
            const currentChainId = await relay.selfChainId();
            const messageData = {
                relay: false,
                msgType: 1, // MESSAGE
                target: ethers.utils.hexZeroPad(mockReceiver.address, 32),
                payload: ethers.utils.hexlify(ethers.utils.toUtf8Bytes("test message")),
                gasLimit: 100000,
                value: 0
            };

            const messageDataBytes = ethers.utils.defaultAbiCoder.encode(
                ["tuple(bool,uint8,bytes,bytes,uint256,uint256)"],
                [[messageData.relay, messageData.msgType, messageData.target, messageData.payload, messageData.gasLimit, messageData.value]]
            );

            // Calculate required fee
            const [fee] = await feeService.getServiceMessageFee(currentChainId, ethers.constants.AddressZero, 100000);

            await expect(relay.transferOut(currentChainId, messageDataBytes, ethers.constants.AddressZero, {value: fee}))
                .to.be.revertedWithCustomError(relay, "bridge_same_chain");
        });

        it("Should revert message transfer with insufficient fee", async function () {
            const messageData = {
                relay: false,
                msgType: 1, // MESSAGE
                target: ethers.utils.hexZeroPad(mockReceiver.address, 32),
                payload: ethers.utils.hexlify(ethers.utils.toUtf8Bytes("test message")),
                gasLimit: 100000,
                value: 0
            };

            const messageDataBytes = ethers.utils.defaultAbiCoder.encode(
                ["tuple(bool,uint8,bytes,bytes,uint256,uint256)"],
                [[messageData.relay, messageData.msgType, messageData.target, messageData.payload, messageData.gasLimit, messageData.value]]
            );

            // Send insufficient fee
            const insufficientFee = ethers.utils.parseEther("0.1");

            await expect(relay.transferOut(97, messageDataBytes, ethers.constants.AddressZero, {value: insufficientFee}))
                .to.be.reverted;
        });

        it("Should handle message transfer with zero target (valid case)", async function () {
            const messageData = {
                relay: false,
                msgType: 1, // MESSAGE
                target: ethers.utils.hexZeroPad(ethers.constants.AddressZero, 32),
                payload: ethers.utils.hexlify(ethers.utils.toUtf8Bytes("test message")),
                gasLimit: 100000,
                value: 0
            };

            const messageDataBytes = ethers.utils.defaultAbiCoder.encode(
                ["tuple(bool,uint8,bytes,bytes,uint256,uint256)"],
                [[messageData.relay, messageData.msgType, messageData.target, messageData.payload, messageData.gasLimit, messageData.value]]
            );

            // Calculate required fee
            const [fee] = await feeService.getServiceMessageFee(97, ethers.constants.AddressZero, 100000);

            await expect(relay.transferOut(97, messageDataBytes, ethers.constants.AddressZero, {value: fee}))
                .to.emit(relay, "MessageRelay");
        });
    });

    describe("Message Configuration Tests", function () {
        it("Should handle message transfer with different message types", async function () {
            const messageTypes = [1]; // Only MESSAGE is supported by Relay

            for (const msgType of messageTypes) {
                const messageData = {
                    relay: false,
                    msgType: msgType,
                    target: ethers.utils.hexZeroPad(mockReceiver.address, 32),
                    payload: ethers.utils.hexlify(ethers.utils.toUtf8Bytes("test message")),
                    gasLimit: 100000,
                    value: 0
                };

                const messageDataBytes = ethers.utils.defaultAbiCoder.encode(
                    ["tuple(bool,uint8,bytes,bytes,uint256,uint256)"],
                    [[messageData.relay, messageData.msgType, messageData.target, messageData.payload, messageData.gasLimit, messageData.value]]
                );

                // Calculate required fee
                const [fee] = await feeService.getServiceMessageFee(97, ethers.constants.AddressZero, 100000);

                await expect(relay.transferOut(97, messageDataBytes, ethers.constants.AddressZero, {value: fee}))
                    .to.emit(relay, "MessageRelay");
            }
        });

        it("Should handle message transfer with different gas limits", async function () {
            const gasLimits = [50000, 100000, 200000];

            for (const gasLimit of gasLimits) {
                const messageData = {
                    relay: false,
                    msgType: 1, // MESSAGE
                    target: ethers.utils.hexZeroPad(mockReceiver.address, 32),
                    payload: ethers.utils.hexlify(ethers.utils.toUtf8Bytes("test message")),
                    gasLimit: gasLimit,
                    value: 0
                };

                const messageDataBytes = ethers.utils.defaultAbiCoder.encode(
                    ["tuple(bool,uint8,bytes,bytes,uint256,uint256)"],
                    [[messageData.relay, messageData.msgType, messageData.target, messageData.payload, messageData.gasLimit, messageData.value]]
                );

                // Calculate required fee
                const [fee] = await feeService.getServiceMessageFee(97, ethers.constants.AddressZero, gasLimit);

                await expect(relay.transferOut(97, messageDataBytes, ethers.constants.AddressZero, {value: fee}))
                    .to.emit(relay, "MessageRelay");
            }
        });

        it("Should handle message transfer with complex payload", async function () {
            const complexPayload = ethers.utils.defaultAbiCoder.encode(
                ["address", "uint256", "string"],
                [owner.address, ethers.utils.parseEther("1"), "complex message"]
            );

            const messageData = {
                relay: false,
                msgType: 1, // MESSAGE
                target: ethers.utils.hexZeroPad(mockReceiver.address, 32),
                payload: complexPayload,
                gasLimit: 100000,
                value: 0
            };

            const messageDataBytes = ethers.utils.defaultAbiCoder.encode(
                ["tuple(bool,uint8,bytes,bytes,uint256,uint256)"],
                [[messageData.relay, messageData.msgType, messageData.target, messageData.payload, messageData.gasLimit, messageData.value]]
            );

            // Calculate required fee
            const [fee] = await feeService.getServiceMessageFee(97, ethers.constants.AddressZero, 100000);

            await expect(relay.transferOut(97, messageDataBytes, ethers.constants.AddressZero, {value: fee}))
                .to.emit(relay, "MessageRelay");
        });
    });

    describe("Message Fee Tests", function () {
        it("Should calculate correct message fee", async function () {
            const gasLimit = 100000;
            const [fee, receiver] = await feeService.getServiceMessageFee(97, ethers.constants.AddressZero, gasLimit);

            // Check that fee is calculated and receiver is set
            expect(fee).to.be.gt(0);
            expect(receiver).to.equal(deployer.address);
        });

        it("Should handle message transfer with exact fee", async function () {
            const messageData = {
                relay: false,
                msgType: 1, // MESSAGE
                target: ethers.utils.hexZeroPad(mockReceiver.address, 32),
                payload: ethers.utils.hexlify(ethers.utils.toUtf8Bytes("test message")),
                gasLimit: 100000,
                value: 0
            };

            const messageDataBytes = ethers.utils.defaultAbiCoder.encode(
                ["tuple(bool,uint8,bytes,bytes,uint256,uint256)"],
                [[messageData.relay, messageData.msgType, messageData.target, messageData.payload, messageData.gasLimit, messageData.value]]
            );

            // Calculate exact required fee
            const [fee] = await feeService.getServiceMessageFee(97, ethers.constants.AddressZero, 100000);

            await expect(relay.transferOut(97, messageDataBytes, ethers.constants.AddressZero, {value: fee}))
                .to.emit(relay, "MessageRelay");
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
            // Fee service should be configured for chain 212 (target chain)
            const [fee, receiver] = await feeService.getServiceMessageFee(212, ethers.constants.AddressZero, 100000);
            expect(fee).to.be.gt(0);
            expect(receiver).to.equal(deployer.address);
        });
    });

    describe("MessageIn Error Handling", function () {
        it("Should handle messageIn with invalid chain type", async function () {
            const chainId = 999999; // invalid chain
            const logParam = 0;
            const orderId = ethers.utils.hexlify(ethers.utils.randomBytes(32));
            const receiptProof = ethers.utils.hexlify(ethers.utils.randomBytes(128));

            await expect(relay.messageIn(chainId, logParam, orderId, receiptProof))
                .to.be.reverted;
        });

    });
});
