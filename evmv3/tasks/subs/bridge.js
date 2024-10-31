let { create, getTronContract, fromHex, toHex } = require("../../utils/create.js");
let { verify } = require("../../utils/verify.js");
let { stringToHex, isTron} = require("../../utils/helper");
let { getChain, getToken, getFeeList, getFeeInfo, getChainList, writeToFile } = require("../utils/utils.js");
const { getDeployment, saveDeployment } = require("../utils/utils");

let outputAddr = true;

async function getBridge(network, abstract) {
  let addr = await getDeployment(network, "bridgeProxy");

  let bridge;
  if (network === "Tron" || network === "TronTest") {
    bridge = await getTronContract("Bridge", hre.artifacts, hre.network.name, addr);
  } else {
    let contract = abstract ? "BridgeAbstract" : "Bridge";
    bridge = await ethers.getContractAt(contract, addr);
    // let Bridge = await ethers.getContractFactory(contract);
    // bridge = Bridge.attach(addr);
  }

  if (outputAddr) {
    console.log("bridge address:", bridge.address);
  }
  return bridge;
}

task("bridge:deploy", "bridge deploy")
  .addOptionalParam("wrapped", "native wrapped token address", "", types.string)
  .addOptionalParam("client", "omni-chain service address", "", types.string)
  .addOptionalParam("auth", "auth address", "", types.string)
  .addOptionalParam("fee", "fee service address", "", types.string)
  .setAction(async (taskArgs, hre) => {
    const { deploy } = hre.deployments;
    const accounts = await ethers.getSigners();
    const deployer = accounts[0];
    console.log("deployer:", deployer.address);

    let chain = await getChain(hre.network.config.chainId);

    let client = taskArgs.client === "" ? chain.lightNode : taskArgs.client;
    let wrapped = taskArgs.wrapped === "" ? chain.wToken : taskArgs.wrapped;
    let authority = taskArgs.auth === "" ? chain.auth : taskArgs.auth;
    let feeService = taskArgs.fee === "" ? chain.feeService : taskArgs.fee;
    console.log("wrapped token:", wrapped);
    console.log("lightclient address:", client);

    let implAddr = await create(hre, deployer, "Bridge", [], [], "");

    let Bridge = await ethers.getContractFactory("Bridge");
    if (hre.network.name === "Tron" || hre.network.name === "TronTest") {
      wrapped = await toHex(wrapped, hre.network.name);
    }
    let data = await Bridge.interface.encodeFunctionData("initialize", [wrapped, authority]);
    let proxy_salt = process.env.BRIDGE_PROXY_SALT;
    let proxy = await create(hre, deployer, "OmniServiceProxy", ["address", "bytes"], [implAddr, data], proxy_salt);

    if (hre.network.name === "Tron" || hre.network.name === "TronTest") {
      // bridge_addr = await fromHex(bridge_addr, networkName);
      let bridge = await getTronContract("Bridge", hre.artifacts, networkName, proxy);
      await bridge.setServiceContract(1, client).send();
      console.log("wToken", await bridge.getServiceContract(0).call());
      console.log("client", await bridge.getServiceContract(1).call());
    } else {
      let bridge = Bridge.attach(proxy);
      await (await bridge.setServiceContract(1, client)).wait();
      await (await bridge.setServiceContract(2, feeService)).wait();
      console.log("wToken", await bridge.getServiceContract(0));
      console.log("client", await bridge.getServiceContract(1));
      console.log("feeService", await bridge.getServiceContract(2));
    }

    await saveDeployment(hre.network.name, "bridgeProxy", proxy);

    await verify(implAddr, [], "contracts/Bridge.sol:Bridge", hre.network.config.chainId, true);

    await verify(
      proxy,
      [implAddr, data],
      "contracts/OmniServiceProxy.sol:OmniServiceProxy",
      hre.network.config.chainId,
      false,
    );
  });

task("bridge:upgrade", "upgrade bridge evm contract in proxy")
  .addOptionalParam("impl", "implementation address", "", types.string)
  .setAction(async (taskArgs, hre) => {
    const accounts = await ethers.getSigners();
    const deployer = accounts[0];

    console.log("deployer address:", deployer.address);

    let implAddr = taskArgs.impl;
    if (implAddr === "") {
      implAddr = await create(hre, deployer, "Bridge", [], [], "");
    }

    let bridge = await getBridge(hre.network.name, true);

    if (hre.network.name === "Tron" || hre.network.name === "TronTest") {
      console.log("pre impl", await bridge.getImplementation().call());
      await bridge.upgradeToAndCall(implAddr, "0x").send();
      console.log("new impl", await bridge.getImplementation().call());
    } else {
      console.log("pre impl", await bridge.getImplementation());
      await (await bridge.upgradeToAndCall(implAddr, "0x")).wait();
      console.log("new impl", await bridge.getImplementation());
    }

    await verify(implAddr, [], "contracts/Bridge.sol:Bridge", hre.network.config.chainId, true);
  });

