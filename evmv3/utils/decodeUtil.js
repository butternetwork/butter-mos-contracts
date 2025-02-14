const { BigNumber } = require("ethers");



let mos_addr = "0x0000317Bec33Af037b5fAb2028f52d14658F6A56";
let router_addr = "0xEE030ec6F4307411607E55aCD08e628Ae6655B86";
let receiver_addr = "0xFF031cc2563988Bc4afA29E2cD7Bcc2d389900a5";
let messageOut_topic = "0x469059a9fd182ad3741bdd67b925e15056d35262609ea83393db7e8fb5a05ab1";
let messageRelay_topic = "0xf01fbdd2fdbc5c2f201d087d588789d600e38fe56427e813d9dced2cdb25bcac";


async function decodeFun(hash, fromEvm) {
  let data = await getFunctionInput(hash);
  let sig = data.substring(0, 10);
  console.log("sig:", sig);
  switch(sig)
  {
    case "0x119b8248":
        await decodeSwapAndCallFun(data);
        break;
    case "0x6e1537da":
        await decodeSwapAndBridgeFun(data);
        break;
    case "0x2344e655":
        await decodeOnReceivedFun(data);
        break;
    case "0xe282dcdd":
        await decodeMessageIn(data, fromEvm);
        break;
    default:
        console.log("unsupport function");
  }
}


async function decodeEvent(hash, topic, targetEvm) {
  let event = await getEvent(hash, topic);
  if(!event) {
    console.log("event no exist...");
    return;
  }
  switch(topic)
  {
    case messageOut_topic:
        await decodeMessageOut(event);
        break;
    case messageRelay_topic:
        await decodeSwapAndBridgeFun(event, targetEvm);
        break;
    default:
        console.log("unsupport event");
  }
}



async function getFunctionInput(hash) {
    let r = await ethers.provider.getTransaction(hash);
    return r.data;
}

async function getEvent(hash,topic) {
    let r = await ethers.provider.getTransactionReceipt(hash);
    let event;
    if (r && r.logs) {
        r.logs.forEach((log) => {
            if (log.topics[0].toLowerCase() === topic) {
                event = log;
            }
        });
    }
    return event;
}


async function decodeOnReceivedFun(data) {
    let abi = [
      "function onReceived(bytes32 _orderId,address _srcToken,uint256 _amount,uint256 _fromChain, bytes calldata _from,bytes calldata _swapAndCall) external"
    ]
    let i = new ethers.utils.Interface( abi );
    let onReceivedParam = i.decodeFunctionData("onReceived", data);
    console.log("OnReceived.orderId: ", onReceivedParam._orderId)
    console.log("OnReceived.srcToken: ", onReceivedParam._srcToken)
    console.log("OnReceived.amount: ", onReceivedParam._amount)
    console.log("OnReceived.fromChain: ", onReceivedParam._fromChain)
    console.log("OnReceived.from: ", onReceivedParam._from)
    if(onReceivedParam._swapAndCall.length > 2) {
      console.log("<-----------------------------OnReceivedFun swapAndCall------------------------------------------------------->")
      await decodeSwapAndCallParam(onReceivedParam._swapAndCall)
    }
 }


async function decodeSwapAndCallFun(data) {
    let abi = [
      "function swapAndCall(bytes32 _transferId,address _initiator,address _srcToken,uint256 _amount,bytes calldata _swapData,bytes calldata _callbackData,bytes calldata _permitData,bytes calldata _feeData) external"
    ]
 
    let i = new ethers.utils.Interface( abi );
 
    let swapAndCallParam = i.decodeFunctionData("swapAndCall", data);
    console.log("SwapAndCall.transferId: ", swapAndCallParam._transferId)
    console.log("SwapAndCall.initiator: ", swapAndCallParam._initiator)
    console.log("SwapAndCall.srcToken: ", swapAndCallParam._srcToken)
    console.log("SwapAndCall.amount: ", swapAndCallParam._amount)
    if(swapAndCallParam._swapData.length > 2) {
      await decodeSwapParam(swapAndCallParam._swapData);
    } else {
      console.log("SwapAndCall.swapData: ", swapAndCallParam._swapData);
    }
    if(swapAndCallParam._callbackData.length > 2){
       await decodeCalldataParam(swapAndCallParam._callbackData)
    } else {
      console.log("SwapAndCall.callbackData: ", swapAndCallParam._callbackData);
    }
    console.log("SwapAndCall.permitData: ", swapAndCallParam._permitData)
    if(swapAndCallParam._feeData.length > 2){
     let feeData = ethers.utils.defaultAbiCoder.decode(["tuple(uint8,address,uint256)"], swapAndCallParam._feeData)[0]
     console.log("SwapAndCall.fee.feeType: ", feeData[0])
     console.log("SwapAndCall.fee.referrer: ", feeData[1])
     console.log("SwapAndCall.fee.rateOrNativeFee: ", feeData[2])
    }
 }
 



