let { create } = require("../../utils/create.js");
let { stringToHex, isTron, isSolana, isBtc} = require("../../utils/helper");
const {
  getDeployment,
  getChain,
  getToken,
  getChainList,
  getFeeList,
  saveDeployment,
  getTokenList,
} = require("../utils/utils");
const { verify } = require("../../utils/verify");
const { deploy } = require("../../test/util");
const { getTronContract } = require("../../utils/create");
const {solanaAddressToHex, tronAddressToHex, btcAddressToHex} = require("../../utils/address");

let outputAddr = true;

async function getRelay(network) {
  let BridgeAndRelay = await ethers.getContractFactory("BridgeAndRelay");
  let addr = await getDeployment(network, "bridgeProxy");

  let relay = BridgeAndRelay.attach(addr);

  if (outputAddr) {
    console.log("relay address:", relay.address);
  }

  return relay;
}

task("relay:deploy", "mos relay deploy")
  .addOptionalParam("wrapped", "native wrapped token address", "", types.string)
  .addOptionalParam("client", "light client address", "", types.string)
  .addOptionalParam("auth", "auth address", "0xACC31A6756B60304C03d6626fc98c062E4539CCA", types.string)
  .addOptionalParam("fee", "fee service address", "", types.string)
  .setAction(async (taskArgs, hre) => {
    const accounts = await ethers.getSigners();
    const deployer = accounts[0];
    console.log("deployer address:", deployer.address);

    let chain = await getChain(hre.network.config.chainId);

    let client = taskArgs.client === "" ? chain.lightNode : taskArgs.client;
    let wrapped = taskArgs.wrapped === "" ? chain.wToken : taskArgs.wrapped;

    let authority = taskArgs.auth === "" ? chain.auth : taskArgs.auth;
    let feeService = taskArgs.fee === "" ? chain.feeService : taskArgs.fee;

    let implAddr = await create(hre, deployer, "BridgeAndRelay", [], [], "");

    let BridgeAndRelay = await ethers.getContractFactory("BridgeAndRelay");
    let data = await BridgeAndRelay.interface.encodeFunctionData("initialize", [wrapped, authority]);
    let proxy_salt = process.env.BRIDGE_PROXY_SALT;

    let bridge = await create(hre, deployer, "OmniServiceProxy", ["address", "bytes"], [implAddr, data], proxy_salt);

    let relay = BridgeAndRelay.attach(bridge);

    console.log("set light client manager: ", client);
    await (await relay.setServiceContract(1, client)).wait();

    console.log("set fee service: ", feeService);
    await (await relay.setServiceContract(2, feeService)).wait();

    console.log("wToken", await relay.getServiceContract(0));
    console.log("client", await relay.getServiceContract(1));
    console.log("fee", await relay.getServiceContract(2));

    await saveDeployment(hre.network.name, "bridgeProxy");

    // todo contract verify
    await verify(implAddr, [], "contracts/BridgeAndRelay.sol:BridgeAndRelay", hre.network.config.chainId, true);
    await verify(
      proxy,
      [implAddr, data],
      "contracts/OmniServiceProxy.sol:OmniServiceProxy",
      hre.network.config.chainId,
      false,
    );
  });

task("relay:upgrade", "upgrade bridge evm contract in proxy")
  .addOptionalParam("impl", "implementation address", "", types.string)
  .addOptionalParam("auth", "Send through authority call, default false", false, types.boolean)
  .setAction(async (taskArgs, hre) => {
    const { deploy } = hre.deployments;
    const accounts = await ethers.getSigners();
    const deployer = accounts[0];
    console.log("deployer address:", deployer.address);

    let implAddr = taskArgs.impl;
    if (implAddr === "") {
      implAddr = await create(hre, deployer, "BridgeAndRelay", [], [], "");
    }

    let relay = await getRelay(hre.network.name);

    console.log("pre impl", await relay.getImplementation());
    await (await relay.upgradeToAndCall(implAddr, "0x")).wait();
    console.log("new impl", await relay.getImplementation());
  });

