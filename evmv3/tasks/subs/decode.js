let { decodeEvent, decodeFun } = require("../../utils/decodeUtil.js");

// support router swapAndCall swapAndBridge onReceive
//         mos messageIn swapOutToken
task("decode:decodeFun", "decode function data")
  .addParam("hash", "transation hash")
  .addOptionalParam("evm", "from evm", true, types.boolean)
  .setAction(async (taskArgs, hre) => {
    await decodeFun(taskArgs.hash, taskArgs.evm);
  });

// support messageOut messageRelay 
task("decode:decodeEvent", "decode event data")
  .addParam("hash", "transation hash")
  .addParam("topic", "event topic")
  .addOptionalParam("evm", "target evm", true, types.boolean)
  .setAction(async (taskArgs, hre) => {
    let topic;
    if(taskArgs.topic === "relay"){
        topic = "0xf01fbdd2fdbc5c2f201d087d588789d600e38fe56427e813d9dced2cdb25bcac"
    } else if(taskArgs.topic === "out"){
        topic = "0x469059a9fd182ad3741bdd67b925e15056d35262609ea83393db7e8fb5a05ab1"
    } else {
        topic = taskArgs.topic;
    }
     await decodeEvent(taskArgs.hash, topic, taskArgs.evm);
  });