async function decodeSwapAndBridgeFun(data) {
   let abi = [
     "function swapAndBridge(bytes32 _transferId,address _initiator,address _srcToken,uint256 _amount,bytes calldata _swapData,bytes calldata _bridgeData,bytes calldata _permitData,bytes calldata _feeData) external"
   ]

   let i = new ethers.utils.Interface(abi);
   let swapAndBridgeParam = i.decodeFunctionData("swapAndBridge", data);
   console.log("SwapAndBridge.transferId: ", swapAndBridgeParam._transferId)
   console.log("SwapAndBridge.initiator: ", swapAndBridgeParam._initiator)
   console.log("SwapAndBridge.srcToken: ", swapAndBridgeParam._srcToken)
   console.log("SwapAndBridge.amount: ", swapAndBridgeParam._amount)
   if(swapAndBridgeParam._swapData.length > 2) {
     await decodeSwapParam(swapAndBridgeParam._swapData);
   } else {
     console.log("SwapAndBridge.swapData: ", swapAndBridgeParam._swapData)
   }
   if(swapAndBridgeParam._bridgeData.length > 2){
      let bridgeData = ethers.utils.defaultAbiCoder.decode(["tuple(uint256,uint256,bytes,bytes)"], swapAndBridgeParam._bridgeData)[0]
      console.log("SwapAndBridge.bridge.toChain: ", bridgeData[0])
      console.log("SwapAndBridge.bridge.nativeFee: ", bridgeData[1])
      console.log("SwapAndBridge.bridge.receiver: ", bridgeData[2])
      if(bridgeData[3].length >= 2) {
        let bridge =  ethers.utils.defaultAbiCoder.decode(["tuple(bool,address,bytes32,uint256,bytes)"], bridgeData[3])[0];
        console.log("SwapAndBridge.bridge.data.relay: ", bridge[0])
        console.log("SwapAndBridge.bridge.data.referrer: ", bridge[1])
        console.log("SwapAndBridge.bridge.data.transferId: ", bridge[2])
        console.log("SwapAndBridge.bridge.data.gasLimit: ", bridge[3])
        if(bridge[4].length > 2){
          if(bridge[0] === true){
            await decodeRelayExcuter(bridge[4]);
          } else {
            console.log("<-----------------------------SwapAndBridge > bridge > swapAndCall----------------------------------------------------->")
            await decodeSwapAndCallParam(bridge[4]);
          }
        } else {
          console.log("SwapAndBridge.bridge.data.swapData: ", bridge[4])
        }
      } else {
        console.log("SwapAndBridge.bridge.data: ", bridgeData[3])
      }
    }
   console.log("SwapAndBridge.permitData: ", swapAndBridgeParam._permitData)
   if(swapAndBridgeParam._feeData.length > 2){
    let feeData = ethers.utils.defaultAbiCoder.decode(["tuple(uint8,address,uint256)"], swapAndBridgeParam._feeData)[0]
    console.log("SwapAndBridge.fee.feeType: ", feeData[0])
    console.log("SwapAndBridge.fee.referrer: ", feeData[1])
    console.log("SwapAndBridge.fee.rateOrNativeFee: ", feeData[2])
   } else {
     console.log("SwapAndBridge.fee: ", swapAndBridgeParam._feeData)
   }
}


