const { ethers } = require("hardhat");
const { expect } = require("chai");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

// Unit tests for BridgeLimit in isolation (no Bridge/BridgeAndRelay wiring -
// see relay.message.test.js / relay.swap.test.js for the end-to-end
// integration tests that exercise it through BridgeAndRelay.messageIn /
// swapOutToken). "bridge" below is a plain signer standing in for whatever
// contract is wired into BridgeLimit's immutable `bridge` address, so these
// tests can call consume() directly without going through the full bridge
// flow.
const Transit = 0;
const MapoOut = 1;
const MapoIn = 2;

describe("BridgeLimit Tests", function () {
    let limit, authority, token;
    let deployer, bridge, owner, other, executor;

    beforeEach(async function () {
        [deployer, bridge, owner, other, executor] = await ethers.getSigners();

        const AuthorityManager = await ethers.getContractFactory("AuthorityManager");
        authority = await AuthorityManager.deploy(deployer.address);

        const MockToken = await ethers.getContractFactory("MockToken");
        token = await MockToken.deploy("USDT", "USDT");

        const BridgeLimit = await ethers.getContractFactory("BridgeLimit");
        const limitImpl = await BridgeLimit.deploy(bridge.address);
        const initData = BridgeLimit.interface.encodeFunctionData("initialize", [authority.address]);

        const OmniServiceProxy = await ethers.getContractFactory("OmniServiceProxy");
        const limitProxy = await OmniServiceProxy.deploy(limitImpl.address, initData);
        limit = BridgeLimit.attach(limitProxy.address);
    });

    describe("Deployment", function () {
        it("Should set the immutable bridge address", async function () {
            expect(await limit.bridge()).to.equal(bridge.address);
        });

        it("Should set the authority", async function () {
            expect(await limit.authority()).to.equal(authority.address);
        });

        it("Should revert deployment with zero bridge address", async function () {
            const BridgeLimit = await ethers.getContractFactory("BridgeLimit");
            await expect(BridgeLimit.deploy(ethers.constants.AddressZero))
                .to.be.revertedWithCustomError(BridgeLimit, "zero_address");
        });

        it("Should revert re-initialization", async function () {
            await expect(limit.initialize(authority.address)).to.be.reverted;
        });
    });

    describe("Access Control", function () {
        it("Should revert setBucket by non-authorized user", async function () {
            await expect(limit.connect(owner).setBucket(token.address, Transit, 1000, 10, true))
                .to.be.revertedWithCustomError(limit, "AccessManagedUnauthorized");
        });

        it("Should allow authorized user to setBucket", async function () {
            await expect(limit.connect(deployer).setBucket(token.address, Transit, 1000, 10, true))
                .to.not.be.reverted;
        });

        it("Should revert setTemporaryCapacity/setExecutorWhitelist/setExempt by non-authorized user", async function () {
            await expect(limit.connect(owner).setTemporaryCapacity(token.address, Transit, 1000, 3600))
                .to.be.revertedWithCustomError(limit, "AccessManagedUnauthorized");
            await expect(limit.connect(owner).setExecutorWhitelist(executor.address, true))
                .to.be.revertedWithCustomError(limit, "AccessManagedUnauthorized");
            await expect(limit.connect(owner).setExempt(owner.address, true))
                .to.be.revertedWithCustomError(limit, "AccessManagedUnauthorized");
        });

        it("Should revert consume called by a non-bridge address", async function () {
            await expect(limit.connect(owner).consume(token.address, Transit, 100, other.address))
                .to.be.revertedWithCustomError(limit, "only_bridge");
        });

        it("Should allow the bridge address to call consume", async function () {
            await limit.connect(deployer).setBucket(token.address, Transit, 1000, 1, true);
            await expect(limit.connect(bridge).consume(token.address, Transit, 100, other.address)).to.not.be.reverted;
        });
    });

    describe("Bucket enabled semantics", function () {
        it("Should not enforce an unconfigured (enabled=false) bucket", async function () {
            await expect(limit.connect(bridge).consume(token.address, Transit, ethers.constants.MaxUint256.div(2), other.address))
                .to.not.be.reverted;
        });

        it("Should reject everything once enabled with capacity = 0 (emergency per-token/per-bucket brake)", async function () {
            await limit.connect(deployer).setBucket(token.address, Transit, 0, 0, true);

            await expect(limit.connect(bridge).consume(token.address, Transit, 1, other.address))
                .to.be.revertedWithCustomError(limit, "limit_exceeded");
        });

        it("Should start a freshly configured bucket fully filled", async function () {
            await limit.connect(deployer).setBucket(token.address, Transit, 500, 0, true);

            await expect(limit.connect(bridge).consume(token.address, Transit, 500, other.address)).to.not.be.reverted;
            await expect(limit.connect(bridge).consume(token.address, Transit, 1, other.address))
                .to.be.revertedWithCustomError(limit, "limit_exceeded");
        });

        it("Should not produce a huge spurious refill on a bucket's very first consume", async function () {
            // lastRefill is set to block.timestamp at configuration time (not 0),
            // so even though the chain's genesis timestamp is long in the past,
            // the first consume must not treat that gap as elapsed refill time.
            await limit.connect(deployer).setBucket(token.address, Transit, 100, 0, true);

            await expect(limit.connect(bridge).consume(token.address, Transit, 100, other.address)).to.not.be.reverted;
            await expect(limit.connect(bridge).consume(token.address, Transit, 1, other.address))
                .to.be.revertedWithCustomError(limit, "limit_exceeded");
        });

        it("Should truncate remaining immediately when capacity is lowered", async function () {
            await limit.connect(deployer).setBucket(token.address, Transit, 1000, 0, true);
            await limit.connect(deployer).setBucket(token.address, Transit, 100, 0, true);

            await expect(limit.connect(bridge).consume(token.address, Transit, 101, other.address))
                .to.be.revertedWithCustomError(limit, "limit_exceeded");
            await expect(limit.connect(bridge).consume(token.address, Transit, 100, other.address)).to.not.be.reverted;
        });
    });

    describe("Each bucket kind is independent", function () {
        it("Should isolate Transit, MapoOut and MapoIn buckets from each other for the same token", async function () {
            await limit.connect(deployer).setBucket(token.address, Transit, 100, 0, true);
            await limit.connect(deployer).setBucket(token.address, MapoOut, 200, 0, true);
            await limit.connect(deployer).setBucket(token.address, MapoIn, 300, 0, true);

            await expect(limit.connect(bridge).consume(token.address, Transit, 100, other.address)).to.not.be.reverted;
            await expect(limit.connect(bridge).consume(token.address, Transit, 1, other.address))
                .to.be.revertedWithCustomError(limit, "limit_exceeded");

            // MapoOut and MapoIn are untouched by Transit's exhaustion
            await expect(limit.connect(bridge).consume(token.address, MapoOut, 200, other.address)).to.not.be.reverted;
            await expect(limit.connect(bridge).consume(token.address, MapoIn, 300, other.address)).to.not.be.reverted;
        });

        it("Should reject fan-out across many destination chains the same way, since there is no per-chain bucket", async function () {
            // The whole point of collapsing to one bucket per kind: fan-out
            // across chains cannot dodge the cap because there's no
            // per-chain dimension left to exploit - everything hits the same
            // Transit bucket regardless of which chain it's headed to.
            const capacity = ethers.utils.parseEther("150000");
            await limit.connect(deployer).setBucket(token.address, Transit, capacity, 0, true);

            const perChainAmount = ethers.utils.parseEther("43703.48");
            for (let i = 0; i < 3; i++) {
                await expect(limit.connect(bridge).consume(token.address, Transit, perChainAmount, other.address))
                    .to.not.be.reverted;
            }
            // 4th call (to yet another chain) pushes the total past capacity
            await expect(limit.connect(bridge).consume(token.address, Transit, perChainAmount, other.address))
                .to.be.revertedWithCustomError(limit, "limit_exceeded");
        });
    });

    describe("Refill math", function () {
        it("Should reject a request for 1 more than the exact refill amount", async function () {
            await limit.connect(deployer).setBucket(token.address, Transit, 1000, 10, true);

            const drainTx = await limit.connect(bridge).consume(token.address, Transit, 1000, other.address);
            const drainBlock = await ethers.provider.getBlock(drainTx.blockNumber);

            await time.setNextBlockTimestamp(drainBlock.timestamp + 50);
            await expect(limit.connect(bridge).consume(token.address, Transit, 501, other.address))
                .to.be.revertedWithCustomError(limit, "limit_exceeded");
        });

        it("Should allow a request for exactly the refill amount", async function () {
            await limit.connect(deployer).setBucket(token.address, Transit, 1000, 10, true);

            const drainTx = await limit.connect(bridge).consume(token.address, Transit, 1000, other.address);
            const drainBlock = await ethers.provider.getBlock(drainTx.blockNumber);

            await time.setNextBlockTimestamp(drainBlock.timestamp + 50);
            await expect(limit.connect(bridge).consume(token.address, Transit, 500, other.address)).to.not.be.reverted;
        });

        it("Should not refill past capacity no matter how much time elapses", async function () {
            await limit.connect(deployer).setBucket(token.address, Transit, 100, 10, true);

            await limit.connect(bridge).consume(token.address, Transit, 100, other.address);

            await time.increase(100000);
            await expect(limit.connect(bridge).consume(token.address, Transit, 101, other.address))
                .to.be.revertedWithCustomError(limit, "limit_exceeded");
            await expect(limit.connect(bridge).consume(token.address, Transit, 100, other.address)).to.not.be.reverted;
        });

        it("Should let a historical max legitimate single transfer through with zero delay when within capacity", async function () {
            const historicalMax = ethers.utils.parseEther("1000000");
            await limit.connect(deployer).setBucket(token.address, Transit, historicalMax, 1, true);

            await expect(limit.connect(bridge).consume(token.address, Transit, historicalMax, other.address)).to.not.be.reverted;
        });
    });

    describe("Temporary capacity", function () {
        it("Should allow a temporary bump up to 2x for up to 24h", async function () {
            await limit.connect(deployer).setBucket(token.address, Transit, 100, 0, true);
            await limit.connect(deployer).setTemporaryCapacity(token.address, Transit, 200, 24 * 3600);

            await expect(limit.connect(bridge).consume(token.address, Transit, 200, other.address)).to.not.be.reverted;
        });

        it("Should revert a temporary bump above 2x the permanent capacity", async function () {
            await limit.connect(deployer).setBucket(token.address, Transit, 100, 0, true);
            await expect(limit.connect(deployer).setTemporaryCapacity(token.address, Transit, 201, 3600))
                .to.be.revertedWithCustomError(limit, "temporary_capacity_too_large");
        });

        it("Should revert a temporary bump longer than 24h", async function () {
            await limit.connect(deployer).setBucket(token.address, Transit, 100, 0, true);
            await expect(limit.connect(deployer).setTemporaryCapacity(token.address, Transit, 150, 24 * 3600 + 1))
                .to.be.revertedWithCustomError(limit, "temporary_duration_too_long");
        });

        it("Should automatically fall back to the permanent capacity once the temporary window expires - no follow-up tx needed", async function () {
            await limit.connect(deployer).setBucket(token.address, Transit, 100, 0, true);
            const tx = await limit.connect(deployer).setTemporaryCapacity(token.address, Transit, 200, 3600);
            const block = await ethers.provider.getBlock(tx.blockNumber);

            // Within the window, the bumped capacity applies: consuming 150
            // (above the permanent 100) only works because of the temp bump.
            await expect(limit.connect(bridge).consume(token.address, Transit, 150, other.address)).to.not.be.reverted;
            // 50 of the 200 remains.

            // Past expiry, the cap reverts to the permanent 100, but the
            // actual balance (50) is untouched by expiry itself - it's just
            // no longer allowed to refill past 100 instead of 200.
            await time.setNextBlockTimestamp(block.timestamp + 3601);
            await expect(limit.connect(bridge).consume(token.address, Transit, 50, other.address)).to.not.be.reverted;
            await expect(limit.connect(bridge).consume(token.address, Transit, 1, other.address))
                .to.be.revertedWithCustomError(limit, "limit_exceeded");
        });

        it("Should clear any pending temporary override when setBucket is called", async function () {
            await limit.connect(deployer).setBucket(token.address, Transit, 100, 0, true);
            await limit.connect(deployer).setTemporaryCapacity(token.address, Transit, 200, 3600);

            // A deliberate permanent reconfiguration supersedes the temp bump.
            await limit.connect(deployer).setBucket(token.address, Transit, 100, 0, true);
            await expect(limit.connect(bridge).consume(token.address, Transit, 101, other.address))
                .to.be.revertedWithCustomError(limit, "limit_exceeded");
        });
    });

    describe("Executor whitelist", function () {
        it("Should report false for an un-whitelisted executor", async function () {
            expect(await limit.isExecutorWhitelisted(executor.address)).to.equal(false);
        });

        it("Should report true once whitelisted, and false again after revocation", async function () {
            await limit.connect(deployer).setExecutorWhitelist(executor.address, true);
            expect(await limit.isExecutorWhitelisted(executor.address)).to.equal(true);

            await limit.connect(deployer).setExecutorWhitelist(executor.address, false);
            expect(await limit.isExecutorWhitelisted(executor.address)).to.equal(false);
        });
    });

    describe("Exempt initiators", function () {
        beforeEach(async function () {
            await limit.connect(deployer).setBucket(token.address, Transit, 0, 0, true);
        });

        it("Should still enforce the limit for a non-exempt initiator", async function () {
            await expect(limit.connect(bridge).consume(token.address, Transit, 1, other.address))
                .to.be.revertedWithCustomError(limit, "limit_exceeded");
        });

        it("Should bypass the bucket entirely for an exempt EVM initiator", async function () {
            await limit.connect(deployer).setExempt(owner.address, true);
            await expect(limit.connect(bridge).consume(token.address, Transit, ethers.utils.parseEther("1000000"), owner.address))
                .to.not.be.reverted;
        });

        it("Should bypass the bucket for an exempt non-EVM (e.g. 32-byte Solana pubkey) initiator", async function () {
            const solanaPubkey = ethers.utils.hexlify(ethers.utils.randomBytes(32));
            await limit.connect(deployer).setExempt(solanaPubkey, true);

            const otherPubkey = ethers.utils.hexlify(ethers.utils.randomBytes(32));
            await expect(limit.connect(bridge).consume(token.address, Transit, 1, otherPubkey))
                .to.be.revertedWithCustomError(limit, "limit_exceeded");
            await expect(limit.connect(bridge).consume(token.address, Transit, ethers.utils.parseEther("1000000"), solanaPubkey))
                .to.not.be.reverted;
        });

        it("Should allow revoking an exemption", async function () {
            await limit.connect(deployer).setExempt(owner.address, true);
            await expect(limit.connect(bridge).consume(token.address, Transit, 1, owner.address)).to.not.be.reverted;

            await limit.connect(deployer).setExempt(owner.address, false);
            await expect(limit.connect(bridge).consume(token.address, Transit, 1, owner.address))
                .to.be.revertedWithCustomError(limit, "limit_exceeded");
        });
    });

    describe("unconfigured() operational helper", function () {
        it("Should report a token as unconfigured until all three buckets are enabled", async function () {
            expect(await limit.unconfigured([token.address])).to.deep.equal([token.address]);

            await limit.connect(deployer).setBucket(token.address, Transit, 1000, 1, true);
            expect(await limit.unconfigured([token.address])).to.deep.equal([token.address]);

            await limit.connect(deployer).setBucket(token.address, MapoOut, 1000, 1, true);
            await limit.connect(deployer).setBucket(token.address, MapoIn, 1000, 1, true);

            expect(await limit.unconfigured([token.address])).to.deep.equal([]);
        });
    });

    describe("available() pre-flight query", function () {
        it("Should report unlimited for an unconfigured (disabled) bucket", async function () {
            expect(await limit.available(token.address, Transit)).to.equal(ethers.constants.MaxUint256);
        });

        it("Should report the full capacity for a freshly configured, untouched bucket", async function () {
            await limit.connect(deployer).setBucket(token.address, Transit, 1000, 0, true);
            expect(await limit.available(token.address, Transit)).to.equal(1000);
        });

        it("Should match what consume() will actually allow, before and after a partial consume", async function () {
            await limit.connect(deployer).setBucket(token.address, Transit, 1000, 0, true);
            await limit.connect(bridge).consume(token.address, Transit, 400, other.address);

            expect(await limit.available(token.address, Transit)).to.equal(600);
            await expect(limit.connect(bridge).consume(token.address, Transit, 600, other.address)).to.not.be.reverted;
            expect(await limit.available(token.address, Transit)).to.equal(0);
        });

        it("Should reflect refill over time without needing a transaction", async function () {
            await limit.connect(deployer).setBucket(token.address, Transit, 1000, 10, true);
            const drainTx = await limit.connect(bridge).consume(token.address, Transit, 1000, other.address);
            const drainBlock = await ethers.provider.getBlock(drainTx.blockNumber);

            await time.setNextBlockTimestamp(drainBlock.timestamp + 50);
            await network.provider.send("evm_mine"); // advance the chain to that timestamp so the view call sees it

            expect(await limit.available(token.address, Transit)).to.equal(500); // 50s * 10/s
        });

        it("Should reflect a temporary capacity bump while active, and fall back after expiry", async function () {
            await limit.connect(deployer).setBucket(token.address, Transit, 100, 0, true);
            const tx = await limit.connect(deployer).setTemporaryCapacity(token.address, Transit, 200, 3600);
            const block = await ethers.provider.getBlock(tx.blockNumber);

            expect(await limit.available(token.address, Transit)).to.equal(200);

            await network.provider.send("evm_setNextBlockTimestamp", [block.timestamp + 3601]);
            await network.provider.send("evm_mine");

            expect(await limit.available(token.address, Transit)).to.equal(100);
        });
    });

    describe("Upgrade Tests", function () {
        it("Should allow authorized user to upgrade", async function () {
            const BridgeLimit = await ethers.getContractFactory("BridgeLimit");
            const newImpl = await BridgeLimit.deploy(bridge.address);

            await expect(limit.connect(deployer).upgradeToAndCall(newImpl.address, "0x")).to.not.be.reverted;
        });

        it("Should revert upgrade by non-authorized user", async function () {
            const BridgeLimit = await ethers.getContractFactory("BridgeLimit");
            const newImpl = await BridgeLimit.deploy(bridge.address);

            await expect(limit.connect(owner).upgradeToAndCall(newImpl.address, "0x"))
                .to.be.revertedWithCustomError(limit, "AccessManagedUnauthorized");
        });

        it("Should maintain bucket state after upgrade", async function () {
            await limit.connect(deployer).setBucket(token.address, Transit, 1000, 10, true);

            const BridgeLimit = await ethers.getContractFactory("BridgeLimit");
            const newImpl = await BridgeLimit.deploy(bridge.address);
            await limit.connect(deployer).upgradeToAndCall(newImpl.address, "0x");

            const bucket = await limit.buckets(token.address, Transit);
            expect(bucket.capacity).to.equal(1000);
            expect(bucket.enabled).to.be.true;
        });
    });
});