task("bridge:setServiceContract", "set contract")
  .addParam("type", "contract type, 0-wtoken, 1-lightnode, 2-feeservice, 3-router, 4-register, 5-limit")
  .addParam("contract", "contract address")
  .setAction(async (taskArgs, hre) => {
    const accounts = await ethers.getSigners();
    const deployer = accounts[0];

    console.log("deployer address is:", deployer.address);

    let bridge = await getBridge(hre.network.name, false);

    let type = taskArgs.type;
    if (taskArgs.type.indexOf("fee") === 0) {
      type = 2;
    } else if (taskArgs.type.indexOf("router") === 0) {
      type = 3;
    } else if (taskArgs.type.indexOf("register") === 0) {
      type = 4;
    } else if (taskArgs.type.indexOf("light") === 0) {
      type = 1;
    }

    if (hre.network.name === "Tron" || hre.network.name === "TronTest") {
      await bridge.setServiceContract(type, taskArgs.contract).send();
      console.log("contract:", await bridge.getServiceContract(type).call());
    } else {
      await (await bridge.setServiceContract(type, taskArgs.contract)).wait();
      console.log("contract", await bridge.getServiceContract(type));
    }
  });

task("bridge:setRelay", "set relay")
  .addParam("chain", "register address")
  .addParam("address", "register address")
  .setAction(async (taskArgs, hre) => {
    const accounts = await ethers.getSigners();
    const deployer = accounts[0];

    console.log("deployer address is:", deployer.address);

    let bridge = await getBridge(hre.network.name, false);

    if (hre.network.name === "Tron" || hre.network.name === "TronTest") {
      await bridge.setRelay(taskArgs.chain, taskArgs.address).send();
    } else {
      await (await bridge.setRelay(taskArgs.chain, taskArgs.address)).wait();
      let relay = await bridge.getRelay();
      console.log("relay chain", relay[0]);
      console.log("relay address", relay[1]);
    }
  });

task("bridge:registerTokenChains", "register token Chains")
  .addParam("token", "token address")
  .addParam("chains", "chains list")
  .addParam("enable", "enable bridge", "", types.boolean)
  .setAction(async (taskArgs, hre) => {
    const accounts = await ethers.getSigners();
    const deployer = accounts[0];
    let chainList = taskArgs.chains.split(",");

    let bridge = await getBridge(hre.network.name, true);

    let tokenAddr = await getToken(hre.network.config.chainId, taskArgs.token);

    let updateList = [];
    for (let i = 0; i < chainList.length; i++) {
      let bridgeable = await bridge.tokenMappingList(chainList[i], tokenAddr);
      if ((taskArgs.enable && bridgeable.toString() === "1") || (!taskArgs.enable && bridgeable.toString() === "0")) {
        continue;
      }
      updateList.push(chainList[i]);
    }
    if (updateList.length === 0) {
      console.log(`token [${taskArgs.token}] bridge [${taskArgs.enable}] no update`);
      return;
    }

    if (hre.network.name === "Tron" || hre.network.name === "TronTest") {
      await bridge.registerTokenChains(tokenAddr, updateList, taskArgs.enable).send();
    } else {
      await (await bridge.registerTokenChains(tokenAddr, updateList, taskArgs.enable)).wait();
    }
    console.log(`set token [${taskArgs.token}] chains [${chainList}] bridgeable [${taskArgs.enable}]`);
  });

task("bridge:updateTokenFeature", "update tokens")
  .addParam("token", "tokens")
  .addOptionalParam("mintable", "mintalbe token", false, types.boolean)
  .setAction(async (taskArgs, hre) => {
    if (outputAddr) {
      const accounts = await ethers.getSigners();
      const deployer = accounts[0];
      console.log("deployer address:", deployer.address);
    }

    let bridge = await getBridge(hre.network.name, true);

    let tokenAddr = await getToken(hre.network.config.chainId, taskArgs.token);
    let isMintable = await bridge.isMintable(tokenAddr);

    if (isMintable === taskArgs.mintable) {
      console.log(`token [${taskArgs.token}] feature no update`);
      return;
    }

    let feature = 0x00;
    if (taskArgs.mintable) {
      feature += 0x01;
    }

    if (hre.network.name === "Tron" || hre.network.name === "TronTest") {
      await bridge.updateTokens([tokenAddr], feature).send();
    } else {
      await (await bridge.updateTokens([tokenAddr], feature)).wait();
    }
    console.log(`set token [${taskArgs.token}] feature [${feature.toString(16)}]`);
  });