async function decodeSwapOutTokenFun(data) {
    let abi = [
      "function swapOutToken(address _initiator, address _token, bytes memory _to,uint256 _amount,uint256 _toChain, bytes calldata _bridgeData) external payable"
    ] 
    let i = new ethers.utils.Interface(abi);
    let funcParam = i.decodeFunctionData("swapOutToken", data);
    console.log("SwapOutToken.initiator: ", funcParam._initiator)
    console.log("SwapOutToken.token: ", funcParam._token)
    console.log("SwapOutToken.to: ", funcParam._to)
    console.log("SwapOutToken.amount: ", funcParam._amount)
    console.log("SwapOutToken.toChain: ", funcParam._toChain)
    if(funcParam._bridgeData.length > 2){
        let bridgeData =  ethers.utils.defaultAbiCoder.decode(["tuple(bool,address,bytes32,uint256,bytes)"], funcParam._bridgeData)[0];
        console.log("SwapOutToken.bridgeData.relay: ", bridgeData[0])
        console.log("SwapOutToken.bridgeData.referrer: ", bridgeData[1])
        console.log("SwapOutToken.bridgeData.transferId: ", bridgeData[2])
        console.log("SwapOutToken.bridgeData.gasLimit: ", bridgeData[3])
        if(bridgeData[4].length > 2) {
          if(bridgeData[0] === true){
            await decodeRelayExcuter(bridgeData[4]);
          } else {
            console.log("<-----------------------------SwapOutTokenFun swapAndCall----------------------------------------------------->")
            await decodeSwapAndCallParam(bridgeData[4]);
          }
        } else {
          console.log("SwapOutToken.bridgeData.swapData: ", bridgeData[4])
        }
    } else {
      console.log("SwapOutToken.bridgeData.swapData: ", bridgeData[4])
    }
}

async function decodeRelayExcuter(data) {
   // (tokenOut, t.minOut, target, newMessage) = abi.decode(t.message, (address,uint256,bytes,bytes));
   let d = ethers.utils.defaultAbiCoder.decode(["address", "uint256", "bytes", "bytes"], data)
   console.log("RelayExcuter.tokenOut: ", d[0])
   console.log("RelayExcuter.minOut: ", d[1])
   console.log("RelayExcuter.target: ", d[2])
   if(d[3].length > 2){
    console.log("<-----------------------------RelayExcuter swapAndCall----------------------------------------------------->")
    await decodeSwapAndCallParam(d[3]);
   } else {
    console.log("RelayExcuter.newMessage: ", d[3])
   }
}


async function decodeMessageOut(event) {
    console.log("MessageOut.orderId: ", event.topics[1]);
    await decodeChainAndGasLimit(event.topics[2]);
    let data = ethers.utils.defaultAbiCoder.decode(["bytes"], event.data)[0]
    let d =  ethers.utils.defaultAbiCoder.decode(["bytes32", "address", "address", "uint256", "address", "address", "bytes", "bytes"], data)
    console.log("MessageOut.header:", d[0])
    let relay = d[0].substring(48,50) === "01";
    console.log("MessageOut.relay: ", relay);
    console.log("MessageOut.mos: ", d[1]);
    console.log("MessageOut.token: ", d[2]);
    console.log("MessageOut.amount: ", d[3]);
    console.log("MessageOut.initiator: ", d[4]);
    console.log("MessageOut.from: ", d[5]);
    console.log("MessageOut.to: ", d[6]);
    if(d[7].length <= 2) {
      console.log("MessageOut.swapData: ", d[7]);
      return;
    } 
    if(relay === true){
       await decodeRelayExcuter(d[7]);
    } else {
      console.log("<-----------------------------MessageOutEvent swapAndCall----------------------------------------------------->")
      await decodeSwapAndCallParam(d[7]);
    }
  }

