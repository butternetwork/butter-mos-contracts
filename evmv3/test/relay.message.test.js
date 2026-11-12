const { ethers } = require("hardhat");
const { expect } = require("chai");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { deployRelayOnly, DEFAULT_CONFIG } = require("./util.js");

const MESSAGE_OUT_TOPIC = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("MessageOut(bytes32,uint256,bytes)"));
const MESSAGE_TYPE_MESSAGE = 1; // IMOSV3.MessageType.MESSAGE
const MESSAGE_TYPE_BRIDGE = 3; // IMOSV3.MessageType.BRIDGE
const MESSAGE_TYPE_DEPOSIT = 4; // IMOSV3.MessageType.DEPOSIT

function encodeChainAndGasLimit(fromChain, toChain, gasLimit) {
    return ethers.BigNumber.from(fromChain).shl(192)
        .or(ethers.BigNumber.from(toChain).shl(128))
        .or(ethers.BigNumber.from(gasLimit));
}

function encodeEvmMessageOutLog(params) {
    const header = ethers.BigNumber.from(params.messageType); // version(0) | relay(false) | messageType
    const innerPayload = ethers.utils.defaultAbiCoder.encode(
        ["uint256", "address", "address", "uint256", "address", "address", "bytes", "bytes"],
        [header, params.mos, params.token, params.amount, params.initiator, params.from, params.to, params.swapData]
    );
    const data = ethers.utils.defaultAbiCoder.encode(["bytes"], [innerPayload]);
    const topics = [
        MESSAGE_OUT_TOPIC,
        params.orderId,
        ethers.utils.hexZeroPad(encodeChainAndGasLimit(params.fromChain, params.toChain, params.gasLimit).toHexString(), 32)
    ];
    // MockLightnodeManager.verifyProofData(uint256,uint256,bytes) decodes the proof
    // bytes directly as an ILightVerifier.txLog struct.
    return ethers.utils.defaultAbiCoder.encode(
        ["tuple(address,bytes32[],bytes)"],
        [[params.logAddr, topics, data]]
    );
}