task("relay:setServiceContract", "set contract")
  .addParam("type", "contract type, 0-wtoken, 1-lightnode, 2-feeservice, 3-router, 4-register, 5-limit")
  .addParam("contract", "contract address")
  .setAction(async (taskArgs, hre) => {
    const accounts = await ethers.getSigners();
    const deployer = accounts[0];
    console.log("deployer address is:", deployer.address);

    let bridge = await getRelay(hre.network.name);

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

    {
      await (await bridge.setServiceContract(type, taskArgs.contract)).wait();
      console.log("contract", await bridge.getServiceContract(type));
    }
  });

task("relay:setDistributeRate", "set distribute rate")
  .addParam("type", "distribute id, 0 - vault, 1 - relayer, 2 - protocol")
  .addOptionalParam("receiver", "receiver address", "0x0000000000000000000000000000000000000DEF", types.string)
  .addParam("rate", "The percentage value of the fee charged, unit 0.000001")
  .setAction(async (taskArgs, hre) => {
    const accounts = await ethers.getSigners();
    const deployer = accounts[0];
    console.log("deployer address:", deployer.address);

    let relay = await getRelay(hre.network.name);

    await (await relay.setDistributeRate(taskArgs.type, taskArgs.receiver, taskArgs.rate)).wait();
  });

task("relay:registerChain", "register Chain")
  .addParam("chain", "chainId", 0, types.int)
  .addOptionalParam("address", "chainId => address")
  .addOptionalParam("type", "chain type, default 1", 1, types.int)
  .setAction(async (taskArgs, hre) => {
    const accounts = await ethers.getSigners();
    const deployer = accounts[0];
    console.log("deployer address:", deployer.address);

    let relay = await getRelay(hre.network.name);

    let mos = taskArgs.address;
    if (mos.substr(0, 2) !== "0x") {
      if (isTron(taskArgs.chain)) {
        mos = tronAddressToHex(mos);
      } else if (isSolana(taskArgs.chain)) {
        mos = solanaAddressToHex(mos);
      } else if(isBtc(taskArgs.chain)){
        mos = btcAddressToHex(mos);
      } else  {
        mos = "0x" + stringToHex(taskArgs.address);
      }

      console.log(`mos address: ${taskArgs.address} (${mos})`);
    }

    await (await relay.registerChain([taskArgs.chain], [mos], taskArgs.type)).wait();
    console.log(`register chain ${taskArgs.chain} address ${taskArgs.address} success`);
  });

task("relay:updateToken", "update token bridge and fee to target chain")
  .addParam("token", "relay chain token name")
  .setAction(async (taskArgs, hre) => {
    const accounts = await ethers.getSigners();
    const deployer = accounts[0];
    // console.log("deployer address:", deployer.address);

    await hre.run("bridge:updateToken", {
      token: taskArgs.token,
    });

    let tokenAddr = await getToken(hre.network.config.chainId, taskArgs.token);
    let token = await ethers.getContractAt("IERC20Metadata", tokenAddr);
    let decimals = await token.decimals();
    // console.log(`token ${taskArgs.token} address: ${token.address}, decimals ${decimals}`);

    let feeList = await getFeeList(taskArgs.token);
    let chainList = Object.keys(feeList);
    for (let i = 0; i < chainList.length; i++) {
      let chain = await getChain(chainList[i]);
      let chainFee = feeList[chain.name];

      let targetToken = await getToken(chain.chainId, taskArgs.token);
      // console.log(`target ${chain.chainId}, ${targetToken}, ${chainFee.decimals}`)
      await hre.run("register:mapToken", {
        token: tokenAddr,
        chain: chain.chainId,
        target: targetToken,
        decimals: chainFee.decimals,
      });

      await hre.run("register:setTokenFee", {
        token: tokenAddr,
        chain: chain.chainId,
        lowest: chainFee.fee.min,
        highest: chainFee.fee.max,
        rate: chainFee.fee.rate,
        decimals: decimals,
      });

      let transferOutFee = chainFee.outFee;
      if (transferOutFee === undefined) {
        transferOutFee = { min: "0", max: "0", rate: "0" };
      }
      await hre.run("register:setTransferOutFee", {
        token: tokenAddr,
        chain: chain.chainId,
        lowest: transferOutFee.min,
        highest: transferOutFee.max,
        rate: transferOutFee.rate,
        decimals: decimals,
      });
    }

    console.log(`Update token ${taskArgs.token} success`);
  });

