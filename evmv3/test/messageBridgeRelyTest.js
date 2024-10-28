const { ethers, upgrades } = require("hardhat");
const { expect } = require("chai");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");

describe("BridgeRelay start test", () => {
    let owner;
    let addr1;

    let bridge;
    let relay;
    let lightNode;
    let lightNodeManager;
    let wrapped;
    let echo;
    let feeService;
    let utilContract;

    async function deployMosContractFixture() {
        [owner, addr1] = await ethers.getSigners();

        let relayContract = await ethers.getContractFactory("BridgeAndRelay");
        relay = await relayContract.deploy();
        console.log("BridgeAndRelay address:", relay.address);

        let bridgeContract = await ethers.getContractFactory("Bridge");
        bridge = await bridgeContract.deploy();
        console.log("bridgeContract address:", bridge.address);

        let wrappedContract = await ethers.getContractFactory("WrapedToken");
        wrapped = await wrappedContract.deploy();
        console.log("Relay Wrapped:", wrapped.address);

        let lightNodeContract = await ethers.getContractFactory("MockLightnode");
        lightNode = await lightNodeContract.deploy();
        console.log("lightNodeContract:", lightNode.address);

        let LightNodeManager = await ethers.getContractFactory("MockLightnodeManager");
        lightNodeManager = await LightNodeManager.deploy();
        console.log("LightClientManager:", lightNodeManager.address);

        let EchoContract = await ethers.getContractFactory("Echo");
        echo = await EchoContract.deploy();
        console.log("echo relayOperation address:", echo.address);

        let TestUtil = await ethers.getContractFactory("TestUtil");
        utilContract = await TestUtil.deploy();

        let AuthorityManager = await ethers.getContractFactory("AuthorityManager");
        let authorityManager = await AuthorityManager.deploy(owner.address);

        let data = await relay.interface.encodeFunctionData("initialize", [wrapped.address,authorityManager.address]);

        let proxyContract = await ethers.getContractFactory("OmniServiceProxy");
        let proxy = await proxyContract.deploy(relay.address, data);
        await proxy.deployed();
        relay = relayContract.attach(proxy.address);

        let BridgeproxyContract = await ethers.getContractFactory("OmniServiceProxy");
        let BridgeProxy = await BridgeproxyContract.deploy(bridge.address, data);
        await BridgeProxy.deployed();
        bridge = bridgeContract.attach(BridgeProxy.address);

        let feeContract = await ethers.getContractFactory("FeeService");
        feeService = await feeContract.deploy(authorityManager.address);

        await bridge.setRelay(212,bridge.address);

        await bridge.setServiceContract(2,feeService.address);

        await bridge.setServiceContract(1,lightNode.address);

        await relay.registerChain([5,97,212], [bridge.address,bridge.address,bridge.address], "1");

        await relay.setServiceContract(2,feeService.address);
        await relay.setServiceContract(1,lightNodeManager.address);

        await echo.setMapoService(relay.address);

        await feeService.setBaseGas(97, 1000000);
        await feeService.setChainGasPrice(97, "0x0000000000000000000000000000000000000000", 20000);

        return { bridge,relay, echo, feeService, owner, addr1, lightNodeManager };
    }

    describe("ServiceRelay start test", () => {

        it("transferOut start test ", async function () {

            let {bridge, relay, echo, feeService, owner, addr1, lightNodeManager } = await loadFixture(deployMosContractFixture);

            let data = await echo.getMessageData("hello", "hello world");

            //console.log(echo.address)
            let dataBytes = await echo.getMessageBytes([false, 1, echo.address, data, "5000000", "0"]);

            await relay.transferOut("97", dataBytes, "0x0000000000000000000000000000000000000000", {
                value: 120000000000,
            });

        });


        it("messageIn start test ", async function () {

            await echo.setWhiteList(relay.address);

            expect(await echo.EchoList("hello")).to.equal("");

            let data = await echo.getMessageData("hello", "hello relay");

            let dataBytes = await echo.getMessageBytes([false, 1, echo.address, data, "5000000", "0"]);

            let fee = await feeService.getServiceMessageFee(97,"0x0000000000000000000000000000000000000000","500000")

            //console.log(fee)

            let outData =  await bridge.transferOut("97", dataBytes, "0x0000000000000000000000000000000000000000", {
                value: 120000000000,
            });

            let outHashData = await ethers.provider.getTransactionReceipt(outData.hash);
            //console.log(outHashData.logs)

            for( log of outHashData.logs){
                if (log.topics[0] === "0x469059a9fd182ad3741bdd67b925e15056d35262609ea83393db7e8fb5a05ab1"){
                    let logByte = await ethers.utils.defaultAbiCoder.decode(
                        ["bytes"],
                        log.data,
                    );
                    let outDataBytes = await utilContract.adjustLogs(echo.address,echo.address,relay.address,logByte[0]);

                    let topic2 = await utilContract.getChainAndGasLimit(97,1,5000000)
                    //console.log(await ethers.utils.hexZeroPad(ethers.utils.hexlify(topic2), 32))
                    log.topics[2] = await ethers.utils.hexZeroPad(ethers.utils.hexlify(topic2), 32)

                    let newLogBytes = utilContract.encodeTxLog(
                        [
                            log.address,
                            log.topics,
                            outDataBytes
                        ]
                    )

                    let messageInTranscation = await relay.messageIn(
                        97,
                        0,
                        log.topics[1],
                        newLogBytes
                    );

                    let messageInHashData = await ethers.provider.getTransactionReceipt(messageInTranscation.hash);

                }
            }


            expect(await echo.EchoList("hello")).to.equal("hello relay");

        });

        it("messageIn relay start test ", async function () {

            await echo.setWhiteList(relay.address);

            expect(await echo.EchoList("bridge")).to.equal("");

            let data = await echo.getMessageData("bridge", "to relay");

            let dataBytes = await echo.getMessageBytes([relay, 1, echo.address, data, "5000000", "0"]);

            let outData =  await bridge.transferOut("97", dataBytes, "0x0000000000000000000000000000000000000000", {
                value: 120000000000,
            });

            let outHashData = await ethers.provider.getTransactionReceipt(outData.hash);
            //console.log(outHashData.logs)

            for( log of outHashData.logs){
                if (log.topics[0] === "0x469059a9fd182ad3741bdd67b925e15056d35262609ea83393db7e8fb5a05ab1"){
                    let logByte = await ethers.utils.defaultAbiCoder.decode(
                        ["bytes"],
                        log.data,
                    );
                    let outDataBytes = await utilContract.adjustLogs(echo.address,echo.address,relay.address,logByte[0]);

                    let topic2 = await utilContract.getChainAndGasLimit(97,212,5000000)

                    //console.log(await ethers.utils.hexZeroPad(ethers.utils.hexlify(topic2), 32))
                    log.topics[2] = await ethers.utils.hexZeroPad(ethers.utils.hexlify(topic2), 32)
                    let newLogBytes = utilContract.encodeTxLog(
                        [
                            log.address,
                            log.topics,
                            outDataBytes
                        ]
                    )

                    let messageInTranscation = await relay.messageIn(
                        97,
                        0,
                        log.topics[1],
                        newLogBytes
                    );

                    let messageInHashData = await ethers.provider.getTransactionReceipt(messageInTranscation.hash);
                    //console.log(messageInHashData.logs)

                    let logHash = await ethers.utils.defaultAbiCoder.decode(
                        ["bytes"],
                        messageInHashData.logs[0].data
                    )

                    //// abi.encode((version | messageType), mos, token, amount, to, bytes(from), bytes(message))
                    let decodeLog = await ethers.utils.defaultAbiCoder.decode(
                        ["uint256","address","address","uint256","address","bytes","bytes"],
                        logHash[0]
                    )

                    let decodeLogPlayLoad = await ethers.utils.defaultAbiCoder.decode(["string","string"],decodeLog[6])

                    expect(decodeLogPlayLoad[1]).to.equal("relay execute")

                }
            }

            expect(await echo.EchoList("bridge")).to.equal("to relay");

        });

    });
});
