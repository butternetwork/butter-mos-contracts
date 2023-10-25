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

  let receiver = "0x2E784874ddB32cD7975D68565b509412A5B519F4";

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
    moss = MOSS.connect(addr6).attach(mossp.address);
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

  // it('map swapIn test ', async function () {
  //     await moss.addMintableToken([standardToken.address]);
  //
  //     //standardToken transferIn 100000000000000000
  //     await moss.swapIn(212,mosData.map2ethStandardToken);
  //
  //     //MintableToken true mint 100000000000000000
  //     expect(await standardToken.totalSupply()).to.equal("99900000100000000000000000");
  //     //900000000000000000000000
  //     expect(await standardToken.balanceOf(moss.address)).to.equal("900000000000000000000000");
  //
  //     expect(await usdt.balanceOf(moss.address)).to.equal("0");
  //
  //     expect(await usdt.balanceOf(moss.address)).to.equal("0");
  //
  //     // await moss.transferIn(212,mosData.map2ethMapToken0);
  //     //
  //     // expect(await standardToken.totalSupply()).to.equal("99900000100000000000000000");
  //     // expect(await usdt.balanceOf(moss.address)).to.equal("0");
  //
  //     await wrapped.deposit({value:"300000000000000000"});
  //     await wrapped.transfer(moss.address,"300000000000000000");
  //
  //     //wtoken transferIn 300000000000000000
  //     await moss.transferIn(212,mosData.map2ethNative);
  //
  //     expect(await wrapped.balanceOf(moss.address)).to.equal("0")
  //
  //     expect(await ethers.provider.getBalance(receiver)).to.equal("300000000000000000")
  //
  //     await usdt.mint(moss.address,"5000000000000000000")
  //
  //     // usdt transferIn 5000000000000000000
  //     await moss.transferIn(212,mosData.map2ethMapToken);
  //     expect(await usdt.balanceOf(moss.address)).to.equal("0");
  //     expect(await usdt.balanceOf(receiver)).to.equal("5000000000000000000");
  //     expect(await usdt.totalSupply()).to.equal("5000000000000000000");
  //
  // });

  it("depositOut test", async function () {
    let balance = await standardToken.balanceOf(addr1.address);
    await standardToken.mint(addr1.address, "100000000000000000000000000");
    await standardToken.connect(addr1).approve(moss.address, "100000000000000000000000000");
    await moss.connect(addr1).depositToken(standardToken.address, addr3.address, "100000000000000000000000000");
    expect(await standardToken.balanceOf(addr1.address)).to.equal(balance);

    console.log(BigNumber.from(await ethers.provider.getBalance(addr2.address)));
    await moss.connect(addr2).depositNative(addr4.address, {
      value: "1000000000000000000",
    });

    // expect(await ethers.provider.getBalance(moss.address)).to.equal("9998999928426602550800");
    expect(await wrapped.balanceOf(moss.address)).to.equal("1000000000000000000");
  });

  it("swapOutToken test", async function () {
    // deploy test token
    let testTokenContract = await ethers.getContractFactory("MintableToken");
    let testToken = await testTokenContract.deploy("TestToken", "TT", 18);

    // mint 10 test token to addr1
    const mintAmount = "100000000000000000000";
    await testToken.mint(addr1.address, mintAmount);
    expect(await testToken.totalSupply()).to.equal(BigNumber.from(mintAmount));
    // register test token
    await moss.registerToken(testToken.address, 34434, "true");
    await moss.registerToken(testToken.address, 212, "true");

    await testToken.connect(addr1).approve(moss.address, mintAmount);

    const swapAmount = "1000000000000000000";
    await moss
      .connect(addr1)
      .swapOutToken(addr1.address, testToken.address, addr1.address, swapAmount, 34434, swapData);

    expect(await testToken.totalSupply()).to.equal(BigNumber.from(mintAmount));

    expect(await testToken.balanceOf(moss.address)).to.equal(swapAmount);
  });

  it("swapOutNative", async function () {
    await moss.registerToken(wrapped.address, 1313161555, "true");
    const mapTargetToken = "0x0000000000000000000000000000000000000000";
    const balanceBefore = await wrapped.balanceOf(moss.address);
    await moss.connect(owner).swapOutNative(owner.address, owner.address, 1313161555, swapData, {
      value: "100000000000000000",
    });
    const balanceAfter = await wrapped.balanceOf(moss.address);
    //100000000000000000
    expect(balanceAfter.sub(balanceBefore)).to.equal("100000000000000000");
  });

  // it('withdraw test', async function () {
  //     let b = await ethers.provider.getBalance(addr9.address);
  //     let before = await wrapped.balanceOf(moss.address);
  //     console.log(before)
  //     await moss.emergencyWithdraw(
  //         wrapped.address,
  //         addr9.address,
  //         before
  //     )
  //     expect(await wrapped.balanceOf(moss.address)).to.equal("0");
  //     expect(await ethers.provider.getBalance(addr9.address)).to.equal(b.add(before));
  //
  //     let mos_s_before = await standardToken.balanceOf(moss.address);
  //     let addr5_s_before = await standardToken.balanceOf(addr5.address)
  //     await moss.emergencyWithdraw(
  //         standardToken.address,
  //         addr5.address,
  //         mos_s_before
  //     )
  //     expect(await standardToken.balanceOf(moss.address)).to.equal("0");
  //     expect(await standardToken.balanceOf(addr5.address)).to.equal(mos_s_before.add(addr5_s_before));
  //     await addr1.sendTransaction({
  //         to:moss.address,
  //         value: ethers.utils.parseEther("2")
  //     })
  //     expect(await ethers.provider.getBalance(moss.address)).to.equal("2000000000000000000");
  //
  //     await moss.emergencyWithdraw(
  //         "0x0000000000000000000000000000000000000000",
  //         addr9.address,
  //         "2000000000000000000"
  //     )
  //     expect(await ethers.provider.getBalance(moss.address)).to.equal("0");
  //
  //     await addr1.sendTransaction({
  //         to:moss.address,
  //         value: ethers.utils.parseEther("2")
  //     })
  //     expect(await ethers.provider.getBalance(moss.address)).to.equal("2000000000000000000");
  //
  //     await moss.emergencyWithdraw(
  //         "0x0000000000000000000000000000000000000000",
  //         addr9.address,
  //         "2000000000000000000"
  //     )
  //
  //     expect(await ethers.provider.getBalance(addr9.address)).to.equal("10002850000000000000000");
  // });

  it("set test", async function () {
    await moss.setPause();
    expect(await moss.paused()).to.equal(true);
    await moss.setUnpause();
    expect(await moss.paused()).to.equal(false);

    await expect(moss.connect(addr3).setPause()).to.be.revertedWith("mos :: only admin");
  });

  it("admin test", async function () {
    await expect(moss.changeAdmin("0x0000000000000000000000000000000000000000")).to.be.revertedWith("address is zero");

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
