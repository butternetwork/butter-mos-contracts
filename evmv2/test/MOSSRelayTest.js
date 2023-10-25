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

  const swapData = abi.encode(
    ["tuple(uint256, uint256, bytes, uint64)[]", "bytes", "address"],

    [
      [
        [
          "1000000000000000000", // 1 USDC
          "0",
          abi.encode(
            ["address[]"],
            [["0x3F1E91BFC874625f4ee6EF6D8668E79291882373", "0x593F6F6748dc203DFa636c299EeA6a39C0734EEd"]]
          ),
          "0", // pancake
        ],
      ],
      "0x593F6F6748dc203DFa636c299EeA6a39C0734EEd",
      "0x0000000000000000000000000000000000000000",
    ]
  );
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

    tokenRegister = TokenRegister.attach(tokenRegister.address);

    mossR = MOSSRelay.attach(mossRP.address);
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

    await tokenRegister.mapToken(usdt.address, 97, mosRelayData.ethUsdtToken, 18);
    await tokenRegister.mapToken(standardToken.address, 97, mosRelayData.ethStanardToken, 18);
    await tokenRegister.mapToken(usdt.address, 212, usdt.address, 18);
    await tokenRegister.mapToken(standardToken.address, 212, standardToken.address, 18);
    await tokenRegister.mapToken(usdt.address, 1313161555, mosRelayData.nearUsdtToken, 24);
    await tokenRegister.mapToken(standardToken.address, 1313161555, mosRelayData.nearStandToken, 24);
    await tokenRegister.mapToken(wrapped.address, 1313161555, mosRelayData.nearWethToken, 24);
    await tokenRegister.mapToken(wrapped.address, 212, wrapped.address, 18);
    await tokenRegister.mapToken(wrapped.address, 97, "0xae13d989dac2f0debff460ac112a837c89baa7cd", 18);
    await tokenRegister.setTokenFee(usdt.address, 97, "1000000000000000", "2000000000000000000", "500000");
  });

  it("swapOutToken test", async function () {
    //chainID 31337
    //address2Bytes = await mossR._addressToBytes(addr2.address);
    address2Bytes = "0x90F79bf6EB2c4f870365E785982E1f101E93b906";
    let testTokenContract = await ethers.getContractFactory("MintableToken");
    let testToken = await testTokenContract.deploy("TestToken", "TT", 18);

    // setup token vault
    let tokenVaultContract = await ethers.getContractFactory("VaultTokenV2");
    let tokenVault = await tokenVaultContract.deploy(testToken.address, "MapVaultToken", "MVT");
    console.log("MapVault  address:", tokenVault.address);
    await tokenVault.addManager(mossR.address);

    // register token
    await tokenRegister.registerToken(testToken.address, tokenVault.address, "false");
    // await tokenRegister.mapToken(testToken.address,1313161555,mosRelayData.nearTestToken,24);
    await tokenRegister.mapToken(testToken.address, 97, mosRelayData.bscTestToken, 18);
    // mint token
    const mintAmount = "100000000000000000000";
    await testToken.mint(owner.address, BigNumber.from(mintAmount).mul(2));
    await testToken.connect(owner).approve(mossR.address, BigNumber.from(mintAmount).mul(2));
    await mossR.connect(owner).depositToken(testToken.address, addr1.address, mintAmount);

    expect(await testToken.totalSupply()).to.equal(BigNumber.from(mintAmount).mul(2));

    const swapAmount = "1000000000000000000";
    expect(await tokenVault.vaultBalance(97)).to.equal(0);

    const mapTargetToken = "0x0000000000000000000000000000000000000000";
    await mossR.connect(owner).swapOutToken(owner.address, testToken.address, owner.address, swapAmount, 97, swapData);
    //
    expect(await testToken.balanceOf(mossR.address)).to.equal(mintAmount);
    expect(await tokenVault.vaultBalance(97)).to.equal("-1000000000000000000");
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
    await expect(mossR.changeAdmin("0x0000000000000000000000000000000000000000")).to.be.revertedWith("address is zero");

    await mossR.changeAdmin(addr5.address);

    expect(await mossR.getAdmin()).to.equal(addr5.address);
  });

  // it('collectChainFee test', async function () {
  //     await usdt.mint(owner.address,"1000000000000000000");
  //     await usdt.connect(owner).approve(mossR.address,"100000000000000000000");
  //    // await mossR.connect(owner).transferOutToken(usdt.address,address2Bytes,"1000000000000000000",97);

  //     expect(await usdt.balanceOf(mossR.address)).to.be.equal("900000000000000000");
  //     //expect(await mapVaultU.correspondBalance()).to.be.equal("350000000000000000");
  //     expect(await usdt.balanceOf(addr3.address)).to.be.equal("115000000000000000");

  //     // set standToken to 97 fee rate 50%
  //     await tokenRegister.setTokenFee(standardToken.address,97,"1000000000000000","2000000000000000000","500000")

  //     await mossR.connect(addr5).setDistributeRate(0,mossR.address,"400000")
  //     await mossR.connect(addr5).setDistributeRate(1,addr3.address,"200000")

  //     console.log(await standardToken.balanceOf(mossR.address));
  //     await standardToken.mint(owner.address,"1000000000000000000");
  //     await standardToken.connect(owner).approve(mossR.address,"100000000000000000000");
  //    // await mossR.connect(owner).transferOutToken(standardToken.address,address2Bytes,"1000000000000000000",97);

  //     // to vault 200000000000000000
  //     //expect(await mapVault.correspondBalance()).to.be.equal("10000200000000000000000");
  //     // to addr3 100000000000000000
  //     expect(await standardToken.balanceOf(addr3.address)).to.be.equal("100000000000000000");
  //     //fee 500000000000000000
  //     // no processing 200000000000000000 + to vault 200000000000000000
  //     //400000000000000000
  //     expect(await standardToken.balanceOf(mossR.address)).to.be.equal("1400000000000000000");

  // });

  it(" depositToken and  depositNative test", async function () {
    await standardToken.mint(addr7.address, "10000000000000000000000");

    await standardToken.connect(addr7).approve(mossR.address, "10000000000000000000000");
    await mossR.connect(addr7).depositToken(standardToken.address, addr7.address, "10000000000000000000000");

    console.log(await standardToken.balanceOf(mossR.address));

    //10000200000000000000000
    console.log(await mapVault.totalVault());
    console.log(await mapVault.balanceOf(addr7.address));

    await mossR.connect(addr8).depositNative(addr8.address, { value: "2000000000000000000" });
  });

  // it('withdraw test', async function () {
  //
  //     await wrapped.connect(addr4).deposit({value:"1000000000000000000"});
  //     await wrapped.connect(addr4).transfer(mossR.address,"1000000000000000000");
  //     let mos_w_before = await wrapped.balanceOf(mossR.address);
  //     let addr6_n_before = await  ethers.provider.getBalance(addr6.address);
  //     await mossR.connect(addr5).emergencyWithdraw(
  //         wrapped.address,
  //         addr6.address,
  //         mos_w_before
  //     )
  //     expect(await wrapped.balanceOf(mossR.address)).to.equal("0");
  //     expect(await ethers.provider.getBalance(addr6.address)).to.equal(mos_w_before.add(addr6_n_before));
  //
  //     await (await standardToken.mint(addr7.address,"10000000000000000000000")).wait();
  //
  //     let addr7_s_balance = await standardToken.balanceOf(addr7.address);
  //
  //     await (await standardToken.connect(addr7).approve(mossR.address,addr7_s_balance)).wait();
  //
  //     let addr7_v_balance = await mapVault.balanceOf(addr7.address);
  //
  //     await (await mossR.connect(addr7).depositToken(standardToken.address,addr7.address,addr7_s_balance)).wait()
  //
  //     let addr7_v_f = (await mapVault.balanceOf(addr7.address)).sub(addr7_v_balance);
  //
  //    await( await mapVault.connect(addr7).approve(mossR.address,addr7_v_f)).wait();
  //
  //     await mossR.connect(addr7).withdraw(
  //         mapVault.address,
  //         addr7_v_f
  //     )
  //     expect(await mapVault.balanceOf(addr7.address)).to.equal(addr7_v_balance)
  //
  //     expect(await standardToken.balanceOf(addr7.address)).to.equal(addr7_s_balance)
  //
  //     await(await standardToken.mint(mossR.address,"10000000000000000000000")).wait();
  //     let mos_s_balance = await standardToken.balanceOf(mossR.address);
  //     let addr6_s_balance =  await standardToken.balanceOf(addr6.address)
  //     await mossR.connect(addr5).emergencyWithdraw(
  //         standardToken.address,
  //         addr6.address,
  //         mos_s_balance
  //     )
  //     expect(await standardToken.balanceOf(mossR.address)).to.equal("0");
  //     expect(await standardToken.balanceOf(addr6.address)).to.equal(mos_s_balance.add(addr6_s_balance));
  //
  // });

  it("depositIn test ", async function () {
    let mos_u_b = await usdt.balanceOf(mossR.address);
    let mos_s_b = await standardToken.balanceOf(mossR.address);
    let mos_w_b = await wrapped.balanceOf(mossR.address);
    let u_t_b = await usdt.totalSupply();
    let s_t_b = await standardToken.totalSupply();
    let mv_t_b = await mapVault.totalSupply();
    let mu_t_b = await mapVaultU.totalSupply();
    let mw_t_b = await mapVaultW.totalSupply();

    await (await mossR.depositIn("1313161555", mosRelayData.near2mapDepositeM01)).wait();

    expect(await usdt.balanceOf(mossR.address)).to.equal(mos_u_b);
    expect(await standardToken.balanceOf(mossR.address)).to.equal(mos_s_b);
    expect(await wrapped.balanceOf(mossR.address)).to.equal(mos_w_b);
    expect(await usdt.totalSupply()).to.equal(u_t_b);
    expect(await standardToken.totalSupply()).to.equal(s_t_b);

    expect(await mapVault.totalSupply()).to.equal(mv_t_b);
    expect(await mapVaultU.totalSupply()).to.equal(mu_t_b.add(BigNumber.from("100000000000000000")));
    expect(await mapVaultW.totalSupply()).to.equal(mw_t_b);

    mu_t_b = await mapVaultU.totalSupply();
    //100000000000000000
    await mossR.depositIn(97, mosRelayData.eth2mapDepositeU);
    expect(await usdt.balanceOf(mossR.address)).to.equal(mos_u_b);
    expect(await standardToken.balanceOf(mossR.address)).to.equal(mos_s_b);
    expect(await usdt.totalSupply()).to.equal(u_t_b);

    expect(await mapVaultU.totalSupply()).to.equal(mu_t_b.add(BigNumber.from("100000000000000000")));
  });

  it("Upgrade", async function () {
    let MOSSRelayUpGrade = await ethers.getContractFactory("MAPOmnichainServiceRelayV2");
    // moss = await ethers.getContractAt("MapCrossChainService",mosData.mos);
    let mossRUpGrade = await MOSSRelayUpGrade.deploy();
    await mossRUpGrade.deployed();

    mossR.connect(addr5).upgradeTo(mossRUpGrade.address);

    expect(await mossR.getImplementation()).to.equal(mossRUpGrade.address);
  });

  // it('deposit and withdraw ', async function () {

  //     //200000000000000000000
  //     await mossR.depositIn(97,mosRelayData.eth2mapDepositeS);
  //     expect(await standardToken.balanceOf(mossR.address)).to.equal("201000000000000000000")
  //     expect(await mapVault.balanceOf(addr8.address)).to.equal("200000000000000000000")
  //     expect(await standardToken.totalSupply()).to.equal("10501650000000000000000")
  //     expect(await mapVault.totalSupply()).to.equal("200000000000000000000");

  //     //1000000000000000
  //     await mossR.depositIn(97,mosRelayData.eth2mapDepositeW);
  //     expect(await wrapped.balanceOf(mossR.address)).to.equal("2000000000000000000")
  //     expect(await mapVaultW.totalSupply()).to.equal("2001000000000000000");

  //     await standardToken.mint(addr2.address,"20000000000000000000");
  //     await standardToken.connect(addr2).approve(mossR.address,"2000000000000000000000");
  //     await mossR.connect(addr2).transferOutToken(standardToken.address,address2Bytes,"20000000000000000000",97)
  //     //2008
  //     expect(await mapVault.totalVault()).to.equal("200800000000000000000");
  //     expect(await mapVault.totalSupply()).to.equal("200000000000000000000");
  //     await standardToken.mint(addr1.address,"1000000000000000000");
  //     await standardToken.connect(addr1).approve(mossR.address,"100000000000000000000");
  //     await mossR.connect(addr1).transferOutToken(standardToken.address,address2Bytes,"1000000000000000000",97)
  //     //2010
  //     expect(await mapVault.totalVault()).to.equal("201000000000000000000");
  //     expect(await mapVault.totalSupply()).to.equal("200000000000000000000");
  //     console.log(await standardToken.balanceOf(addr7.address));
  //     await standardToken.connect(addr7).approve(mossR.address,"10000000000000000000000");
  //     await mossR.connect(addr7).depositToken(standardToken.address,addr7.address,"10000000000000000000000")
  //     expect(await mapVault.totalVault()).to.equal("10201000000000000000000");

  //     //100000 * 2000 / 2010 = 99502 + 2000 = 101502
  //     expect(await mapVault.totalSupply()).to.equal("10150248756218905472636");

  //     expect(await standardToken.balanceOf(addr8.address)).to.equal("0");

  //     await mapVault.connect(addr8).approve(mossR.address,"200000000000000000000")
  //     await mossR.connect(addr8).withdraw(mapVault.address,"200000000000000000000")

  //     expect(await mapVault.balanceOf(addr8.address)).to.equal("0");
  //     //200000000000000000000 + 1000000000000000000(fee)
  //     expect(await standardToken.balanceOf(addr8.address)).to.equal("201000000000000000000");

  // });

  // it('test protocolFee', async function () {
  //     await expect(mossR.connect(addr5).setDistributeRate(2,addr9.address,"500000")).to.be.revertedWith("invalid rate value")
  //     await mossR.connect(addr5).setDistributeRate(2,addr9.address,"400000");

  //     await tokenRegister.setTokenFee(usdt.address,97,"1000000000000000","2000000000000000000","500000")

  //     await usdt.mint(owner.address,"1000000000000000000");

  //     await mossR.connect(owner).transferOutToken(usdt.address,address2Bytes,"1000000000000000000",97)

  //     expect(await usdt.balanceOf(addr9.address)).to.equal("200000000000000000")
  // });

  it("swapOutNative test ", async function () {
    let before = await wrapped.balanceOf(mossR.address);
    await mossR.connect(owner).swapOutNative(owner.address, owner.address, 1313161555, swapData, {
      value: "100000000000000000",
    });

    expect(await wrapped.balanceOf(mossR.address)).to.equal(before.add(BigNumber.from("100000000000000000")));
  });
});
