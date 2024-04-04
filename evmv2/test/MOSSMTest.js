const { ethers } = require("hardhat");
const { expect } = require("chai");
const mosData = require("./mosData");
require("solidity-coverage");
const { BigNumber } = require("ethers");

describe("MAPOmnichainServiceV2 start test", function () {
    let owner;
    let addr1;
    let addr2;
    let addr3;
    let addr4;
    let addr5;
    let addr6;
    let addr7;
    let addr8;
    let addr9;

    let MOSS;
    let moss;

    let StandardToken;
    let standardToken;

    let UToken;
    let usdt;

    let Wrapped;
    let wrapped;

    let LightNode;
    let lightNode;

    let initData;

    const abi = ethers.utils.defaultAbiCoder;

    beforeEach(async function () {
        [addr6, owner, addr1, addr2, addr3, addr4, addr5, addr7, addr8, addr9, ...addrs] = await ethers.getSigners();
    });

    it("constract deploy init", async function () {
        MOSS = await ethers.getContractFactory("MAPOmnichainServiceV2");
        moss = await MOSS.deploy();
        console.log("moss address:", moss.address);

        StandardToken = await ethers.getContractFactory("MintableToken");
        standardToken = await StandardToken.deploy("MapToken", "MP", 18);
        console.log("StandardToken:", standardToken.address);

        UToken = await ethers.getContractFactory("MintableToken");
        usdt = await UToken.deploy("U Toeken", "USDT", 18);
        console.log("UToken:", usdt.address);

        Wrapped = await ethers.getContractFactory("Wrapped");
        wrapped = await Wrapped.deploy();
        console.log("Wrapped:", wrapped.address);

        LightNode = await ethers.getContractFactory("LightNode");
        lightNode = await LightNode.deploy();

        let data = await moss.initialize(wrapped.address, lightNode.address, owner.address);

        initData = data.data;
    });

    it("UUPS test", async function () {
        const MapCrossChainServiceProxy = await ethers.getContractFactory("MAPOmnichainServiceProxyV2");
        let mossp = await MapCrossChainServiceProxy.deploy(moss.address, initData);
        await mossp.deployed();
        moss = MOSS.connect(owner).attach(mossp.address);
    });

    it("mos set", async function () {
        await moss.addMintableToken([standardToken.address]);

        await moss.setRelayContract(212, mosData.mosRelay);

        await moss.registerToken(standardToken.address, 34434, "true");
        await moss.registerToken(wrapped.address, 34434, "true");

        await moss.registerToken(standardToken.address, 212, "true");
        await moss.registerToken(wrapped.address, 212, "true");

        await moss.registerToken(standardToken.address, 1313161555, "true");
        await moss.registerToken(wrapped.address, 1313161555, "true");

        let mintRole = await standardToken.MINTER_ROLE();

        await standardToken.grantRole(mintRole, moss.address);

        await standardToken.mint(addr1.address, "100000000000000000000000000");

        expect(await standardToken.balanceOf(addr1.address)).to.equal("100000000000000000000000000");
    });

    it("set test", async function () {
        await moss.setPause();
        expect(await moss.paused()).to.equal(true);
        await moss.setUnpause();
        expect(await moss.paused()).to.equal(false);

        await expect(moss.connect(addr3).setPause()).to.be.revertedWith("mos :: only admin");
    });

    it("admin test", async function () {
        await expect(moss.changeAdmin("0x0000000000000000000000000000000000000000")).to.be.revertedWith(
            "address is zero"
        );

        await moss.changeAdmin(addr5.address);

        expect(await moss.getAdmin()).to.equal(addr5.address);
    });

    it("Upgrade", async function () {
        let MOSSUpGrade = await ethers.getContractFactory("MAPOmnichainServiceV2");
        // moss = await ethers.getContractAt("MapCrossChainService",mosData.mos);
        let mossUpGrade = await MOSSUpGrade.deploy();
        await mossUpGrade.deployed();

        moss.connect(addr5).upgradeTo(mossUpGrade.address);

        expect(await moss.getImplementation()).to.equal(mossUpGrade.address);
    });
});