async function decodeMessageIn(data,fromEvm) {
    let [wallet] = await ethers.getSigners();
    let abi_b = [
      "function lightClientManager() view external returns(address)",
      "function messageIn(uint256 _chainId,uint256 _logParam,bytes32 _orderId,bytes calldata _receiptProof) external"
    ] 
    let b = await ethers.getContractAt(abi_b, mos_addr, wallet);
    let result = b.interface.decodeFunctionData("messageIn", data)
    console.log("messageIn.chainId  :", result._chainId);
    console.log("messageIn.orderId  :", result._orderId);
    console.log("messageIn.logParam  :", result._logParam);
    if(fromEvm === true){
      let logIndex = BigNumber.from(result._logParam).and(BigNumber.from("0xFFFF"));
      let abi = [
        "function verifyProofData(uint256 _chainId,uint256 _logIndex,bytes calldata _receiptProof) external view returns (bool success, string memory message, tuple(address,bytes32[],bytes) memory txLog)"
      ]
      let m = await ethers.getContractAt(abi, await b.lightClientManager(), wallet);
      let l = await m.verifyProofData(result._chainId, logIndex, result._receiptProof);
      console.log("verifyProofData result:", l.success);
      if(l.success !== true) {
        console.log("verifyProofData fail message: ", l.message);
        return;
      }
      let log = l[2];
      console.log("log addr: ", log[0])
      console.log("log topic: ", log[1][0])
      console.log("orderID: ", log[1][1]);
      await decodeChainAndGasLimit(log[1][2])
      let bytes = ethers.utils.defaultAbiCoder.decode(["bytes"], log[2])[0];
      let d = ethers.utils.defaultAbiCoder.decode(["bytes32", "address", "address", "uint256", "address", "address", "bytes", "bytes"], bytes);
      let relay = d[0].substring(48,50) === "01";
      console.log("from event header: ", d[0])
      console.log("from event relay: ", relay)
      console.log("from event mos: ", d[1])
      console.log("from event token: ", d[2])
      console.log("from event amount: ", d[3])
      console.log("from event initiator: ", d[4])
      console.log("from event from: ", d[5])
      console.log("from event to: ", d[6])
      if(d[7].length <= 2) {
        console.log("from event swapData: ", d[7])
        return;
      }
      if(relay === true){
        await decodeRelayExcuter(d[7])
      } else {
        console.log("<-----------------------------MessageIn swapAndCall----------------------------------------------------->")
        await decodeSwapAndCallParam(d[7]);
      }
    } else {
      let abi = [
        "function verifyProofData(uint256 _chainId,bytes calldata _receiptProof) external view returns (bool success, string memory message, bytes memory log)"
      ]
      let m = await ethers.getContractAt(abi, await b.lightClientManager(), wallet);
      let l = await m.verifyProofData(result._chainId, result._receiptProof);
      console.log("verifyProofData result:", l.success);
      if(l.success !== true) {
        console.log("verifyProofData fail message: ", l.message);
        return;
      }
      let log = ethers.utils.defaultAbiCoder.decode(["bytes", "bytes", "bytes"], l.log);
      console.log("log addr: ", log[0])
      console.log("log topic: ", log[1])
      // console.log("log bytesLog: ", log[2])
      let messageOut = ethers.utils.defaultAbiCoder.decode(["tuple(bool,uint8,uint256,uint256,bytes32,bytes,bytes,bytes,bytes,bytes,uint256,uint256,bytes)"], log[2])[0];
      console.log("from event relay: ", messageOut[0])
      console.log("from event messageType: ", messageOut[1])
      console.log("from event fromChain: ", messageOut[2])
      console.log("from event toChain: ", messageOut[3])
      console.log("from event orderId: ", messageOut[4])
      console.log("from event mos: ", messageOut[5])
      console.log("from event token: ", messageOut[6])
      console.log("from event initiator: ", messageOut[7])
      console.log("from event from: ", messageOut[8])
      console.log("from event to: ", messageOut[9])
      console.log("from event amount: ", messageOut[10])
      console.log("from event gasLimit: ", messageOut[11])
      if(messageOut[12].length <= 2) {
        console.log("from event swapData: ", messageOut[12])
        return;
      }
      if(messageOut[0] === true){
        await decodeRelayExcuter(messageOut[12])
      } else {
        console.log("<-----------------------------MessageIn swapAndCall----------------------------------------------------->")
        await decodeSwapAndCallParam(messageOut[12]);
      }
    }

  }

async function decodeChainAndGasLimit(data) {
  let fromChain = BigNumber.from(data.substring(0, 18));
  console.log("fromChain: ", fromChain)
  let toChain = BigNumber.from("0x" + data.substring(18, 34));
  console.log("toChain: ", toChain)
  let gasUsed = BigNumber.from("0x" + data.substring(50, 66))
  console.log("gasUsed: ", gasUsed)
}

