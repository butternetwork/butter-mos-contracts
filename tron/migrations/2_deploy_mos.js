let ethers = require('ethers');
let {readFromFile,writeToFile} = require("../utils/util.js")
var MAPOmnichainServiceV2 = artifacts.require("./MAPOmnichainServiceV2.sol");
var MAPOmnichainServiceProxyV2 = artifacts.require("./MAPOmnichainServiceProxyV2.sol");



let wtoken = process.env.W_TRX
let lightnode = process.env.LIGHT_NODE;
let owner = process.env.OWNER;
let impl_addr = ""
module.exports = async function(deployer,netwok,account) {
  console.log("deployer address is",account);
  deployer.deploy(MAPOmnichainServiceV2);
  let impl =  await MAPOmnichainServiceV2.deployed()
  impl_addr = impl.address;

  let interface = new ethers.utils.Interface([
    "function initialize(address _wToken, address _lightNode,address _owner) external"
   ])

  let data = interface.encodeFunctionData("initialize", [wtoken, lightnode, owner]);


  deployer.deploy(MAPOmnichainServiceProxyV2,impl_addr,data);

  let proxy = await MAPOmnichainServiceProxyV2.deployed();

  let d = await readFromFile();

  d['mosImpl'] = '0x' + impl.address;
  d["mosProxy"] = '0x' + proxy.address;

  await writeToFile(d);
};
