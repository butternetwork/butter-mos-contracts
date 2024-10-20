const { ethers, upgrades } = require("hardhat");
const { expect } = require("chai");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");

describe("ServiceRelayV3 start test", () => {
    let owner;
    let addr1;

    let relay;
    let lightNode;
    let wrapped;
    let echo;
    let feeService;

    async function deployMosContractFixture() {
        [owner, addr1] = await ethers.getSigners();

        let relayContract = await ethers.getContractFactory("BridgeAndRelay");
        relay = await relayContract.deploy();
        console.log("BridgeAndRelay address:", relay.address);

        let wrappedContract = await ethers.getContractFactory("WrapedToken");
        wrapped = await wrappedContract.deploy();
        console.log("Relay Wrapped:", wrapped.address);

        let lightNodeContract = await ethers.getContractFactory("MockLightnodeManager");
        lightNode = await lightNodeContract.deploy();
        console.log("LightClientManager:", lightNode.address);

        let EchoContract = await ethers.getContractFactory("Echo");
        echo = await EchoContract.deploy();
        console.log("echo relayOperation address:", echo.address);

        let data = await relay.interface.encodeFunctionData("initialize", [wrapped.address,owner.address]);

        let proxyContract = await ethers.getContractFactory("OmniServiceProxy");
        let proxy = await proxyContract.deploy(relay.address, data);
        await proxy.deployed();
        relay = relayContract.attach(proxy.address);

        let feeContract = await ethers.getContractFactory("FeeService");
        feeService = await feeContract.deploy();
        await feeService.initialize();
        console.log("FeeService Relay address:", feeService.address);

        await relay.registerChain([5], ["0x5FC8d32690cc91D4c39d9d3abcBD16989F875707"], "1");

        await relay.setContract(2,feeService.address);
        await relay.setContract(1,lightNode.address);

        //await echo.setWhiteList(relay.address);

        await echo.setMapoService(relay.address);

        // await echo.addCorrespondence("5", "0xcf7ed3acca5a467e9e704c703e8d87f634fb0fc9", true);
        // await echo.addCorrespondence("5", "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266", true);

        await feeService.setBaseGas(97, 1000000);
        await feeService.setChainGasPrice(97, "0x0000000000000000000000000000000000000000", 20000);

        return { relay, echo, feeService, owner, addr1, lightNode };
    }

    describe("ServiceRelay start test", () => {

        it("transferOut start test ", async function () {

            let { relay, echo, feeService, owner, addr1, lightNode } = await loadFixture(deployMosContractFixture);

            let data = await echo.getMessageData("hello", "hello world");

            //console.log(echo.address)
            let dataBytes = await echo.getMessageBytes([false, 1, echo.address, data, "5000000", "0"]);

            await relay.transferOut("97", dataBytes, "0x0000000000000000000000000000000000000000", {
                value: 120000000000,
            });

        });

    });
});