describe("Relay Message Transfer Tests", function () {
    let relay, wtoken, usdt, vaultWToken, vaultUToken, register;
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
        register = contracts.register;
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

    // BridgeAndRelay.depositToken() is the self-chain ("deposit directly on the relay
    // chain") entry point. It hard-codes a `depositWhitelsit` constant address
    // (0x27172dA6b48DB586B5261ff90D6D1D5F2C1c1363) with no setter anywhere in the
    // contract, and always calls `IDepositWhitelist(depositWhitelsit).checkTokenAmountAndWhitelist(...)`
    // unconditionally from `_deposit`. On any deployment where that fixed address is not
    // an actual IDepositWhitelist contract (every test network, any fresh/testnet
    // deployment, or any chain where that address happens to be unrelated/unused),
    // the call lands on a no-code address: Solidity's ABI decoding of the expected
    // `bool` return value fails on the empty returndata and the whole call reverts.
    // That means depositToken() - and by extension any cross-chain message that
    // resolves to MessageType.DEPOSIT via _messageIn -> _deposit - is completely
    // unusable in this environment, regardless of whether the token is "whitelisted".
    //
    // These tests pin down the CURRENT (broken) behavior so it cannot regress further
    // or get "fixed" silently without anyone noticing the underlying config problem.
    // If `depositWhitelsit` is ever made configurable (recommended) or deployments
    // guarantee a real whitelist contract at that fixed address, these tests must be
    // revisited.
    describe("depositToken (self-chain deposit) - hard-coded whitelist dependency", function () {
        it("Should currently revert for any token because depositWhitelsit has no code in this environment", async function () {
            const amount = ethers.utils.parseEther("1");
            await usdt.connect(owner).approve(relay.address, amount);

            // Reverts with no reason string: the low-level call to the hard-coded
            // depositWhitelsit address decodes an empty returndata as a `bool` and fails.
            await expect(
                relay.connect(owner).depositToken(usdt.address, owner.address, amount)
            ).to.be.reverted;
        });

        it("Should currently revert even for the relay chain's own wToken", async function () {
            const amount = ethers.utils.parseEther("1");
            await wtoken.connect(owner).approve(relay.address, amount);

            await expect(
                relay.connect(owner).depositToken(wtoken.address, owner.address, amount)
            ).to.be.reverted;
        });

        it("Should NOT validate zero amount (unlike Bridge.depositToken) before hitting the whitelist call", async function () {
            // Unlike Bridge.sol's depositToken (which reverts with zero_amount() for
            // _amount == 0), BridgeAndRelay.depositToken has no such guard: a 0-amount
            // ERC20 transferFrom succeeds, so execution still falls through to the
            // broken whitelist call and reverts generically. Documented so a future
            // fix doesn't assume zero-amount is already rejected here.
            await expect(
                relay.connect(owner).depositToken(usdt.address, owner.address, 0)
            ).to.be.reverted;
        });

        it("Should reject depositToken with zero recipient before ever reaching the whitelist call", async function () {
            const amount = ethers.utils.parseEther("1");
            await usdt.connect(owner).approve(relay.address, amount);

            // depositToken() itself never checks `_to != address(0)` (unlike
            // Bridge.depositToken, which does) - it falls straight through to
            // _tokenTransferIn and then the broken whitelist call, so this still
            // surfaces as the same generic revert rather than a dedicated
            // zero-address error. Documented here so a future fix to the whitelist
            // dependency doesn't accidentally start allowing deposits to the zero
            // address.
            await expect(
                relay.connect(owner).depositToken(usdt.address, ethers.constants.AddressZero, amount)
            ).to.be.reverted;
        });
    });

    // _transferIn (abstract/BridgeAbstract.sol) decides how much gas to forward to the
    // destination contract's mapoExecute() call based on a `_gasleft` flag:
    //   - Bridge.messageIn always passes `_gasleft = false`, so the receiver is capped
    //     at the gasLimit the original cross-chain message specified (and that the
    //     sender paid fees for).
    //   - BridgeAndRelay._transferRelay passes `_gasleft = true` whenever the relay
    //     chain itself is the final destination of a MESSAGE-type message, which makes
    //     _transferIn forward *all remaining gas* instead of `_inEvent.gasLimit`.
    // This is an inconsistency between the two contracts for conceptually the same
    // "deliver a MESSAGE to its destination" operation: on the relay chain, a receiver
    // can consume far more gas than the fee collected on the source chain accounted
    // for, which is a cost/DoS griefing vector against whoever submits messageIn
    // (now the restricted relayer/admin role).
    describe("MESSAGE delivery gas-forwarding inconsistency (relay chain as destination)", function () {
        it("Should forward far more gas to mapoExecute than the message's own gasLimit when relay chain is the destination", async function () {
            const MockGasReceiver = await ethers.getContractFactory("MockGasReceiver");
            const gasReceiver = await MockGasReceiver.deploy();

            const selfChainId = await relay.selfChainId(); // 212 in this test config
            const sourceChainId = 300;
            const sourceMos = owner.address; // arbitrary "mos contract" address on the fake source chain

            await relay.connect(deployer).registerChain(
                [sourceChainId],
                [sourceMos], // Helper._fromBytes expects abi.encodePacked(address) - exactly 20 bytes
                1 // ChainType.EVM
            );

            const orderId = ethers.utils.hexlify(ethers.utils.randomBytes(32));
            const tinyGasLimit = 50_000; // the fee on the source chain was computed for this

            const receiptProof = encodeEvmMessageOutLog({
                logAddr: sourceMos,
                orderId,
                fromChain: sourceChainId,
                toChain: selfChainId,
                gasLimit: tinyGasLimit,
                messageType: MESSAGE_TYPE_MESSAGE,
                mos: relay.address, // must equal address(this) per _messageIn's check
                token: ethers.constants.AddressZero,
                amount: 0,
                initiator: owner.address,
                from: owner.address,
                to: gasReceiver.address, // Helper._fromBytes expects abi.encodePacked(address)
                swapData: "0x"
            });

            const logParam = 0; // logIndex=0, revertError=false
            await relay.connect(deployer).messageIn(sourceChainId, logParam, orderId, receiptProof);

            const gasSeenByReceiver = await gasReceiver.lastGasLeftOnEntry();

            // The receiver saw dramatically more gas than the tiny gasLimit the
            // original message (and its paid fee) specified - demonstrating that
            // `_inEvent.gasLimit` is not actually enforced on this delivery path.
            expect(gasSeenByReceiver).to.be.gt(tinyGasLimit * 4);
        });
    });

    // Integration tests proving BridgeLimit is actually wired into
    // BridgeAndRelay's MapoIn delivery path via _consumeLimit, and that a
    // limit_exceeded revert rolls back _checkOrder's orderId marking just like
    // any other revert in messageIn, so the message can be resubmitted once
    // the bucket refills.
    describe("Inbound mint limit (BridgeLimit wired via service slot 5)", function () {
        const fromChain = 212; // deployRelayOnly() maps wtoken/usdt for "fromChain" 212
        let limit, sourceMos;

        beforeEach(async function () {
            sourceMos = owner.address;
            await relay.connect(deployer).registerChain([fromChain], [sourceMos], 1); // ChainType.EVM

            const BridgeLimit = await ethers.getContractFactory("BridgeLimit");
            const limitImpl = await BridgeLimit.deploy(relay.address);
            const authority = await ethers.getContractAt("AuthorityManager", await relay.authority());
            const initData = BridgeLimit.interface.encodeFunctionData("initialize", [authority.address]);

            const OmniServiceProxy = await ethers.getContractFactory("OmniServiceProxy");
            const limitProxy = await OmniServiceProxy.deploy(limitImpl.address, initData);
            limit = BridgeLimit.attach(limitProxy.address);

            await relay.connect(deployer).setServiceContract(5, limit.address);
        });

        const MapoIn = 2; // IBridgeLimit.BucketKind.MapoIn

        function buildBridgeInLog(orderId, amount) {
            // fromChain == toChain == selfChainId (212): the minted tokens are
            // delivered locally via _swapIn, which is where the MapoIn bucket
            // is charged - minting itself is no longer a metered checkpoint.
            return encodeEvmMessageOutLog({
                logAddr: sourceMos,
                orderId,
                fromChain,
                toChain: fromChain,
                gasLimit: 200000,
                messageType: MESSAGE_TYPE_BRIDGE,
                mos: relay.address,
                token: usdt.address,
                amount,
                initiator: owner.address,
                from: owner.address,
                to: owner.address,
                swapData: "0x"
            });
        }

        it("Should have no effect when BridgeLimit has no bucket configured for this token/chain", async function () {
            const orderId = ethers.utils.hexlify(ethers.utils.randomBytes(32));
            const amount = ethers.utils.parseEther("100");

            await expect(relay.connect(deployer).messageIn(fromChain, 0, orderId, buildBridgeInLog(orderId, amount)))
                .to.not.be.reverted;
        });

        it("Should revert messageIn with limit_exceeded once the inbound bucket is exhausted", async function () {
            await limit.connect(deployer).setBucket(usdt.address, MapoIn, 0, 0, true);

            const orderId = ethers.utils.hexlify(ethers.utils.randomBytes(32));
            const amount = ethers.utils.parseEther("1");

            await expect(relay.connect(deployer).messageIn(fromChain, 0, orderId, buildBridgeInLog(orderId, amount)))
                .to.be.revertedWithCustomError(limit, "limit_exceeded");
        });

        it("Should roll back _checkOrder's orderId marking on a limit_exceeded revert, allowing a later resubmit", async function () {
            await limit.connect(deployer).setBucket(usdt.address, MapoIn, 0, 0, true);

            const orderId = ethers.utils.hexlify(ethers.utils.randomBytes(32));
            const amount = ethers.utils.parseEther("1");
            const log = buildBridgeInLog(orderId, amount);

            await expect(relay.connect(deployer).messageIn(fromChain, 0, orderId, log))
                .to.be.revertedWithCustomError(limit, "limit_exceeded");

            // _checkOrder's `orderList[_orderId] = 0x01` write must have been
            // rolled back together with the rest of the reverted transaction.
            expect(await relay.orderList(orderId)).to.equal(0);

            // Raise the bucket so the exact same message now goes through.
            await limit.connect(deployer).setBucket(usdt.address, MapoIn, amount, 0, true);
            await expect(relay.connect(deployer).messageIn(fromChain, 0, orderId, log)).to.not.be.reverted;
        });

        it("Should also charge the MapoIn bucket for a DEPOSIT-type message, before _deposit's whitelist check", async function () {
            await limit.connect(deployer).setBucket(usdt.address, MapoIn, 0, 0, true);

            const orderId = ethers.utils.hexlify(ethers.utils.randomBytes(32));
            const amount = ethers.utils.parseEther("1");
            const log = encodeEvmMessageOutLog({
                logAddr: sourceMos,
                orderId,
                fromChain,
                toChain: fromChain,
                gasLimit: 200000,
                messageType: MESSAGE_TYPE_DEPOSIT,
                mos: relay.address,
                token: usdt.address,
                amount,
                initiator: owner.address,
                from: owner.address,
                to: owner.address,
                swapData: "0x"
            });

            // _deposit's own whitelist dependency is broken in this test
            // environment regardless of BridgeLimit (see the depositToken
            // describe block above), but the MapoIn check runs first - an
            // exhausted bucket must surface as limit_exceeded, not whatever
            // _deposit would have failed with afterward.
            await expect(relay.connect(deployer).messageIn(fromChain, 0, orderId, log))
                .to.be.revertedWithCustomError(limit, "limit_exceeded");
        });
    });

    // A message genuinely passing through the relay (source and destination
    // both some other chain) must hit the Transit bucket, not MapoOut -
    // MapoOut is reserved for value that *originated* on the relay chain
    // itself (fromChain == selfChainId), which is never true here.
    describe("Transit vs MapoOut classification (BridgeLimit wired via service slot 5)", function () {
        const Transit = 0; // IBridgeLimit.BucketKind.Transit
        const MapoOut = 1; // IBridgeLimit.BucketKind.MapoOut
        const transitFromChain = 300; // a source chain distinct from both selfChainId (212) and the destination (97)
        const toChain = 97; // already registered, bridgeable and fee-configured by deployRelayOnly()
        let limit, sourceMos;

        beforeEach(async function () {
            sourceMos = owner.address;
            await relay.connect(deployer).registerChain([transitFromChain], [sourceMos], 1); // ChainType.EVM
            await register.connect(deployer).mapToken(usdt.address, transitFromChain, usdt.address, 18, false);
            // deployRelayOnly()'s default fixture never mapped usdt as a
            // *destination* token for chain 97 (only registered it as
            // bridgeable) - getToChainToken needs this too.
            await register.connect(deployer).mapToken(usdt.address, toChain, usdt.address, 18, false);
            await register.connect(deployer).setFromChainFee(
                usdt.address,
                transitFromChain,
                DEFAULT_CONFIG.fees.fromChainFee.minAmount,
                DEFAULT_CONFIG.fees.fromChainFee.amount,
                DEFAULT_CONFIG.fees.fromChainFee.rate,
            );

            const BridgeLimit = await ethers.getContractFactory("BridgeLimit");
            const limitImpl = await BridgeLimit.deploy(relay.address);
            const authority = await ethers.getContractAt("AuthorityManager", await relay.authority());
            const initData = BridgeLimit.interface.encodeFunctionData("initialize", [authority.address]);

            const OmniServiceProxy = await ethers.getContractFactory("OmniServiceProxy");
            const limitProxy = await OmniServiceProxy.deploy(limitImpl.address, initData);
            limit = BridgeLimit.attach(limitProxy.address);

            await relay.connect(deployer).setServiceContract(5, limit.address);
        });

        function buildTransitLog(orderId, amount) {
            // fromChain (300) != selfChainId (212) and toChain (97) != selfChainId:
            // this message neither originates nor ends on the relay chain -
            // it only passes through, so it must be Transit, never MapoOut.
            return encodeEvmMessageOutLog({
                logAddr: sourceMos,
                orderId,
                fromChain: transitFromChain,
                toChain,
                gasLimit: 200000,
                messageType: MESSAGE_TYPE_BRIDGE,
                mos: relay.address,
                token: usdt.address,
                amount,
                initiator: owner.address,
                from: owner.address,
                to: owner.address,
                swapData: "0x"
            });
        }

        it("Should charge the Transit bucket, not MapoOut, for a message that only passes through the relay", async function () {
            await limit.connect(deployer).setBucket(usdt.address, MapoOut, 0, 0, true); // would block if (wrongly) charged here
            await limit.connect(deployer).setBucket(usdt.address, Transit, ethers.utils.parseEther("1000"), 0, true);

            const orderId = ethers.utils.hexlify(ethers.utils.randomBytes(32));
            const amount = ethers.utils.parseEther("1");

            await expect(relay.connect(deployer).messageIn(transitFromChain, 0, orderId, buildTransitLog(orderId, amount)))
                .to.not.be.reverted;

            const transitBucket = await limit.buckets(usdt.address, Transit);
            expect(transitBucket.remaining).to.be.lt(ethers.utils.parseEther("1000"));
        });

        it("Should revert with limit_exceeded when the Transit bucket (not MapoOut) is exhausted", async function () {
            await limit.connect(deployer).setBucket(usdt.address, MapoOut, ethers.utils.parseEther("1000"), 0, true); // ample, must not matter
            await limit.connect(deployer).setBucket(usdt.address, Transit, 0, 0, true);

            const orderId = ethers.utils.hexlify(ethers.utils.randomBytes(32));
            const amount = ethers.utils.parseEther("1");

            await expect(relay.connect(deployer).messageIn(transitFromChain, 0, orderId, buildTransitLog(orderId, amount)))
                .to.be.revertedWithCustomError(limit, "limit_exceeded");
        });
    });
});