task("relay:list", "List relay infos")
  .addOptionalParam("mos", "The mos address, default mos", "mos", types.string)
  .setAction(async (taskArgs, hre) => {
    const accounts = await ethers.getSigners();
    const deployer = accounts[0];
    const chainId = await deployer.getChainId();
    console.log("deployer address:", deployer.address);

    let relay = await getRelay(hre.network.name);

    console.log("Authority:\t", await relay.authority());

    let tokenmanager = await relay.tokenRegister();
    let selfChainId = await relay.selfChainId();
    console.log("selfChainId:\t", selfChainId.toString());
    // console.log("mos:", await relay.mos());
    console.log("Impl:\t", await relay.getImplementation());
    console.log("wToken address:\t", await relay.getServiceContract(0));
    console.log("fee Service:\t", await relay.getServiceContract(2));
    console.log("light Client Manager:\t", await relay.getServiceContract(1));
    console.log("Token manager:\t", await relay.tokenRegister());

    // console.log("fee receiver:\t", await relay.nativeFeeReceiver());

    // console.log("base fee swap:\t", await relay.baseGasLookup(0, 0));
    // console.log("base fee deposit:\t", await relay.baseGasLookup(0, 1));
    // console.log("base fee intertransfer:\t", await relay.baseGasLookup(0, 2));

    let vaultFee = await relay.distributeRate(0);
    let relayFee = await relay.distributeRate(1);
    let protocolFee = await relay.distributeRate(2);
    console.log(`distribute vault rate: rate(${vaultFee[0]})`);
    console.log(`distribute relay rate: rate(${relayFee[0]}), receiver(${relayFee[1]})`);
    console.log(`distribute protocol rate: rate(${protocolFee[0]}), receiver(${protocolFee[1]})`);

    let chainList = await getChainList(chainId);
    console.log("\nRegister chains:");
    let chains = [selfChainId];
    for (let i = 0; i < chainList.length; i++) {
      //console.log(chainList[i].chainId)
      let contract = await relay.mosContracts(chainList[i].chainId);
      if (contract !== "0x") {
        let chaintype = await relay.chainTypes(chainList[i].chainId);
        console.log(`type(${chaintype}) ${chainList[i].chainId}\t => ${contract} `);
        chains.push(chainList[i].chainId);
      }
    }
  });

