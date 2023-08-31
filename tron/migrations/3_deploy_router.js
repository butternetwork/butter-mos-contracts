let {readFromFile,writeToFile} = require("../utils/util.js")
var SwapAdapter = artifacts.require("./SwapAdapter.sol");
var ButterRouterV2 = artifacts.require("./ButterRouterV2.sol");



let wtoken = process.env.W_TRX
let owner = process.env.OWNER;
module.exports = async function(deployer,netwok,account) {
  console.log("deployer address is",account);

  console.log("owner",owner);
  deployer.deploy(SwapAdapter,owner);
  let adapt =  await SwapAdapter.deployed();

  console.log(adapt.address);

  let d = await readFromFile();

  deployer.deploy(ButterRouterV2,d['mosProxy'],owner,wtoken);

  let router = await ButterRouterV2.deployed();

  d['adapt'] = '0x' + adapt.address;
  d["router"] = '0x' + router.address;

  await writeToFile(d);
};
