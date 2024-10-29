// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
//
// You can also run a script with `npx hardhat run <script>`. If you do that, Hardhat
// will compile your contracts, add the Hardhat Runtime Environment's members to the
// global scope, and execute the script.
const hre = require("hardhat");

let bridge_addr = "0x7Bf57B8cF64cb4341A238914A61F751E0ea57D26";

async function main() {
  let [wallet] = await ethers.getSigners();
}

async function depositToken(token, v) {
  let [wallet] = await ethers.getSigners();
  let Bridge = await ethers.getContractFactory("Bridge");
  let brdige = Bridge.attach(bridge_addr);
  let amount = ethers.utils.parseEther(v);
  if (token !== ethers.constants.AddressZero) {
    let Token = await ethers.getContractFactory("MockToken");
    let t = Token.attach(token);
    await (await t.approve(brdige.address, amount)).wait();
  }

  await (await brdige.depositToken(token, wallet.address, amount)).wait();
}

async function swapOutToken(v, token, tochain, relay) {
  let [wallet] = await ethers.getSigners();
  let Bridge = await ethers.getContractFactory("Bridge");
  let brdige = Bridge.attach(bridge_addr);
  let amount = ethers.utils.parseEther(v);
  if (token !== ethers.constants.AddressZero) {
    let Token = await ethers.getContractFactory("MockToken");
    let t = Token.attach(token);
    await (await t.approve(brdige.address, amount)).wait();
  }
  let BridgeParam = {
    relay: relay,
    referrer: wallet.address,
    transferId: ethers.constants.HashZero,
    gasLimit: 0,
    swapData: "0x",
  };
  let bridgeData = ethers.utils.defaultAbiCoder.encode(
    ["tuple(bool,address,bytes32,uint256,bytes)"],
    [[BridgeParam.relay, BridgeParam.referrer, BridgeParam.transferId, BridgeParam.gasLimit, BridgeParam.swapData]],
  );
  await (await brdige.swapOutToken(wallet.address, token, wallet.address, amount, tochain, bridgeData)).wait();
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
