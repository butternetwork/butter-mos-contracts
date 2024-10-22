// const { types } = require("zksync-web3");
let { create, readFromFile, writeToFile, getTronContract, fromHex, toHex } = require("../../utils/create.js");

let { verify } = require("../utils/verify.js");
let { getChain, getToken, getFeeList, getChainList } = require("../../utils/helper");

let outputAddr = true;

async function getBridge(network, abstract) {
  let deployment = await readFromFile(network);
  let addr = deployment[network]["bridgeProxy"];
  if (!addr) {
    throw "bridge not deployed.";
  }

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
  .addOptionalParam("auth", "authority address", "", types.string)
  .setAction(async (taskArgs, hre) => {
    const { deploy } = hre.deployments;
    const accounts = await ethers.getSigners();
    const deployer = accounts[0];
    console.log("deployer:", deployer.address);

    let chain = await getChain(hre.network.config.chainId);

    let client = taskArgs.client === "" ? chain.lightNode : taskArgs.client;
    let wrapped = taskArgs.wrapped === "" ? chain.wToken : taskArgs.wrapped;
    let authority = taskArgs.auth === "" ? chain.auth : taskArgs.auth;
    console.log("wrapped token:", wrapped);
    console.log("lightclient address:", client);

    let implAddr = await create(hre, deployer, "Bridge", [], [], "");

    let Bridge = await ethers.getContractFactory("Bridge");
    if (hre.network.name === "Tron" || hre.network.name === "TronTest") {
      wrapped = await toHex(wrapped, hre.network.name);
    }
    let data = await Bridge.interface.encodeFunctionData("initialize", [wrapped, deployer.address]);
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
      console.log("wToken", await bridge.getServiceContract(0));
      console.log("client", await bridge.getServiceContract(1));
    }

    let deployment = await readFromFile(hre.network.name);
    deployment[hre.network.name]["bridgeProxy"] = proxy;
    await writeToFile(deployment);

    //await verify(implAddr, [], "contracts/Bridge.sol:Bridge", hre.network.config.chainId, true);

    //await verify(proxy, [implAddr, data], "contracts/OmniServiceProxy.sol:OmniServiceProxy", hre.network.config.chainId, true);
  });

task("bridge:upgrade", "upgrade bridge evm contract in proxy")
  .addOptionalParam("impl", "implementation address", "", types.string)
  .addOptionalParam("auth", "Send through authority call, default false", false, types.boolean)
  .setAction(async (taskArgs, hre) => {
    const accounts = await ethers.getSigners();
    const deployer = accounts[0];

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
      await bridge.upgradeToAndCall(implAddr, "0x");
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

    if (hre.network.name === "Tron" || hre.network.name === "TronTest") {
      await bridge.setServiceContract(taskArgs.type, taskArgs.contract).send();
      console.log("contract:", await bridge.getServiceContract(taskArgs.type).call());
    } else {
      await (await bridge.setServiceContract(taskArgs.type, taskArgs.contract)).wait();
      console.log("contract", await bridge.getServiceContract(taskArgs.type));
    }
  });

task("bridge:setReceiver", "set native fee receiver")
  .addParam("receiver", "receiver address")
  .setAction(async (taskArgs, hre) => {
    const accounts = await ethers.getSigners();
    const deployer = accounts[0];

    console.log("deployer address is:", deployer.address);

    let bridge = await getBridge(hre.network.name, true);

    if (hre.network.name === "Tron" || hre.network.name === "TronTest") {
      await bridge.setNativeFeeReceiver(taskArgs.receiver).send();
    } else {
      await (await bridge.setNativeFeeReceiver(taskArgs.receiver)).wait();
      console.log("receiver address", await bridge.nativeFeeReceiver());
    }
  });
