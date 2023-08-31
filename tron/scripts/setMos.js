const TronWeb = require('tronweb')
let ethers = require('ethers');
let mos = require("../build/contracts/MAPOmnichainServiceV2.json")
require('dotenv').config();


let priKey = process.env.PRIVATE_KEY
let wtoken = process.env.W_TRX
let lightnode = process.env.LIGHT_NODE;
let owner = process.env.OWNER;


const tronWeb = new TronWeb(
  "https://api.nileex.io/",
  "https://api.nileex.io/",
  "https://api.nileex.io/",
   priKey
)

async function main() {

    let interface = new ethers.utils.Interface([
    "function initialize(address _wToken, address _lightNode,address _owner) external"
    ])

    let data = interface.encodeFunctionData("initialize", [wtoken, lightnode, owner]);

    console.log(data)
}




async function setButterRouter(mos_addr,router_addr) {

  let instance = await tronWeb.contract(mos.abi,mos_addr);

  console.log("old router",await instance.butterRouter().call());

  let res =  await instance.setButterRouterAddress(router_addr).send();
  
  console.log("res:",res);

  console.log("new router",await instance.butterRouter().call());
}


async function setLightNode(mos_addr,lightNode) {

  let instance = await tronWeb.contract(mos.abi,mos_addr);

  console.log("old lightNode",await instance.lightNode().call());

  let res =  await instance.setLightClient(lightNode).send();
  
  console.log("res:",res);

  console.log("new lightNode",await instance.lightNode().call());
}

async function setRelayContract(mos_addr,relay,chainId) {

  let instance = await tronWeb.contract(mos.abi,mos_addr);

  console.log("old relay",await instance.relayContract().call());

  let res =  await instance.setRelayContract(relay,chainId).send();
  
  console.log("res:",res);

  console.log("new relay",await instance.relayContract().call());
}

async function registerToken(mos_addr,token,toChain,flag) {

  let instance = await tronWeb.contract(mos.abi,mos_addr);


  let res =  await instance.registerToken(token,toChain,flag).send();
  
  console.log("res:",res);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});