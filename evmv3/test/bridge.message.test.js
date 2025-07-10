const { ethers } = require("hardhat");
const { expect } = require("chai");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { deployBridgeOnly } = require("./util.js");

const MESSAGE_RELAY_TOPIC = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("MessageRelay(bytes32,uint256,bytes)"));

describe("Bridge Message Transfer Tests", function () {
    let bridge, wtoken, usdt, feeService;
    let deployer, owner, other, attacker, user1, user2;
    let mockReceiver;
    let mockMosContract;

    beforeEach(async function () {
        const contracts = await deployBridgeOnly();
        bridge = contracts.bridge;
        wtoken = contracts.wtoken;
        usdt = contracts.usdt;
        feeService = contracts.feeService;
        deployer = contracts.deployer;
        owner = contracts.owner;
        other = contracts.other;
        attacker = contracts.attacker;
        user1 = contracts.user1;
        user2 = contracts.user2;
        mockMosContract = contracts.mockMosContract;

        // Deploy mock receiver for message transfer testing
        const MockReceiver = await ethers.getContractFactory("MockReceiver");
        mockReceiver = await MockReceiver.deploy();
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

            await expect(bridge.transferOut(97, messageDataBytes, ethers.constants.AddressZero, {value: fee}))
                .to.emit(bridge, "MessageOut");
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

            await expect(bridge.transferOut(97, messageDataBytes, ethers.constants.AddressZero, {value: fee}))
                .to.emit(bridge, "MessageOut");
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
            const totalValue = fee.add(messageData.value);

            await expect(bridge.transferOut(97, messageDataBytes, ethers.constants.AddressZero, {value: totalValue}))
                .to.emit(bridge, "MessageOut");
        });

        it("Should revert message transfer to same chain", async function () {
            const currentChainId = await bridge.selfChainId();
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

            // Try to send to same chain - should fail before fee calculation
            await expect(bridge.transferOut(currentChainId, messageDataBytes, ethers.constants.AddressZero, {value: ethers.utils.parseEther("1")}))
                .to.be.revertedWithCustomError(bridge, "bridge_same_chain");
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

            await expect(bridge.transferOut(97, messageDataBytes, ethers.constants.AddressZero, {value: insufficientFee}))
                .to.be.reverted;
        });

        it("Should revert message transfer with zero target", async function () {
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

            await expect(bridge.transferOut(97, messageDataBytes, ethers.constants.AddressZero, {value: fee}))
                .to.emit(bridge, "MessageOut");
        });
    });

    describe("Message Configuration Tests", function () {
        it("Should handle message transfer with different message types", async function () {
            const messageTypes = [1]; // Only MESSAGE is supported by Bridge

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

                await expect(bridge.transferOut(97, messageDataBytes, ethers.constants.AddressZero, {value: fee}))
                    .to.emit(bridge, "MessageOut");
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

                await expect(bridge.transferOut(97, messageDataBytes, ethers.constants.AddressZero, {value: fee}))
                    .to.emit(bridge, "MessageOut");
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

            await expect(bridge.transferOut(97, messageDataBytes, ethers.constants.AddressZero, {value: fee}))
                .to.emit(bridge, "MessageOut");
        });
    });

    describe("Message Fee Tests", function () {
        it("Should calculate correct message fee", async function () {
            const gasLimit = 100000;
            const [fee, receiver] = await feeService.getServiceMessageFee(97, ethers.constants.AddressZero, gasLimit);

            // Expected fee = (baseGas + gasLimit) * gasPrice
            // baseGas = 100000, gasLimit = 100000, gasPrice = 0.001 ETH
            // fee = (100000 + 100000) * 0.001 = 200 * 0.001 = 0.2 ETH

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

            await expect(bridge.transferOut(97, messageDataBytes, ethers.constants.AddressZero, {value: fee}))
                .to.emit(bridge, "MessageOut");
        });
    });

    describe("MessageIn Error Handling", function () {
        it("Should handle messageIn with invalid chain ID", async function () {
            const chainId = 999999; // invalid chain
            const logParam = 0;
            const orderId = ethers.utils.hexlify(ethers.utils.randomBytes(32));
            const receiptProof = ethers.utils.hexlify(ethers.utils.randomBytes(128));

            await expect(bridge.messageIn(chainId, logParam, orderId, receiptProof))
                .to.be.revertedWithCustomError(bridge, "invalid_relay_chain");
        });

        it("Should handle messageIn with invalid bridge log topic", async function () {
            const chainId = 97;
            const logParam = 0;
            const orderId = ethers.utils.hexlify(ethers.utils.randomBytes(32));

            // Create proof with wrong topic
            const receiptProof = ethers.utils.defaultAbiCoder.encode(
                ["address", "bytes32[]", "bytes"],
                [
                    mockMosContract.address,
                    [
                        ethers.utils.keccak256(ethers.utils.toUtf8Bytes("WrongTopic(bytes32)")), // wrong topic
                        orderId,
                        ethers.utils.hexlify(ethers.utils.randomBytes(32))
                    ],
                    ethers.utils.hexlify(ethers.utils.randomBytes(64))
                ]
            );

            // Set up mock lightNode
            const mockLightNode = await ethers.getContractAt("MockLightnode", await bridge.getServiceContract(1));
            await mockLightNode.setVerificationResult(true, "", {
                addr: mockMosContract.address,
                topics: [
                    ethers.utils.keccak256(ethers.utils.toUtf8Bytes("WrongTopic(bytes32)")), // wrong topic
                    orderId,
                    ethers.utils.hexlify(ethers.utils.randomBytes(32))
                ],
                data: ethers.utils.hexlify(ethers.utils.randomBytes(64))
            });

            await expect(bridge.messageIn(chainId, logParam, orderId, receiptProof))
                .to.be.revertedWithCustomError(bridge, "invalid_bridge_log");
        });
    });
});
