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
    //let to = decode[2];
    let from = decode[3];
    let payload = decode[4];
    let result = decode[5];
    let reason = decode[6];
    console.log("reason: ", reason);
    console.log("decode: ", decode);
    if (result === true) throw "relay not failed";
    // let d = ethers.utils.defaultAbiCoder.decode(["uint8", "uint256", "bytes", "bytes", "bytes"], payload);
    // let swapData = d[4];
    await (await bridge.retryMessageIn(fromChain, orderId, token, amount, from, payload, "")).wait();
  });