task("bridge:updateToken", "update token to target chain")
  .addParam("token", "token name")
  .setAction(async (taskArgs, hre) => {
    const accounts = await ethers.getSigners();
    const deployer = accounts[0];
    console.log("deployer address:", deployer.address);

    outputAddr = false;

    let tokenAddr = await getToken(hre.network.config.chainId, taskArgs.token);
    console.log(`token ${taskArgs.token}  address: ${tokenAddr}`);

    let chain = await getChain(hre.network.name);
    let feeInfo = await getFeeInfo(chain.name, taskArgs.token);
    //let feeInfo = feeList[taskArgs.token];

    let isMintable = feeInfo.mintable === undefined ? false : feeInfo.mintable;
    //let isOmniToken = feeInfo.morc20 === undefined ? false : feeInfo.morc20;
    //let omniProxy = feeInfo.proxy === undefined ? ethers.constants.AddressZero : feeInfo.proxy;
    await hre.run("bridge:updateTokenFeature", {
      token: taskArgs.token,
      mintable: isMintable,
    });

    let chainList = await getChainList(hre.network.config.chainId);
    let addList = [];
    let removeList = [];
    for (let i = 0; i < feeInfo.target.length; i++) {
      let targetChain = await getChain(feeInfo.target[i]);
      addList.push(targetChain.chainId);
    }

    for (let i = 0; i < chainList.length; i++) {
      let j = 0;
      for (j = 0; j < feeInfo.target.length; j++) {
        if (chainList[i].name === feeInfo.target[j]) {
          break;
        }
      }
      if (j < feeInfo.target.length) {
        continue;
      }
      removeList.push(chainList[i].chainId);
    }

    await hre.run("bridge:registerTokenChains", {
      token: taskArgs.token,
      chains: addList.toString(),
      enable: true,
    });
    await hre.run("bridge:registerTokenChains", {
      token: taskArgs.token,
      chains: removeList.toString(),
      enable: false,
    });

    outputAddr = true;

    console.log(`update token [${taskArgs.token}] chains success`);
  });

task("bridge:withdraw", "update token to target chain")
    .addParam("token", "token name")
    .addOptionalParam("addr", "the adress", "", types.string)
    .addOptionalParam("amount", "the token amount", "", types.string)
    .setAction(async (taskArgs, hre) => {
        const accounts = await ethers.getSigners();
        const deployer = accounts[0];
        console.log("deployer address:", deployer.address);

        let tokenAddr = await getToken(hre.network.config.chainId, taskArgs.token);
        console.log(`token ${taskArgs.token}  address: ${tokenAddr}`);

        let receiver = taskArgs.addr;
        if (taskArgs.addr === "") {
            receiver = deployer.address;
        }

        let bridge = await getBridge(hre.network.name, true);

        let amount = await bridge.feeList(receiver, tokenAddr);
        console.log(`[${receiver}] can withdraw token [${tokenAddr}] amount [${amount}]`);
        if (amount.gt(ethers.BigNumber.from("0"))) {
            await (await bridge.withdrawFee(receiver, tokenAddr)).wait();

            console.log(`[${receiver}] can withdraw token [${tokenAddr}] amount [${await bridge.feeList(receiver, tokenAddr)}]`);
        }

    });

task("bridge:transferOut", "Cross-chain transfer token")
  .addOptionalParam("initiator", "The initiator", "", types.string)
  .addOptionalParam("token", "The token address", "0x0000000000000000000000000000000000000000", types.string)
  .addOptionalParam("receiver", "The receiver address", "", types.string)
  .addOptionalParam("chain", "The receiver chain", "22776", types.string)
  .addParam("value", "transfer out value")
  .addOptionalParam("gas", "The gas limit", 0, types.int)
  .setAction(async (taskArgs, hre) => {
    const accounts = await ethers.getSigners();
    const deployer = accounts[0];

    console.log("transfer address:", deployer.address);

    let target = await getChain(taskArgs.chain);
    let targetChainId = target.chainId;
    console.log("target chain:", targetChainId);

    let initiator = taskArgs.initiator;
    if (initiator === "") {
      initiator = deployer.address;
    }

    let receiver = taskArgs.receiver;
    if (taskArgs.receiver === "") {
      receiver = deployer.address;
    } else {
      if (taskArgs.receiver.substr(0, 2) != "0x") {
        receiver = "0x" + stringToHex(taskArgs.receiver);
      }
    }
    console.log("token receiver:", receiver);

    let tokenAddr = await getToken(hre.network.config.chainId, taskArgs.token);
    console.log(`token [${taskArgs.token}] address: ${tokenAddr}`);

    if (hre.network.name === "Tron" || hre.network.name === "TronTest") {
    }

    let bridge = await getBridge(hre.network.name, true);

    let value;
    //let fee = await bridge.getNativeFee(tokenAddr, 0, targetChainId);

    let fee = (value = ethers.utils.parseUnits("0", 18));

    if (tokenAddr === "0x0000000000000000000000000000000000000000") {
      value = ethers.utils.parseUnits(taskArgs.value, 18);
      fee = fee.add(value);
    } else {
      let token = await ethers.getContractAt("IERC20Metadata", tokenAddr);
      let decimals = await token.decimals();
      value = ethers.utils.parseUnits(taskArgs.value, decimals);

      let approved = await token.allowance(deployer.address, bridge.address);
      console.log("approved ", approved);
      if (approved.lt(value)) {
        console.log(`${tokenAddr} approve ${bridge.address} value [${value}] ...`);
        await (await token.approve(bridge.address, value)).wait();
      }
    }
    console.log(`transfer [${taskArgs.token}] with value [${fee}] ...`);
    let rst;
    if (taskArgs.gas === 0) {
      rst = await (
        await bridge.swapOutToken(initiator, tokenAddr, receiver, value, targetChainId, "0x", {
          value: fee,
        })
      ).wait();
    } else {
      rst = await bridge.swapOutToken(initiator, tokenAddr, receiver, value, targetChainId, "0x", {
        value: fee,
        gasLimit: taskArgs.gas,
      });
    }
    // console.log(rst);

    console.log(`transfer token ${taskArgs.token} ${taskArgs.value} to ${receiver} successful`);
  });



