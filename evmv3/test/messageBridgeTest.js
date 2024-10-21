const { ethers } = require("hardhat");
const { expect } = require("chai");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");

describe("Bridge start test", () => {
    let owner;
    let addr1;

    let bridge;

    let lightNode;

    let wrapped;

    let echo;

    let utilContract;

    let feeService;

    async function deployOSContractFixture() {
        [owner, addr1] = await ethers.getSigners();

        let bridgeContract = await ethers.getContractFactory("Bridge");
        bridge = await bridgeContract.deploy();
        console.log("bridgeContract address:", bridge.address);

        let wrappedContract = await ethers.getContractFactory("WrapedToken");
        wrapped = await wrappedContract.deploy();
        console.log("Wrapped:", wrapped.address);

        let lightNodeContract = await ethers.getContractFactory("MockLightnode");
        lightNode = await lightNodeContract.deploy();
        console.log("lightNodeContract:", lightNode.address);

        let EchoContract = await ethers.getContractFactory("Echo");
        echo = await EchoContract.deploy();
        console.log("echo address:", echo.address);

        let TestUtil = await ethers.getContractFactory("TestUtil");
        utilContract = await TestUtil.deploy();

        let data = await bridge.interface.encodeFunctionData("initialize", [wrapped.address,owner.address]);

        let proxyContract = await ethers.getContractFactory("OmniServiceProxy");
        let proxy = await proxyContract.deploy(bridge.address, data);
        await proxy.deployed();
        bridge = bridgeContract.attach(proxy.address);

        let feeContract = await ethers.getContractFactory("FeeService");
        feeService = await feeContract.deploy();

        console.log("FeeService address:", feeService.address);

        expect(await feeService.owner()).to.equal("0x0000000000000000000000000000000000000000");

        await feeService.initialize();

        await feeService.setBaseGas(97, 1000000);
        await feeService.setChainGasPrice(97, "0x0000000000000000000000000000000000000000", 10000);

        await bridge.setRelay(212,bridge.address);

        await bridge.setServiceContract(2,feeService.address);

        await bridge.setServiceContract(1,lightNode.address);

        await echo.setWhiteList(bridge.address);

        await echo.setMapoService(bridge.address);

        return { bridge, echo, feeService, owner, addr1, lightNode, utilContract };
    }

    describe("bridgeContract start test", () => {

        it("transferOut start test ", async function () {
            let { bridge, echo, feeService, owner, addr1, lightNode } = await loadFixture(deployOSContractFixture);

            let data = await echo.getData("hello", "hello world");

            let dataBytes = await echo.getMessageBytes([false, 1, echo.address, data, "5000000", "0"]);

            await bridge.transferOut("97", dataBytes, "0x0000000000000000000000000000000000000000", {
                value: 60000000000,
            });

            // await expect(
            //     bridge.transferOut("97", dataBytes, "0x0000000000000000000000000000000000000000", { value: 50 }),
            // ).to.be.revertedWith("not_support_value");

            dataBytes = await echo.getMessageBytes([false, 0, echo.address, data, "5000000", "10"]);

            // await expect(
            //     bridge.transferOut("97", dataBytes, "0x0000000000000000000000000000000000000000", { value: 100 }),
            // ).to.be.revertedWith("MOSV3: not support msg value");
        });

        it("transferIn start test ", async function () {
            expect(await echo.EchoList("hello")).to.equal("");

            let data = await echo.getMessageData("hello", "hello world");

            let dataBytes = await echo.getMessageBytes([false, 1, echo.address, data, "5000000", "0"]);

            let outData =  await bridge.transferOut("97", dataBytes, "0x0000000000000000000000000000000000000000", {
                value: 60000000000,
            });

            let outHashData = await ethers.provider.getTransactionReceipt(outData.hash);
            //console.log(outHashData.logs[0])

            let logByte = await ethers.utils.defaultAbiCoder.decode(
                ["bytes"],
                outHashData.logs[0].data,
            );

            //console.log(logByte)

            // let decodeData = await ethers.utils.defaultAbiCoder.decode(
            //     ["uint256","address","address","uint256","address","bytes","bytes"],
            //     logByte[0],
            // );
            //
            // console.log(decodeData)

            let outDataBytes = await utilContract.adjustLogs(echo.address,"0x5FC8d32690cc91D4c39d9d3abcBD16989F875707",bridge.address,logByte[0]);

            let topic2 = await utilContract.getChainAndGasLimit(212,1,5000000)

            //console.log(await ethers.utils.hexZeroPad(ethers.utils.hexlify(topic2), 32))
            outHashData.logs[0].topics[2] = await ethers.utils.hexZeroPad(ethers.utils.hexlify(topic2), 32)
            outHashData.logs[0].topics[0] = "0xf01fbdd2fdbc5c2f201d087d588789d600e38fe56427e813d9dced2cdb25bcac"
            let newLogBytes = utilContract.encodeTxLog(
                [
                    outHashData.logs[0].address,
                    outHashData.logs[0].topics,
                    outDataBytes
                ]
            )

            await bridge.messageIn(
                212,
                0,
                outHashData.logs[0].topics[1],
                newLogBytes
            );

            expect(await echo.EchoList("hello")).to.equal("hello world");

        });
    });
});