task("relay:tokenInfo", "List token infos")
  .addOptionalParam("token", "The token address, default wtoken", "wtoken", types.string)
  .setAction(async (taskArgs, hre) => {
    let relay = await getRelay(hre.network.name);

    let tokenManager = await relay.tokenRegister();
    let manager = await ethers.getContractAt("TokenRegisterV3", tokenManager);
    console.log("Token manager:\t", manager.address);

    let tokenAddr = taskArgs.token;
    if (tokenAddr === "wtoken") {
      tokenAddr = await relay.wToken();
    }
    tokenAddr = await getToken(hre.network.config.chainId, tokenAddr);

    await hre.run("bridge:tokenInfo", { token: taskArgs.token });

    let token = await manager.tokenList(tokenAddr);
    //console.log(`token decimals:\t ${token.decimals}`);
    console.log(`vault address: ${token.vaultToken}`);

    let vault = await ethers.getContractAt("VaultTokenV3", token.vaultToken);
    let totalVault = await vault.totalVault();
    console.log(`total vault and fee:\t ${totalVault}`);
    let totalSupply = await vault.totalSupply();
    console.log(`total vault token: ${totalSupply}`);

    let chainList = await getChainList(hre.network.name);
    let chains = [hre.network.config.chainId];
    for (let i = 0; i < chainList.length; i++) {
      let contract = await relay.mosContracts(chainList[i].chainId);
      if (contract !== "0x") {
        chains.push(chainList[i].chainId);
      }
    }
    console.log(`chains:`);
    for (let i = 0; i < chains.length; i++) {
      let info = await manager.getTargetFeeInfo(tokenAddr, chains[i]);
      console.log(`${chains[i]}\t => ${info[0]} (${info[1]}), `);

      let balance = await vault.getVaultByChainId(chains[i]);
      console.log(`\t vault(${balance}), fee min(${info[2][0]}), max(${info[2][1]}), rate(${info[2][2]})`);
    }
  });

async function getAllAddr(relay, taskAddr) {
  if (taskAddr !== "") {
    return new Map([[taskAddr, true]]);
  }

  //let relay = await getRelay(hre.network.name);

  let addr = await relay.getServiceContract(4);
  let manager = await ethers.getContractAt("TokenRegisterV3", addr);

  addr = await relay.getServiceContract(2);
  let feeService = await ethers.getContractAt("FeeService", addr);

  let addrList = new Map();
  // get base addr
  addr = await manager.getBaseFeeReceiver();
  console.log("base receiver: ", addr);
  addrList.set(addr, true);

  addr = await feeService.feeReceiver();
  console.log("message fee receiver: ", addr);
  addrList.set(addr, true);

  let relayFee = await relay.distributeRate(1);
  let protocolFee = await relay.distributeRate(2);
  console.log("relayer fee receiver: ", relayFee[1]);
  addrList.set(relayFee[1], true);
  console.log("protocol fee receiver: ", protocolFee[1]);
  addrList.set(protocolFee[1], true);

  return addrList;
}

task("relay:feeInfo", "List fee infos")
  .addOptionalParam("addr", "The receiver address", "", types.string)
  .addOptionalParam("token", "The token address, default wtoken", "", types.string)
  .setAction(async (taskArgs, hre) => {
    let relay = await getRelay(hre.network.name);
    outputAddr = false;

    let addrList = await getAllAddr(relay, taskArgs.addr);

    let tokenList = new Map();
    if (taskArgs.token === "") {
      let feeList = await getFeeList(hre.network.name);
      let tokens = Object.keys(feeList);
      // console.log(tokens);
      for (let tokenName of tokens) {
        let tokenAddr = await getToken(hre.network.config.chainId, tokenName);
        tokenList.set(tokenName, tokenAddr);
      }
    } else if (taskArgs.token === "wtoken") {
      let tokenAddr = await relay.getServiceContract(0);
      //tokenList = new Map([["wrapped", tokenAddr]]);
      tokenList.set("wrapped", tokenAddr);
    } else {
      let tokenAddr = await getToken(hre.network.config.chainId, taskArgs.token);
      //tokenList = new Map([[taskArgs.token, tokenAddr]]);
      tokenList.set(taskArgs.token, tokenAddr);
    }

    for (let [addr, exist] of addrList) {
      console.log("\naddress: ", addr);
      for (let [tokenName, tokenAddr] of tokenList) {
        //console.log("token: ", tokenInfo);
        let decimals = 18;
        if (tokenName !== "native") {
          let token = await ethers.getContractAt("IERC20Metadata", tokenAddr);
          decimals = await token.decimals();
        }
        let info = await relay.feeList(addr, tokenAddr);
        console.log(`${tokenName}\t => ${await ethers.utils.formatUnits(info, decimals)} `);
      }
    }
  });
