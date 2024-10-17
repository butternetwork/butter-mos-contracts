
const { ethers } = require("hardhat");
const { expect } = require("chai");
const { BigNumber } = require("ethers");
let { deploy } = require("./util.js");




describe("token-bridge", function () {
    
    let register;
    let wToken;
    let usdt;
    let bridge;
    let relay;
    let testUtil;
    let vaultWToken;
    let vaultUToken;
    let owner;
    let other;

    beforeEach(async function () {
        [owner, other] = await ethers.getSigners();
        [register, wToken, usdt, bridge, relay, testUtil, vaultWToken, vaultUToken] = await deploy()
    });


    describe("token-bridge", function () {
        it("register upgradeTo()", async function () {
            let register_old_impl = await register.getImplementation();

            let TokenRegisterV3 = await ethers.getContractFactory("TokenRegisterV3");
            let tokenRegisterV3 = await TokenRegisterV3.deploy();

            await register.upgradeTo(tokenRegisterV3.address);

            let register_new_impl = await register.getImplementation();
            expect(register_new_impl).eq(tokenRegisterV3.address);
        });

        it("bridge upgradeTo()", async function () {
            let bridge_old_impl = await bridge.getImplementation();

            let Bridge = await ethers.getContractFactory("Bridge");
            let b = await Bridge.deploy();

            await bridge.upgradeTo(b.address);

            let bridge_new_impl = await bridge.getImplementation();
            expect(bridge_new_impl).eq(b.address);
        });

        it("relay upgradeTo()", async function () {
            let relay_old_impl = await relay.getImplementation();

            let BridgeAndRelay = await ethers.getContractFactory("BridgeAndRelay");
            let r = await BridgeAndRelay.deploy();

            await relay.upgradeTo(r.address);

            let relay_new_impl = await relay.getImplementation();
            expect(relay_new_impl).eq(r.address);
        });


        it("Bridge depositToken() - native", async function () {
            let amount = ethers.utils.parseEther("50")
            let result = await bridge.depositToken(ethers.constants.AddressZero, owner.address, amount, {value: amount});
            let receipt = await owner.provider?.getTransactionReceipt(result.hash)
            let message_out_Topic = "0x469059a9fd182ad3741bdd67b925e15056d35262609ea83393db7e8fb5a05ab1";
            let log;
            receipt.logs.forEach(l => {
                if(l.topics[0].toLowerCase() === message_out_Topic){
                    log = {
                        addr: l.address,
                        topics: l.topics,
                        data: l.data
                    }
                }
            });
            if(log) {
                console.log(await testUtil.decodeMessageOut(log))
            }
        });

        it("Bridge depositToken() - ERC20", async function () {
            let amount = ethers.utils.parseEther("50")
            await usdt.approve(bridge.address, amount)
            let result = await bridge.depositToken(usdt.address, owner.address, amount);
            let receipt = await owner.provider?.getTransactionReceipt(result.hash)
            let message_out_Topic = "0x469059a9fd182ad3741bdd67b925e15056d35262609ea83393db7e8fb5a05ab1";
            let log;
            receipt.logs.forEach(l => {
                if(l.topics[0].toLowerCase() === message_out_Topic){
                    log = {
                        addr: l.address,
                        topics: l.topics,
                        data: l.data
                    }
                }
            });
            console.log(log);

            if(log) {
                console.log(await testUtil.decodeMessageOut(log))
            }
        });

        it("Bridge swapOutToken() - native", async function () {
            let amount = ethers.utils.parseEther("50")
            let BridgeParam = {
                relay: false,
                referrer: other.address,
                transferId: "0xbe5efb88602668af34c26331b91eebcde671d0add93c52c8bc70be1435f0b3fd",
                gasLimit: 0,
                swapData: "0x"
            }
            let bridgeData = ethers.utils.defaultAbiCoder.encode(["tuple(bool,address,bytes32,uint256,bytes)"],[[BridgeParam.relay,BridgeParam.referrer,BridgeParam.transferId,BridgeParam.gasLimit,BridgeParam.swapData]]);
            let result = await bridge.swapOutToken(owner.address ,ethers.constants.AddressZero, owner.address, amount, 212, bridgeData, {value: amount});
            let receipt = await owner.provider?.getTransactionReceipt(result.hash)
            let message_out_Topic = "0x469059a9fd182ad3741bdd67b925e15056d35262609ea83393db7e8fb5a05ab1";
            let log;
            receipt.logs.forEach(l => {
                if(l.topics[0].toLowerCase() === message_out_Topic){
                    log = {
                        addr: l.address,
                        topics: l.topics,
                        data: l.data
                    }
                }
            });
            if(log) {
                console.log(await testUtil.decodeMessageOut(log))
            }
        });

        it("Bridge swapOutToken() - ERC20", async function () {
            let amount = ethers.utils.parseEther("50")
            await usdt.approve(bridge.address, amount)
            let BridgeParam = {
                relay: false,
                referrer: other.address,
                transferId: "0xbe5efb88602668af34c26331b91eebcde671d0add93c52c8bc70be1435f0b3fd",
                gasLimit: 0,
                swapData: "0x"
            }
            let bridgeData = ethers.utils.defaultAbiCoder.encode(["tuple(bool,address,bytes32,uint256,bytes)"],[[BridgeParam.relay,BridgeParam.referrer,BridgeParam.transferId,BridgeParam.gasLimit,BridgeParam.swapData]]);
            let result = await bridge.swapOutToken(owner.address ,usdt.address, owner.address, amount, 212, bridgeData);
            let receipt = await owner.provider?.getTransactionReceipt(result.hash)
            let message_out_Topic = "0x469059a9fd182ad3741bdd67b925e15056d35262609ea83393db7e8fb5a05ab1";
            let log;
            receipt.logs.forEach(l => {
                if(l.topics[0].toLowerCase() === message_out_Topic){
                    log = {
                        addr: l.address,
                        topics: l.topics,
                        data: l.data
                    }
                }
            });
            if(log) {
                console.log(await testUtil.decodeMessageOut(log))
            }
        });


        it("relay swapOutToken() - native", async function () {
            let amount = ethers.utils.parseEther("50")
            let BridgeParam = {
                relay: false,
                referrer: other.address,
                transferId: "0xbe5efb88602668af34c26331b91eebcde671d0add93c52c8bc70be1435f0b3fd",
                gasLimit: 0,
                swapData: "0x"
            }
            let bridgeData = ethers.utils.defaultAbiCoder.encode(["tuple(bool,address,bytes32,uint256,bytes)"],[[BridgeParam.relay,BridgeParam.referrer,BridgeParam.transferId,BridgeParam.gasLimit,BridgeParam.swapData]]);
            let result = await relay.swapOutToken(owner.address ,ethers.constants.AddressZero, owner.address, amount, 212, bridgeData, {value: amount});
            let receipt = await owner.provider?.getTransactionReceipt(result.hash)
            let message_relay_Topic = "0xf01fbdd2fdbc5c2f201d087d588789d600e38fe56427e813d9dced2cdb25bcac";
            let log;
            receipt.logs.forEach(l => {
                if(l.topics[0].toLowerCase() === message_relay_Topic){
                    log = {
                        addr: l.address,
                        topics: l.topics,
                        data: l.data
                    }
                }
            });
            if(log) {
                console.log(await testUtil.decodeMessageRelay(log))
            }
        });

        it("relay swapOutToken() - ERC20", async function () {
            let amount = ethers.utils.parseEther("50")
            await usdt.approve(relay.address, amount)
            let BridgeParam = {
                relay: false,
                referrer: other.address,
                transferId: "0xbe5efb88602668af34c26331b91eebcde671d0add93c52c8bc70be1435f0b3fd",
                gasLimit: 0,
                swapData: "0x"
            }
            let bridgeData = ethers.utils.defaultAbiCoder.encode(["tuple(bool,address,bytes32,uint256,bytes)"],[[BridgeParam.relay,BridgeParam.referrer,BridgeParam.transferId,BridgeParam.gasLimit,BridgeParam.swapData]]);
            let result = await relay.swapOutToken(owner.address ,usdt.address, owner.address, amount, 212, bridgeData);
            let receipt = await owner.provider?.getTransactionReceipt(result.hash)
            let message_relay_Topic = "0xf01fbdd2fdbc5c2f201d087d588789d600e38fe56427e813d9dced2cdb25bcac";
            let log;
            receipt.logs.forEach(l => {
                if(l.topics[0].toLowerCase() === message_relay_Topic){
                    log = {
                        addr: l.address,
                        topics: l.topics,
                        data: l.data
                    }
                }
            });
            if(log) {
                console.log(await testUtil.decodeMessageRelay(log))
            }
        });

        it("relay deposit and withdraw - native", async function () {
            let amount = ethers.utils.parseEther("50")
            await expect(await relay.depositToken(ethers.constants.AddressZero, owner.address, amount,{value: amount})).to.be.emit(relay,"DepositIn")
            let b_before = await owner.getBalance();
            await relay.withdraw(vaultWToken.address, await vaultWToken.balanceOf(owner.address))
            let b_after = await owner.getBalance();
            expect(b_before).lt(b_after);
        });

        it("relay deposit and withdraw - ERC20", async function () {
            let amount = ethers.utils.parseEther("50")
            await usdt.approve(relay.address, amount)
            await expect(await relay.depositToken(usdt.address, owner.address, amount)).to.be.emit(relay,"DepositIn")

            let b_before = await usdt.balanceOf(owner.address);
            await relay.withdraw(vaultUToken.address, await vaultUToken.balanceOf(owner.address))
            let b_after = await usdt.balanceOf(owner.address);
            expect(b_before).lt(b_after);
        });

    });

});