async function decodeMessageRelay(event, targetEvm) {
  console.log("MessageRelay.orderId:", event.topics[1]);
  await decodeChainAndGasLimit(event.topics[2]);
  let chainAndGasLimit = ethers.utils.defaultAbiCoder.decode(["bytes"], event.data)[0]

  if(targetEvm === true){
    let relay = ethers.utils.defaultAbiCoder.decode(["bytes32", "address", "address", "uint256", "address", "bytes", "bytes"], chainAndGasLimit);
    console.log("MessageRelay.header:", relay[0]);
    console.log("MessageRelay.mos:", relay[1]);
    console.log("MessageRelay.token:", relay[2]);
    console.log("MessageRelay.amount:", relay[3]);
    console.log("MessageRelay.to:", relay[4]);
    console.log("MessageRelay.from:", relay[5]);
    if(relay[6].length <= 2) {
      console.log("MessageRelay.swapData:", relay[6]);
      return;
    }
    console.log("<-----------------------------MessageRelay swapAndCall----------------------------------------------------->")
    await decodeSwapAndCallParam(relay[6]);
  } else {
    let version = BigNumber.from(chainAndGasLimit.substring(0, 4));
    console.log("MessageRelay.version: ", version)
    let messageType = BigNumber.from(chainAndGasLimit.substring(4, 6));
    console.log("MessageRelay.messageType: ", messageType)
    let tokenLen = BigNumber.from("0x" + chainAndGasLimit.substring(6, 8));
    console.log("MessageRelay.tokenLen: ", tokenLen)
    let mosLen = BigNumber.from("0x" + chainAndGasLimit.substring(8, 10));
    console.log("MessageRelay.mosLen: ", mosLen)
    let fromLen = BigNumber.from("0x" + chainAndGasLimit.substring(10, 12));
    console.log("MessageRelay.fromLen: ", fromLen)
    let toLen = BigNumber.from("0x" + chainAndGasLimit.substring(12, 14));
    console.log("MessageRelay.toLen: ", toLen)
   
    let payloadLen = BigNumber.from("0x" + chainAndGasLimit.substring(14, 18));
    console.log("MessageRelay.payloadLen: ", payloadLen)
    let tokenAmount = BigNumber.from("0x" + chainAndGasLimit.substring(34, 66));
    console.log("MessageRelay.tokenAmount: ", tokenAmount)
    let start = 66 
    let end = start + tokenLen.toNumber() * 2
    let tokenAddress = "0x" + chainAndGasLimit.substring(start, end);
    console.log("MessageRelay.tokenAddress: ", tokenAddress)
    start = end 
    end = start + mosLen.toNumber() * 2
    let mos = "0x" + chainAndGasLimit.substring(start, end);
    console.log("MessageRelay.mos: ", mos)
    start = end 
    end = start + fromLen.toNumber() * 2
    let from = "0x" + chainAndGasLimit.substring(start, end);
    console.log("MessageRelay.from: ", from)
    start = end 
    end = start + toLen.toNumber() * 2
    let to = "0x" + chainAndGasLimit.substring(start, end);
    console.log("MessageRelay.to: ", to)
    start = end 
    let payload = "0x" + chainAndGasLimit.substring(start);
    console.log("MessageRelay.payload: ", payload)
  }

}

async function decodeSwapAndCallParam(data) {
  let swapAndCall = ethers.utils.defaultAbiCoder.decode(["bytes", "bytes"], data);
  if(swapAndCall[0].length > 2){
    await decodeSwapParam(swapAndCall[0]);
  }
  if(swapAndCall[1].length > 2){
    await decodeCalldataParam(swapAndCall[1])
  }
  console.log("<---------------------------------------------------------------------------------------------------------------->")
}

async function decodeSwapParam(swapBytes) {
  console.log("<---------------------------------------------------------------------------------------------------------------->")
    let swapData = ethers.utils.defaultAbiCoder.decode(
        ["tuple(address,address,address,uint256,tuple(uint8,address,address,uint256,bytes)[])"],
        swapBytes
      )[0];

    console.log("swap.dstToken: ", swapData[0])
    console.log("swap.receiver: ", swapData[1])
    console.log("swap.leftReceiver: ", swapData[2])
    console.log("swap.minAmount: ", swapData[3])
    for (let index = 0; index < swapData[4].length; index++) {
        const element = swapData[4][index];
        let Swap = {
          dexType:element[0],
          callTo: element[1],
          approveTo: element[2],
          fromAmount: element[3],
          callData: element[4]
        }
        console.log(`swap index ${index} : `, Swap)
    }
    console.log("<---------------------------------------------------------------------------------------------------------------->")
}

async function decodeCalldataParam(calldataBytes) {
    console.log("<---------------------------------------------------------------------------------------------------------------->")
    let callData = ethers.utils.defaultAbiCoder.decode(
        ["tuple(address,address,uint256,uint256,address,bytes)"],
        calldataBytes
      )[0];
    console.log("calldata.target: ", callData[0])
    console.log("calldata.approveTo: ", callData[1])
    console.log("calldata.offset: ", callData[2])
    console.log("calldata.extraNativeAmount: ", callData[3])
    console.log("calldata.receiver: ", callData[4])
    console.log("calldata.data: ", callData[5])
    console.log("<---------------------------------------------------------------------------------------------------------------->")
}


module.exports = {
  getFunctionInput,
  getEvent,
  decodeCalldataParam,
  decodeOnReceivedFun,
  decodeSwapAndCallFun,
  decodeSwapAndBridgeFun,
  decodeSwapOutTokenFun,
  decodeRelayExcuter,
  decodeMessageOut,
  decodeMessageIn,
  decodeChainAndGasLimit,
  decodeMessageRelay,
  decodeFun,
  decodeEvent
};