const { BigNumber } = require("ethers");
const { getDeployment } = require("../utils/utils");

async function getRelay(network) {
  let BridgeAndRelay = await ethers.getContractFactory("BridgeAndRelay");
  let addr = await getDeployment(network, "bridgeProxy");

  let relay = BridgeAndRelay.attach(addr);

  console.log("relay address:", relay.address);
  return relay;
}

let messageInTopic = "0x13d3a5b2d6aaada5c31b5654f99c2ab9587cf9a53ee4b2e25b6c68a8dfaa4472";

task("retry:retry", "retry")
  .addParam("hash", "transaction hash")
  .setAction(async (taskArgs, hre) => {
    let bridge = await getRelay(hre.network.name);

    let r = await ethers.provider.getTransactionReceipt(taskArgs.hash);
    let retryLog;
    if (r && r.logs) {
      r.logs.forEach((log) => {
        if (
          log.address.toLowerCase() === bridge.address.toLowerCase() &&
          log.topics[0].toLowerCase() === messageInTopic
        ) {
          retryLog = log;
        }
      });
    }
    if (!retryLog) throw "no messageIn event";
    let orderId = retryLog.topics[1];
    let chainAndGasLimit = BigNumber.from(retryLog.topics[2]);
    let fromChain = BigNumber.from(retryLog.topics[2].substring(0, 18));
    console.log("fromChain: ", fromChain);
    let toChain = BigNumber.from("0x" + retryLog.topics[2].substring(18, 34));
    console.log("toChain: ", toChain);
    let gasUsed = BigNumber.from("0x" + retryLog.topics[2].substring(50, 66));
    console.log("gasUsed: ", gasUsed);
    let decode = ethers.utils.defaultAbiCoder.decode(
      ["address", "uint256", "address", "bytes", "bytes", "bool", "bytes"],
      retryLog.data,
    );
    let token = decode[0];
    let amount = decode[1];
    let to = decode[2];
    let from = decode[3];
    let payload = decode[4];
    let result = decode[5];
    let reason = decode[6];
    console.log("reason: ", reason);
    console.log("decode: ", decode);
    if (result === true) throw "relay not failed";
    let d = ethers.utils.defaultAbiCoder.decode(["uint8", "uint256", "bytes", "bytes", "bytes"], payload);
    let swapData = d[4];
    if(to.toLowerCase() === "0x3B43FB37D1bDA3C1A5fC588b36362B8102aA0341".toLowerCase()){
      let r1 = ethers.utils.defaultAbiCoder.decode(["address", "uint256", "bytes", "bytes"], swapData);
      console.log("before min amount: ", r1[1])
      let minAmount = BigNumber.from(r1[1]).mul(95).div(100);
      console.log("new min amount:", minAmount);
      let newSwap = ethers.utils.defaultAbiCoder.encode(["address", "uint256", "bytes", "bytes"], [r1[0], minAmount, r1[2], r1[3]]);
      await (await bridge.retryMessageIn(chainAndGasLimit, orderId, token, amount, from, payload, newSwap)).wait();
    } else {
      let offset = 0;
      let len = BigNumber.from(swapData.substring(offset, (offset += 4))).toNumber();
      offset += len * 8;
      let needSwap = BigNumber.from('0x' + swapData.substring(offset, (offset += 2))).toNumber();
      if(needSwap > 0) {
        let r1 = ethers.utils.defaultAbiCoder.decode(["address", "uint256", "bytes", "bytes"], ('0x' + swapData.substring(offset)));
        console.log("before min amount: ", r1[1])
        let minAmount = BigNumber.from(r1[1]).mul(95).div(100);
        console.log("new min amount:", minAmount);
        let newSwap = ethers.utils.defaultAbiCoder.encode(["address", "uint256", "bytes", "bytes"], [r1[0], minAmount, r1[2], r1[3]]);
        await (await bridge.retryMessageIn(chainAndGasLimit, orderId, token, amount, from, payload, newSwap)).wait();
      } else {
        let newSwap = '0x' + swapData.substring(offset);
        await (await bridge.retryMessageIn(chainAndGasLimit, orderId, token, amount, from, payload, newSwap)).wait();
      }
    }
  });
