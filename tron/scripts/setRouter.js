const TronWeb = require('tronweb')
let ethers = require('ethers');
let Router = require("../build/contracts/ButterRouterV2.json")
require('dotenv').config();



let priKey = process.env.PRIVATE_KEY


const tronWeb = new TronWeb(
  "https://api.nileex.io/",
  "https://api.nileex.io/",
  "https://api.nileex.io/",
  priKey
)

async function main() {

}


async function setAuthorization(router_addr,executors,flag) {

  let instance = await tronWeb.contract(Router.abi,router_addr);

  let res =  await instance.setAuthorization(executors,flag).send();
  
  console.log("res:",res);

  console.log(`Router ${router_addr} setAuthorization ${executors} succeed`);

}


async function setFee(router_addr,feeReceiver,feeRate,fixedFee) {

  let instance = await tronWeb.contract(Router.abi,router_addr);

  let res =  await instance.setFee(feeReceiver,feeRate,fixedFee).send();
  
  console.log("res:",res);

  console.log(`Router ${router_addr} setFee rate(${feeRate}), fixed(${fixedFee}), receiver(${feeReceiver}) succeed`);

}





main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});