/*
task("bridge:setBaseGas", "set base gas")
  .addOptionalParam("chain", "target chain id, 0 for default", 0, types.int)
  .addParam("type", "Out type, 0 - swap, 1 - deposit, 2 - morc20")
  .addParam("gas", "base gas")
  .setAction(async (taskArgs, hre) => {
    const accounts = await ethers.getSigners();
    const deployer = accounts[0];
    console.log("deployer address:", deployer.address);

    let bridge = await getBridge(hre.network.name, true);

    let chainId = taskArgs.chain;
    if (chainId !== 0) {
      let chain = await getChain(taskArgs.chain);
      chainId = chain.chainId;
    }
    if (hre.network.name === "Tron" || hre.network.name === "TronTest") {
      await bridge.setBaseGas(chainId, taskArgs.type, taskArgs.gas).send();
    } else {
      await (await bridge.setBaseGas(chainId, taskArgs.type, taskArgs.gas)).wait();
    }
  });

task("bridge:setNativeFee", "set base gas")
  .addParam("token", "token name or address")
  .addOptionalParam("chain", "target chain id, 0 for default", 0, types.int)
  .addParam("fee", "native fee")
  .setAction(async (taskArgs, hre) => {
    const accounts = await ethers.getSigners();
    const deployer = accounts[0];
    console.log("deployer address:", deployer.address);

    let bridge = await getBridge(hre.network.name, true);

    let tokenAddr = await getToken(hre.network.config.chainId, taskArgs.token);
    console.log(`token ${taskArgs.token}  address: ${tokenAddr}`);

    let chainId = taskArgs.chain;
    if (chainId !== 0) {
      let chain = await getChain(taskArgs.chain);
      chainId = chain.chainId;
    }
    let fee = ethers.utils.parseUnits(taskArgs.fee, 18);

    console.log(`[${taskArgs.token}] to chain [${chainId}] native fee [${fee}]`);

    if (hre.network.name === "Tron" || hre.network.name === "TronTest") {
      await bridge.setNativeFee(tokenAddr, chainId, taskArgs.fee).send();
    } else {
      await (await bridge.setNativeFee(tokenAddr, chainId, fee)).wait();
    }
  });

task("bridge:registerChain", "register Chain")
  .addParam("chains", "chainId")
  .addParam("addresses", "chainId => address")
  .setAction(async (taskArgs, hre) => {
    const accounts = await ethers.getSigners();
    const deployer = accounts[0];
    console.log("deployer address:", deployer.address);

    let bridge = await getBridge(hre.network.name, false);

    console.log(`register chain [${chainList}] address [${addressList}] success`);
  });
*/
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
      if (taskArgs.enable === bridgeable) {
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
/*
task("bridge:updateTokenNativeFees", "update token native fees")
  .addParam("token", "token")
  .addParam("fee", "native fee")
  .setAction(async (taskArgs, hre) => {
    const accounts = await ethers.getSigners();
    const deployer = accounts[0];
    if (outputAddr) {
      console.log("deployer address:", deployer.address);
    }

    let bridge = await getBridge(hre.network.name, true);
    let tokenAddr = await getToken(hre.network.config.chainId, taskArgs.token);

    // todo, get decimals from wrapped token
    let tokenNativeFee = ethers.utils.parseUnits(taskArgs.fee, 18);
    let chainNativeFee = await bridge.nativeFees(tokenAddr, 0);
    if (chainNativeFee.eq(tokenNativeFee)) {
      console.log(`token [${taskArgs.token}] default native fee no update`);
      return;
    }

    console.log(`set token [${taskArgs.token}] default native fee [${tokenNativeFee}] ...`);
    if (hre.network.name === "Tron" || hre.network.name === "TronTest") {
      await bridge.updateTokens(tokenAddr, 0, tokenNativeFee).send();
    } else {
      await bridge.setNativeFee(tokenAddr, 0, tokenNativeFee);
    }
    // console.log(`set token [${taskArgs.token}] default native fee [${tokenNativeFee}]`);
  });
*/
task("bridge:updateToken", "update token to target chain")
  .addParam("token", "token name")
  .setAction(async (taskArgs, hre) => {
    const accounts = await ethers.getSigners();
    const deployer = accounts[0];
    console.log("deployer address:", deployer.address);

    outputAddr = false;

    let tokenAddr = await getToken(hre.network.config.chainId, taskArgs.token);
    console.log(`token ${taskArgs.token}  address: ${tokenAddr}`);

    let chain = await getChain(hre.network.config.chainId);
    let feeList = await getFeeList(taskArgs.token);
    let feeInfo = feeList[chain.name];

    let isMintable = feeInfo.mintable === undefined ? false : feeInfo.mintable;
    let isOmniToken = feeInfo.morc20 === undefined ? false : feeInfo.morc20;
    let omniProxy = feeInfo.proxy === undefined ? ethers.constants.AddressZero : feeInfo.proxy;
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
        if (chainList[i].chain === feeInfo.target[j]) {
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

task("bridge:grantRole", "grant role")
  .addParam("role", "role address")
  .addParam("account", "account address")
  .addOptionalParam("grant", "grant or revoke", true, types.boolean)
  .setAction(async (taskArgs, hre) => {
    const { deploy } = hre.deployments;
    const accounts = await ethers.getSigners();
    const deployer = accounts[0];

    let role;
    if (taskArgs.role === "upgrade" || taskArgs.role === "upgrader") {
      role = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("UPGRADER_ROLE"));
    } else if (taskArgs.role === "manage" || taskArgs.role === "manager") {
      role = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("MANAGER_ROLE"));
    } else {
      role = ethers.constants.HashZero;
    }

    let Bridge = await ethers.getContractFactory("Bridge");
    let deployment = await readFromFile(hre.network.name);
    let addr = deployment[hre.network.name]["bridgeProxy"];
    if (!addr) {
      throw "bridge not deployed.";
    }

    if (hre.network.name === "Tron" || hre.network.name === "TronTest") {
      let bridge = await getTronContract("Bridge", hre.artifacts, hre.network.name, addr);
      await bridge.grantRole(role, await toHex(taskArgs.account, hre.network.name)).send();
    } else {
      console.log("operator address is:", deployer.address);
      let bridge = Bridge.attach(addr);
      await (await bridge.grantRole(role, taskArgs.account)).wait();
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

    let fee = value = ethers.utils.parseUnits("0", 18);

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
        tokenAddr = await bridge.wToken();
      }
      tokenAddr = await getToken(hre.network.config.chainId, tokenAddr);

      console.log("\ntoken:", taskArgs.token);
      console.log("token address:", tokenAddr);
      console.log(`token mintalbe:\t ${await bridge.isMintable(tokenAddr)}`);

      let isOmni = await bridge.isOmniToken(tokenAddr);
      console.log(`token morc20:\t ${isOmni}`);
      if (isOmni) {
        console.log(`token morc20 proxy:\t ${await bridge.getOmniProxy(tokenAddr)}`);
      }

      let feature = await bridge.tokenFeatureList(tokenAddr);
      console.log(`token feature:\t ${feature.toHexString()}`);

      let nativeFee = await bridge.nativeFees(tokenAddr, 0x00);
      console.log(`default native fee:\t ${ethers.utils.formatUnits(nativeFee, "ether")}`);

      console.log("register chains:");
      let chains = await getChainList();
      for (let i = 0; i < chains.length; i++) {
        let chainId = chains[i].chainId;
        let bridgeable = await bridge.tokenMappingList(chainId, tokenAddr);
        if (bridgeable) {
          let fee = await bridge.nativeFees(tokenAddr, chainId);
          console.log(`${chains[i].chain} (${chainId}) \t native fee (${ethers.utils.formatUnits(fee, "ether")})`);

          // console.log(`native fee to ${chains[i].chain} (${chainId}) with gas limt [${taskArgs.gas}] when inter transfer:\t`, await bridge.getNativeFee(tokenAddr, taskArgs.gas, chainId));
        }
      }
      console.log("");
    }
  });