task("bridge:list", "List bridge info")
  .addOptionalParam("mos", "The mos address, default mos", "mos", types.string)
  .addOptionalParam("token", "The token address, default wtoken", "wtoken", types.string)
  .setAction(async (taskArgs, hre) => {
    if (hre.network.name === "Tron" || hre.network.name === "TronTest") {
      await tronList(hre.artifacts, hre.network.name, taskArgs.mos, taskArgs.token);
    } else {
      const accounts = await ethers.getSigners();
      const deployer = accounts[0];
      console.log("deployer address:", deployer.address);

      let bridge = await getBridge(hre.network.name, false);

      let selfChainId = await bridge.selfChainId();
      console.log("selfChainId:\t", selfChainId.toString());
      console.log("wToken address:\t", await bridge.getServiceContract(0));
      console.log("light node:\t", await bridge.getServiceContract(1));
      console.log("fee service:\t", await bridge.getServiceContract(2));
      let relay = await bridge.getRelay();
      console.log("relay chain:\t", relay[0]);
      console.log("relay contract:\t", relay[1]);
      console.log("Impl:\t", await bridge.getImplementation());
    }
  });

task("bridge:tokenInfo", "list token info")
  .addOptionalParam("token", "The token address, default wtoken", "wtoken", types.string)
  .addOptionalParam("gas", "The gas limit", 0, types.int)
  .setAction(async (taskArgs, hre) => {
    if (hre.network.name === "Tron" || hre.network.name === "TronTest") {
      await tronList(hre.artifacts, hre.network.name, taskArgs.mos, taskArgs.token);
    } else {
      const accounts = await ethers.getSigners();
      const deployer = accounts[0];

      let bridge = await getBridge(hre.network.name, true);

      let tokenAddr = taskArgs.token;
      if (tokenAddr === "wtoken") {
        tokenAddr = await bridge.getServiceContract(0);
      }
      tokenAddr = await getToken(hre.network.config.chainId, tokenAddr);

      console.log("\ntoken:", taskArgs.token);
      console.log("token address:", tokenAddr);
      console.log(`token mintalbe:\t ${await bridge.isMintable(tokenAddr)}`);

      let feature = await bridge.tokenFeatureList(tokenAddr);
      console.log(`token feature:\t ${feature.toHexString()}`);

      // let nativeFee = await bridge.nativeFees(tokenAddr, 0x00);
      // console.log(`default native fee:\t ${ethers.utils.formatUnits(nativeFee, "ether")}`);

      console.log("register chains:");
      let chains = await getChainList(hre.network.name);
      for (let i = 0; i < chains.length; i++) {
        let chainId = chains[i].chainId;
        let bridgeable = await bridge.tokenMappingList(chainId, tokenAddr);
        if (bridgeable.toString() === "1") {
          // let fee = await bridge.nativeFees(tokenAddr, chainId);
          // console.log(`${chains[i].chain} (${chainId}) \t native fee (${ethers.utils.formatUnits(fee, "ether")})`);
          console.log(`${chains[i].name} (${chainId}))`);

          // console.log(`native fee to ${chains[i].chain} (${chainId}) with gas limt [${taskArgs.gas}] when inter transfer:\t`, await bridge.getNativeFee(tokenAddr, taskArgs.gas, chainId));
        }
      }
      console.log("");
    }
  });
