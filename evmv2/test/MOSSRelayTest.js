const { ethers } = require("hardhat");
const { expect } = require("chai");
const mosRelayData = require("./mosRelayData");
require("solidity-coverage");
const { BigNumber } = require("ethers");
const exp = require("constants");

describe("MAPOmnichainServiceRelayV2 start test", function () {
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

    let EvmDecoder;
    let evmDecoder;

    let NearDecoder;
    let nearDecoder;

    let MOSSRelay;
    let mossR;

    let MapVault;
    let mapVault;

    let MapVaultU;
    let mapVaultU;

    let MapVaultW;
    let mapVaultW;

    let StandardToken;
    let standardToken;

    let UToken;
    let usdt;

    let Wrapped;
    let wrapped;

    let TokenRegister;
    let tokenRegister;

    let LightClientManager;
    let lightClientManager;

    let address2Bytes;
    let initData;

    beforeEach(async function () {
        [deployer, owner, addr1, addr2, addr3, addr4, addr5, addr6, addr7, addr8, addr9] = await ethers.getSigners();
    });
    const abi = ethers.utils.defaultAbiCoder;

    it("MAPOmnichainServiceRelayV2 contract deploy init", async function () {
        console.log("deployer address:", deployer.address);
        console.log(addr8.address);

        MOSSRelay = await ethers.getContractFactory("MAPOmnichainServiceRelayV2");
        // moss = await ethers.getContractAt("MapCrossChainService",mosData.mos);
        mossR = await MOSSRelay.deploy();
        console.log("mossR address:", mossR.address);

        StandardToken = await ethers.getContractFactory("MintableToken");
        standardToken = await StandardToken.deploy("MapToken", "MP", 18);

        UToken = await ethers.getContractFactory("MintableToken");
        usdt = await UToken.deploy("U Toeken", "USDT", 18);

        Wrapped = await ethers.getContractFactory("Wrapped");
        wrapped = await Wrapped.deploy();
        console.log("Wrapped:", wrapped.address);

        TokenRegister = await ethers.getContractFactory("TokenRegisterV2");
        tokenRegister = await TokenRegister.deploy();
        console.log("TokenRegister address", tokenRegister.address);

        LightClientManager = await ethers.getContractFactory("LightClientManager");
        lightClientManager = await LightClientManager.deploy();
        console.log("LightClientManager   address:", lightClientManager.address);

        MapVault = await ethers.getContractFactory("VaultTokenV2");
        mapVault = await MapVault.deploy(standardToken.address, "MapVaultToken", "MVT");
        console.log("MapVault  address:", mapVault.address);

        MapVaultU = await ethers.getContractFactory("VaultTokenV2");
        mapVaultU = await MapVaultU.deploy(usdt.address, "MapVaultTokenUsdt", "UVT");

        MapVaultW = await ethers.getContractFactory("VaultTokenV2");
        mapVaultW = await MapVaultU.deploy(wrapped.address, "MapVaultTokenWrapped", "WVT");

        let data = await mossR.initialize(wrapped.address, lightClientManager.address, owner.address);
        initData = data.data;
    });

    it("UUPS test", async function () {
        const MAPCrossChainServiceRelayProxy = await ethers.getContractFactory("MAPOmnichainServiceProxyV2");
        let mossRP = await MAPCrossChainServiceRelayProxy.deploy(mossR.address, initData);
        await mossRP.deployed();

        let initTokenRegisterData = await tokenRegister.initialize(owner.address);

        const TokenResgisterProxy = await ethers.getContractFactory("MAPOmnichainServiceProxyV2");
        let tokenRegisterP = await TokenResgisterProxy.deploy(tokenRegister.address, initTokenRegisterData.data);
        await tokenRegisterP.deployed();

        tokenRegister = TokenRegister.connect(owner).attach(tokenRegister.address);

        mossR = MOSSRelay.connect(owner).attach(mossRP.address);
    });

    it("mosRelay contract set ", async function () {
        await mossR.setTokenRegister(tokenRegister.address);

        expect(await mossR.tokenRegister()).to.equal(tokenRegister.address);

        await mossR.registerChain(97, mosRelayData.mosETH, 1);

        await mossR.registerChain(1313161555, mosRelayData.mosNear, 2);

        expect(await mossR.chainTypes(97)).to.equal(1);

        await mapVault.addManager(mossR.address);
        await mapVaultU.addManager(mossR.address);
        await mapVaultW.addManager(mossR.address);

        await mossR.setDistributeRate(0, addr2.address, "400000");
        await mossR.setDistributeRate(1, addr3.address, "200000");
        //expect(await mossR.checkAuthToken(standardToken.address)).to.equal("true");
    });

    it("TokenRegister set", async function () {
        await tokenRegister.registerToken(usdt.address, mapVaultU.address, false);
        await tokenRegister.registerToken(standardToken.address, mapVault.address, true);
        await tokenRegister.registerToken(wrapped.address, mapVaultW.address, false);

        await tokenRegister.mapToken(usdt.address, 97, mosRelayData.ethUsdtToken, 18,true);
        await tokenRegister.mapToken(standardToken.address, 97, mosRelayData.ethStanardToken, 18,true);
        await tokenRegister.mapToken(usdt.address, 212, usdt.address, 18,true);
        await tokenRegister.mapToken(standardToken.address, 212, standardToken.address, 18,true);
        await tokenRegister.mapToken(usdt.address, 1313161555, mosRelayData.nearUsdtToken, 24,true);
        await tokenRegister.mapToken(standardToken.address, 1313161555, mosRelayData.nearStandToken, 24,true);
        await tokenRegister.mapToken(wrapped.address, 1313161555, mosRelayData.nearWethToken, 24,true);
        await tokenRegister.mapToken(wrapped.address, 212, wrapped.address, 18,true);
        await tokenRegister.mapToken(wrapped.address, 97, "0xae13d989dac2f0debff460ac112a837c89baa7cd", 18,true);
        await tokenRegister.setTokenFee(usdt.address, 97, "1000000000000000", "2000000000000000000", "500000");
    });

    it("set test", async function () {
        console.log(await mossR.getAdmin());
        await mossR.setPause();
        expect(await mossR.paused()).to.equal(true);
        await mossR.setUnpause();
        expect(await mossR.paused()).to.equal(false);

        await expect(mossR.connect(addr3).setPause()).to.be.revertedWith("mosRelay :: only admin");
    });

    it("admin test", async function () {
        await expect(mossR.changeAdmin("0x0000000000000000000000000000000000000000")).to.be.revertedWith(
            "address is zero"
        );

        await mossR.changeAdmin(addr5.address);

        expect(await mossR.getAdmin()).to.equal(addr5.address);
    });

    it("Upgrade", async function () {
        let MOSSRelayUpGrade = await ethers.getContractFactory("MAPOmnichainServiceRelayV2");
        // moss = await ethers.getContractAt("MapCrossChainService",mosData.mos);
        let mossRUpGrade = await MOSSRelayUpGrade.deploy();
        await mossRUpGrade.deployed();

        mossR.connect(addr5).upgradeTo(mossRUpGrade.address);

        expect(await mossR.getImplementation()).to.equal(mossRUpGrade.address);
    });
});
