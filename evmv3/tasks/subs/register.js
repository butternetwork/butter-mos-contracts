let { create, tronToHex, tronFromHex } = require("../../utils/create.js");
let { stringToHex } = require("../../utils/helper.js");
const {
  getToken,
  getFeeList,
  getChain,
  getChainList,
  getFeeInfo,
  getFeeConfig,
  readFromFile,
  writeToFile,
} = require("../utils/utils.js");
const { task } = require("hardhat/config");

let outputAddr = true;

async function getRegister(network, v2) {
  let deployment = await readFromFile(network);

  let addr;
  if (v2) {
    addr = deployment[network]["registerV2"];
  } else {
    addr = deployment[network]["registerV3"];
  }

  if (!addr) {
    throw "register not deployed.";
  }

  let register = await ethers.getContractAt("TokenRegisterV3", addr);
  if (outputAddr) {
    console.log("token register address:", register.address);
  }

  return register;
}

task("register:deploy", "mos relay deploy").setAction(async (taskArgs, hre) => {
  const { deploy } = hre.deployments;
  const accounts = await ethers.getSigners();
  const deployer = accounts[0];
  console.log("deployer address:", deployer.address);

  let implAddr = await create(hre, deployer, "TokenRegisterV3", [], [], "");

  let TokenRegisterV2 = await ethers.getContractFactory("TokenRegisterV3");
  let data = await TokenRegisterV2.interface.encodeFunctionData("initialize", [deployer.address]);
  let proxy_salt = process.env.REGISTER_PROXY_SALT;

  let proxy = await create(hre, deployer, "OmniServiceProxy", ["address", "bytes"], [implAddr, data], proxy_salt);

  let deployment = await readFromFile(hre.network.name);
  deployment[hre.network.name]["registerProxy"] = proxy;
  await writeToFile(deployment);
});

task("register:upgrade", "upgrade bridge evm contract in proxy")
  .addOptionalParam("impl", "implementation address", "", types.string)
  .addOptionalParam("auth", "Send through authority call, default false", false, types.boolean)
  .addParam("v2", "bridge version: v2/v3, true is v2", false, types.boolean)
  .setAction(async (taskArgs, hre) => {
    const { deploy } = hre.deployments;
    const accounts = await ethers.getSigners();
    const deployer = accounts[0];
    console.log("deployer address:", deployer.address);

    let implAddr = taskArgs.impl;
    if (implAddr === "") {
      implAddr = await create(hre, deployer, "TokenRegisterV3", [], [], "");
    }

    let register = await getRegister(hre.network.name, taskArgs.v2);

    console.log("pre impl", await register.getImplementation());
    await (await register.upgradeToAndCall(implAddr, "0x")).wait();
    console.log("new impl", await register.getImplementation());
  });

task("register:registerToken", "register token")
  .addParam("token", "token address")
  .addParam("mintable", "token mintable", false, types.boolean)
  .addParam("vault", "vault address", "", types.string)
  .addParam("v2", "bridge version: v2/v3, true is v2", false, types.boolean)
  .setAction(async (taskArgs, hre) => {
    const accounts = await ethers.getSigners();
    const deployer = accounts[0];
    console.log("deployer address:", deployer.address);

    let tokenAddr = await getToken(hre.network.config.chainId, taskArgs.token);
    console.log("token address:", tokenAddr);

    let vaultAddr = taskArgs.vault;
    if (vaultAddr === "") {
      let deployment = await readFromFile(hre.network.name);
      if (taskArgs.v2) {
        vaultAddr = deployment[hre.network.name]["vaultV2"][taskArgs.token];
      } else {
        vaultAddr = deployment[hre.network.name]["vault"][taskArgs.token];
      }

      if (!vaultAddr) {
        throw "vault not deployed.";
      }
    }
    console.log("token vault address", vaultAddr);

    let register = await getRegister(hre.network.name, taskArgs.v2);

    await (await register.registerToken(tokenAddr, vaultAddr, taskArgs.mintable)).wait();
    console.log("token", await register.tokenList(tokenAddr));
  });

task("register:mapToken", "mapping token")
  .addParam("token", "relay chain token address")
  .addParam("chain", "chain id")
  .addParam("target", "target token")
  .addParam("decimals", "target token decimals", 18, types.int)
  .addParam("mintable", "token mintable", false, types.boolean)
  .addParam("v2", "bridge version: v2/v3, true is v2", false, types.boolean)
  .addOptionalParam("update", "update token config", "false", types.boolean)
  .setAction(async (taskArgs, hre) => {
    const accounts = await ethers.getSigners();
    const deployer = accounts[0];
    // console.log("deployer address:", deployer.address);

    let register = await getRegister(hre.network.name, taskArgs.v2);

    let tokenAddr = taskArgs.token;
    // get mapped token
    let targetToken = taskArgs.target;
    if (taskArgs.chain === "728126428" || taskArgs.chain === "3448148188") {
      targetToken = await tronToHex(targetToken, "Tron");
    } else if (targetToken.substr(0, 2) !== "0x") {
      let hex = stringToHex(targetToken);
      targetToken = "0x" + hex;
    }
    targetToken = targetToken.toLowerCase();

    let info = await register.getTargetToken(hre.network.config.chainId, taskArgs.chain, tokenAddr);
    // console.log(`target ${taskArgs.chain}, ${info[0]}, ${info[1]}`)
    if (targetToken === info[0] && taskArgs.decimals === info[1] && taskArgs.mintable === info[2]) {
      console.log(`chain [${taskArgs.chain}] token [${taskArgs.token}] map no update`);
      return;
    }
    // map token
    console.log(`${taskArgs.chain} => onchain token(${info[0]}), decimals(${info[1]}), mintable(${info[2]}) `);
    console.log(`\tchain token(${targetToken}), decimals(${taskArgs.decimals}), mintable(${taskArgs.mintable})`);

    if (taskArgs.update) {
      await register.mapToken(tokenAddr, taskArgs.chain, targetToken, taskArgs.decimals, taskArgs.mintable, {
        gasLimit: 500000,
      });
      console.log(`register chain [${taskArgs.chain}] token [${taskArgs.token}] success`);
    }
  });

task("register:registerTokenChains", "register token Chains")
  .addParam("token", "token address")
  .addParam("chains", "chains list")
  .addParam("enable", "enable bridge", "", types.boolean)
  .addParam("v2", "bridge version: v2/v3, true is v2", false, types.boolean)
  .addOptionalParam("update", "update token config", false, types.boolean)
  .setAction(async (taskArgs, hre) => {
    const accounts = await ethers.getSigners();
    const deployer = accounts[0];
    let chainList = taskArgs.chains.split(",");

    let register = await getRegister(hre.network.name, taskArgs.v2);

    let tokenAddr = await getToken(hre.network.config.chainId, taskArgs.token);

    let updateList = [];
    for (let i = 0; i < chainList.length; i++) {
      let info = await register.getTargetFeeInfo(tokenAddr, chainList[i]);
      if (taskArgs.enable === info[0]) {
        continue;
      }
      updateList.push(chainList[i]);
    }
    if (updateList.length === 0) {
      console.log(`token [${taskArgs.token}] bridge [${taskArgs.enable}] no update`);
      return;
    }
    console.log(`\t token [${taskArgs.token}] bridgeable [${taskArgs.enable}] chains [${chainList}]`);
    if (taskArgs.update) {
      if (hre.network.name === "Tron" || hre.network.name === "TronTest") {
        await register.registerTokenChains(tokenAddr, updateList, taskArgs.enable).send();
      } else {
        await (await register.registerTokenChains(tokenAddr, updateList, taskArgs.enable, { gasLimit: 500000 })).wait();
      }
      console.log(`set token [${taskArgs.token}] chains [${chainList}] bridgeable [${taskArgs.enable}]`);
    }
  });

task("register:setFromChainFee", "set transfer outFee")
  .addParam("token", "relay chain token address")
  .addParam("chain", "from chain id")
  .addParam("lowest", "lowest fee cast")
  .addParam("highest", "highest fee cast")
  .addParam("rate", "fee rate")
  .addParam("decimals", "relay chain token decimals", 18, types.int)
  .addParam("v2", "bridge version: v2/v3, true is v2", false, types.boolean)
  .addOptionalParam("update", "update token config", "false", types.boolean)
  .setAction(async (taskArgs, hre) => {
    const accounts = await ethers.getSigners();
    const deployer = accounts[0];
    // console.log("deployer address:", deployer.address);

    let register = await getRegister(hre.network.name, taskArgs.v2);

    let decimals = taskArgs.decimals;
    let min = ethers.utils.parseUnits(taskArgs.lowest, decimals);
    let max = ethers.utils.parseUnits(taskArgs.highest, decimals);
    let rate = ethers.utils.parseUnits(taskArgs.rate, 6);

    let info = await register.getTargetFeeInfo(taskArgs.token, taskArgs.chain);
    if (min.eq(info[3][0]) && max.eq(info[3][1]) && rate.eq(info[3][2])) {
      console.log(`chain [${taskArgs.chain}] token [${taskArgs.token}] from chain fee no update`);
      return;
    }
    console.log(`${taskArgs.chain} => on-chain outFee min(${info[3][0]}), max(${info[3][1]}), rate(${info[3][2]}) `);
    console.log(`\tconfig outFee min(${taskArgs.lowest}), max(${taskArgs.highest}), rate(${taskArgs.rate})`);

    if (taskArgs.update) {
      await register.setFromChainFee(taskArgs.token, taskArgs.chain, min, max, rate, { gasLimit: 500000 });
    }

    console.log(`set chain [${taskArgs.chain}] token [${taskArgs.token}] from chain fee success`);
  });

task("register:setToChainFee", "set to chain token outFee")
  .addParam("token", "token address")
  .addParam("chain", "from chain id")
  .addParam("lowest", "lowest fee cast")
  .addParam("highest", "highest fee cast")
  .addParam("rate", "fee rate")
  .addParam("decimals", "relay chain token decimals", 18, types.int)
  .addParam("v2", "bridge version: v2/v3, true is v2", false, types.boolean)
  .addOptionalParam("update", "update token config", "false", types.boolean)
  .setAction(async (taskArgs, hre) => {
    const accounts = await ethers.getSigners();
    const deployer = accounts[0];
    // console.log("deployer address:", deployer.address);

    let register = await getRegister(hre.network.name, taskArgs.v2);

    let decimals = taskArgs.decimals;
    let min = ethers.utils.parseUnits(taskArgs.lowest, decimals);
    let max = ethers.utils.parseUnits(taskArgs.highest, decimals);
    let rate = ethers.utils.parseUnits(taskArgs.rate, 6);

    let info = await register.getTargetFeeInfo(taskArgs.token, taskArgs.chain);
    if (min.eq(info[2][0]) && max.eq(info[2][1]) && rate.eq(info[2][2])) {
      console.log(`chain [${taskArgs.chain}] token [${taskArgs.token}] to chain fee no update`);
      return;
    }
    console.log(`${taskArgs.chain} => on-chain fee min(${info[2][0]}), max(${info[2][1]}), rate(${info[2][2]}) `);
    console.log(`\tconfig fee min(${min}), max(${max}), rate(${rate})`);
    if (taskArgs.update) {
      await register.setToChainTokenFee(taskArgs.token, taskArgs.chain, min, max, rate, { gasLimit: 500000 });
      console.log(`set chain [${taskArgs.chain}] token [${taskArgs.token}] to chain fee success`);
    }

    // await register.setTokenFee(taskArgs.token, taskArgs.from, taskArgs.lowest, taskArgs.highest, taskArgs.rate);
  });

task("register:setBaseFee", "set target chain token base fee")
  .addParam("token", "token address")
  .addParam("chain", "from chain id")
  .addParam("swap", "with swap on target chain")
  .addParam("bridge", "no swap on target chain")
  .addParam("decimals", "relay chain token decimals", 18, types.int)
  .addParam("v2", "bridge version: v2/v3, true is v2", false, types.boolean)
  .addOptionalParam("update", "update token config", "false", types.boolean)
  .setAction(async (taskArgs, hre) => {
    // const accounts = await ethers.getSigners();
    // const deployer = accounts[0];
    // console.log("deployer address:", deployer.address);

    let register = await getRegister(hre.network.name, taskArgs.v2);

    let decimals = taskArgs.decimals;
    let withswap = ethers.utils.parseUnits(taskArgs.swap, decimals);
    let noswap = ethers.utils.parseUnits(taskArgs.bridge, decimals);

    let info = await register.getTargetFeeInfo(taskArgs.token, taskArgs.chain);
    if (withswap.eq(info[1][0]) && noswap.eq(info[1][1])) {
      console.log(`chain [${taskArgs.chain}] token [${taskArgs.token}] base fee no update`);
      return;
    }
    console.log(`${taskArgs.chain} => on-chain base fee swap(${info[1][0]}), bridge(${info[1][1]})`);
    console.log(`\tconfig base fee swap(${withswap}), noswap(${noswap})`);

    if (taskArgs.update) {
      await register.setBaseFee(taskArgs.token, taskArgs.chain, withswap, noswap, { gasLimit: 500000 });
      console.log(`set chain ${taskArgs.chain} token ${taskArgs.token} base fee success`);
    }
  });

task("register:setBaseFeeReceiver", "set set baseFee Receiver")
  .addParam("receiver", "base fee receiver")
  .addParam("v2", "bridge version: v2/v3, true is v2", false, types.boolean)
  .setAction(async (taskArgs, hre) => {
    const accounts = await ethers.getSigners();
    const deployer = accounts[0];
    console.log("deployer address:", deployer.address);

    let register = await getRegister(hre.network.name, taskArgs.v2);

    await (await register.setBaseFeeReceiver(taskArgs.receiver)).wait();

    console.log(`set setBaseFeeReceiver ${await register.getBaseFeeReceiver()}`);
  });

task("register:updateTokenChains", "update token target chain")
  .addParam("token", "token name")
  .addParam("v2", "bridge version: v2/v3, true is v2", false, types.boolean)
  .addOptionalParam("update", "update token config", false, types.boolean)
  .setAction(async (taskArgs, hre) => {
    const accounts = await ethers.getSigners();
    const deployer = accounts[0];
    //console.log("deployer address:", deployer.address);

    outputAddr = false;

    // let tokenAddr = await getToken(hre.network.config.chainId, taskArgs.token);
    // console.log(`token ${taskArgs.token}  address: ${tokenAddr}`);

    let chain = await getChain(hre.network.config.chainId);
    let feeInfo = await getFeeInfo(chain.name, taskArgs.token);

    let chainList = await getChainList(hre.network.name);
    let addList = [];
    let removeList = [];
    for (let i = 0; i < chainList.length; i++) {
      if (feeInfo.target.includes(chainList[i].name)) {
        addList.push(chainList[i].chainId);
      } else {
        removeList.push(chainList[i].chainId);
      }
    }
    if (addList.length > 0) {
      await hre.run("register:registerTokenChains", {
        token: taskArgs.token,
        chains: addList.toString(),
        enable: true,
        update: taskArgs.update,
        v2: taskArgs.v2,
      });
    }

    if (removeList.length > 0) {
      await hre.run("register:registerTokenChains", {
        token: taskArgs.token,
        chains: removeList.toString(),
        enable: false,
        update: taskArgs.update,
        v2: taskArgs.v2,
      });
    }

    // console.log(`update token [${taskArgs.token}] chains success`);
  });

task("register:setToChainWhitelistFee", "set to chain token outFee")
  .addParam("token", "relay chain token address")
  .addParam("sender", "caller address")
  .addParam("from", "from chain name/id")
  .addParam("to", "to chain name/id")
  .addParam("rate", "fee rate")
  .addParam("whitelist", "whitelist", false, types.boolean)
  .addParam("v2", "bridge version: v2/v3, true is v2", false, types.boolean)
  .addOptionalParam("update", "update token config", false, types.boolean)
  .setAction(async (taskArgs, hre) => {
    const accounts = await ethers.getSigners();
    const deployer = accounts[0];
    // console.log("deployer address:", deployer.address);

    let register = await getRegister(hre.network.name, taskArgs.v2);

    let fromChain = await getChain(taskArgs.from);
    let toChain = await getChain(taskArgs.to);

    let token = await getToken(hre.network.name, taskArgs.token);
    let rate = ethers.utils.parseUnits(taskArgs.rate, 6);

    let info = await register.getToChainCallerFeeRate(token, fromChain.chainId, toChain.chainId, taskArgs.sender);
    if (taskArgs.whitelist === info[0] && rate.eq(info[1])) {
      console.log(
        `caller [${taskArgs.sender}] token[${taskArgs.token}] from [${fromChain.name}] to [${toChain.name}] rate no update`,
      );
      return;
    } else if (taskArgs.whitelist === info[0] && taskArgs.whitelist === false) {
      console.log(
        `caller [${taskArgs.sender}] token[${taskArgs.token}] from [${fromChain.name}] to [${toChain.name}] rate no update`,
      );
      return;
    }

    console.log(
      `${taskArgs.from} ${taskArgs.token} to ${taskArgs.to} => on-chain whitelist(${info[0]}), rate(${info[1]}) `,
    );
    console.log(`\tconfig whitelist(${taskArgs.whitelist}), rate(${rate})`);
    if (taskArgs.update) {
      await register.setToChainWhitelistFeeRate(
        token,
        fromChain.chainId,
        toChain.chainId,
        taskArgs.sender,
        rate,
        taskArgs.whitelist,
        { gasLimit: 100000 },
      );
      console.log(
        `set caller [${taskArgs.sender}] token[${taskArgs.token}] from [${fromChain.name}] to [${toChain.name}] rate success`,
      );
    }
  });

task("register:setFromChainWhitelistFee", "set to chain token outFee")
  .addParam("token", "relay chain token name")
  .addParam("sender", "sender address")
  .addParam("from", "from chain id")
  .addParam("rate", "fee rate")
  .addParam("whitelist", "whitelist", false, types.boolean)
  .addParam("v2", "bridge version: v2/v3, true is v2", false, types.boolean)
  .addOptionalParam("update", "update token config", "false", types.boolean)
  .setAction(async (taskArgs, hre) => {
    const accounts = await ethers.getSigners();
    const deployer = accounts[0];
    // console.log("deployer address:", deployer.address);

    let register = await getRegister(hre.network.name, taskArgs.v2);

    let fromChain = await getChain(taskArgs.from);

    let token = await getToken(hre.network.name, taskArgs.token);
    let rate = ethers.utils.parseUnits(taskArgs.rate, 6);

    let sender = taskArgs.sender;
    if (fromChain.name === "Tron") {
      sender = toHex(taskArgs.sender, "Tron");
    }

    let info = await register.getFromChainCallerFeeRate(token, fromChain.chainId, sender);
    if (taskArgs.whitelist === info[0] && rate.eq(info[1])) {
      console.log(`caller [${taskArgs.sender}] token[${taskArgs.token}] from [${fromChain.name}] rate no update`);
      return;
    } else if (taskArgs.whitelist === info[0] && taskArgs.whitelist === false) {
      console.log(`caller [${taskArgs.sender}] token[${taskArgs.token}] from [${fromChain.name}] rate no update`);
      return;
    }

    console.log(`${taskArgs.from} ${taskArgs.token} => on-chain whitelist(${info[0]}), rate(${info[1]}) `);
    console.log(`\tconfig whitelist(${taskArgs.whitelist}), rate(${rate})`);
    if (taskArgs.update) {
      await register.setFromChainWhitelistFeeRate(token, fromChain.chainId, sender, rate, taskArgs.whitelist, {
        gasLimit: 100000,
      });
      console.log(`set caller [${taskArgs.sender}] token[${taskArgs.token}] from [${fromChain.name}] rate success`);
    }

    // await register.setTokenFee(taskArgs.token, taskArgs.from, taskArgs.lowest, taskArgs.highest, taskArgs.rate);
  });

task("register:updateCallerFee", "update whitelist fee")
  .addParam("caller", "subject")
  .addParam("v2", "bridge version: v2/v3, true is v2", false, types.boolean)
  .addOptionalParam("update", "update token config", false, types.boolean)
  .setAction(async (taskArgs, hre) => {
    const accounts = await ethers.getSigners();
    const deployer = accounts[0];

    let register = await getRegister(hre.network.name, taskArgs.v2);
    outputAddr = false;

    let config = await getFeeConfig(taskArgs.caller);
    if (!config) {
      console.log("fee config not set");
      return;
    }

    for (let chain in config) {
      let chainConfig = config[chain];

      for (let token in chainConfig["tokens"]) {
        let fromFee = chainConfig["tokens"][token]["fromChainFee"];
        if (fromFee) {
          await hre.run("register:setFromChainWhitelistFee", {
            token: token,
            sender: chainConfig["caller"],
            from: chain,
            rate: fromFee["rate"],
            whitelist: fromFee["whitelist"],
            v2: taskArgs.v2,
            update: taskArgs.update,
          });
        }
        let toChainFeeList = chainConfig["tokens"][token]["toChainFee"];
        if (toChainFeeList) {
          for (let toChainFee of toChainFeeList) {
            await hre.run("register:setToChainWhitelistFee", {
              token: token,
              sender: chainConfig["caller"],
              from: chain,
              to: toChainFee.toChain,
              rate: toChainFee.rate,
              whitelist: toChainFee.whitelist,
              v2: taskArgs.v2,
              update: taskArgs.update,
            });
          }
        }
      }
    }
  });

task("register:update", "update token bridge and fee to target chain")
  .addOptionalParam("chain", "chain name", "", types.string)
  .addParam("v2", "bridge version: v2/v3, true is v2", false, types.boolean)
  .addOptionalParam("update", "update token config", false, types.boolean)
  .setAction(async (taskArgs, hre) => {
    const accounts = await ethers.getSigners();
    const deployer = accounts[0];
    // console.log("deployer address:", deployer.address);

    let register = await getRegister(hre.network.name, taskArgs.v2);
    outputAddr = false;

    let chainList = [];
    if (taskArgs.chain === "") {
      chainList = await getChainList(hre.network.name);
    } else {
      let chain = await getChain(taskArgs.chain);
      chainList.push(chain);
    }

    for (let chain of chainList) {
      console.log(`\n============ update chain [${chain.name}] ============`);

      let feeList = await getFeeList(chain.name);

      let tokenList = Object.keys(feeList);
      for (let tokenName of tokenList) {
        if (tokenName === "native") {
          continue;
        }

        if (taskArgs.v2) {
          if (tokenName === "trx" || tokenName === "ton" || tokenName === "sol") {
            continue;
          }
        } else {
          if (
            tokenName === "m-btc" ||
            tokenName === "solvbtc" ||
            tokenName === "iusd" ||
            tokenName === "stmapo" ||
            tokenName === "lsgs" ||
            tokenName === "stst" ||
            tokenName === "merl" ||
            tokenName === "mp" ||
            tokenName === "mstar" ||
            tokenName === "mapo"
          ) {
            continue;
          }
        }

        console.log(`\nUpdate token [${tokenName}] ...`);
        let feeInfo = feeList[tokenName];
        let tokenAddr = await getToken(hre.network.config.chainId, tokenName);
        let token = await ethers.getContractAt("IERC20Metadata", tokenAddr);
        let decimals = await token.decimals();
        //console.log(`token ${taskArgs.token} address: ${token.address}, decimals ${decimals}`);

        await hre.run("register:updateTokenChains", {
          token: tokenName,
          update: taskArgs.update,
          v2: taskArgs.v2,
        });

        let targetToken = await getToken(chain.name, tokenName);
        console.log(`target ${chain.chainId}, ${targetToken}`);
        await hre.run("register:mapToken", {
          token: tokenAddr,
          chain: chain.chainId,
          target: targetToken,
          decimals: feeInfo.decimals,
          mintable: feeInfo.mintable,
          update: taskArgs.update,
          v2: taskArgs.v2,
        });

        await hre.run("register:setBaseFee", {
          token: tokenAddr,
          chain: chain.chainId,
          bridge: feeInfo.base.bridge,
          swap: feeInfo.base.swap,
          decimals: decimals,
          update: taskArgs.update,
          v2: taskArgs.v2,
        });

        await hre.run("register:setToChainFee", {
          token: tokenAddr,
          chain: chain.chainId,
          lowest: feeInfo.fee.min,
          highest: feeInfo.fee.max,
          rate: feeInfo.fee.rate,
          decimals: decimals,
          update: taskArgs.update,
          v2: taskArgs.v2,
        });

        let transferOutFee = feeInfo.outFee;
        if (transferOutFee === undefined) {
          transferOutFee = { min: "0", max: "0", rate: "0" };
        }
        await hre.run("register:setFromChainFee", {
          token: tokenAddr,
          chain: chain.chainId,
          lowest: transferOutFee.min,
          highest: transferOutFee.max,
          rate: transferOutFee.rate,
          decimals: decimals,
          update: taskArgs.update,
          v2: taskArgs.v2,
        });
      }
    }
  });

task("register:grantRole", "set token outFee")
  .addParam("role", "role address")
  .addParam("account", "account address")
  .addOptionalParam("grant", "grant or revoke", true, types.boolean)
  .addParam("v2", "bridge version: v2/v3, true is v2", false, types.boolean)
  .setAction(async (taskArgs, hre) => {
    const accounts = await ethers.getSigners();
    const deployer = accounts[0];
    console.log("deployer address:", deployer.address);

    let register = await getRegister(hre.network.name, taskArgs.v2);

    console.log("token register:", register.address);

    let role;
    if (taskArgs.role === "upgrade" || taskArgs.role === "upgrader") {
      role = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("UPGRADER_ROLE"));
    } else if (taskArgs.role === "manage" || taskArgs.role === "manager") {
      role = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("MANAGER_ROLE"));
    } else {
      role = ethers.constants.HashZero;
    }

    if (taskArgs.grant) {
      await (await register.grantRole(role, taskArgs.account)).wait();
      console.log(`grant ${taskArgs.account} role ${role}`);
    } else {
      await register.revokeRole(role, taskArgs.account);
      console.log(`revoke ${taskArgs.account} role ${role}`);
    }
  });

task("register:getFee", "get token fees")
  .addOptionalParam("token", "The token name", "wtoken", types.string)
  .addOptionalParam("caller", "call address", "", types.string)
  .addParam("from", "from chain")
  .addParam("to", "to chain")
  .addParam("amount", "token amount")
  .addParam("v2", "bridge version: v2/v3, true is v2", false, types.boolean)
  .setAction(async (taskArgs, hre) => {
    const accounts = await ethers.getSigners();
    const deployer = accounts[0];

    let register = await getRegister(hre.network.name, taskArgs.v2);

    outputAddr = false;

    let caller = taskArgs.caller;
    if (caller === "") {
      caller = deployer.address;
    }

    console.log(`\ntoken: ${taskArgs.token}`);
    let fromChain = await getChain(taskArgs.from);
    let toChain = await getChain(taskArgs.to);

    let token = await getToken(fromChain.name, taskArgs.token);
    let relayToken = await getToken(hre.network.config.chainId, taskArgs.token);

    let fromToken = token;
    if (fromChain.name === "Tron" || fromChain.name === "TronTest") {
      fromToken = await toHex(token, "Tron");
    } else if (token.substr(0, 2) !== "0x") {
      let hex = stringToHex(token);
      fromToken = "0x" + hex;
    }

    console.log(`relay token [${await register.getRelayChainToken(fromChain.chainId, fromToken)}]`);
    console.log(`mintable [${await register.checkMintable(relayToken)}]`);
    console.log(`vault token [${await register.getVaultToken(relayToken)}]`);

    console.log(`target token [${await register.getToChainToken(relayToken, toChain.chainId)}]`);

    let fromTokenInfo = await register.getTargetToken(fromChain.chainId, fromChain.chainId, fromToken);
    let toTokenInfo = await register.getTargetToken(fromChain.chainId, toChain.chainId, fromToken);

    console.log(
      `from [${fromChain.name}] address [${fromTokenInfo[0]}] decimals [${fromTokenInfo[1]}] mintable [${fromTokenInfo[2]}]`,
    );
    console.log(
      `to [${toChain.name}] address [${toTokenInfo[0]}] decimals [${toTokenInfo[1]}] mintable [${toTokenInfo[2]}]`,
    );

    let info = await register.getTargetFeeInfo(relayToken, fromChain.chainId);
    console.log(
      `[${fromChain.name}] out fee: min(${ethers.utils.formatUnits(
        info[3][0],
        "ether",
      )}), max(${ethers.utils.formatUnits(info[3][1], "ether")}), rate(${ethers.utils.formatUnits(info[3][2], 6)})`,
    );

    info = await register.getTargetFeeInfo(relayToken, toChain.chainId);
    console.log(
      `[${toChain.name}] base fee: bridge(${ethers.utils.formatUnits(
        info[1][1],
      )}) swap(${ethers.utils.formatUnits(info[1][0])})`,
    );
    console.log(
      `[${toChain.name}] in fee: min(${ethers.utils.formatUnits(info[2][0])}), max(${ethers.utils.formatUnits(
        info[2][1],
      )}), rate(${ethers.utils.formatUnits(info[2][2], 6)})`,
    );

    let amount = ethers.utils.parseUnits(taskArgs.amount, fromTokenInfo[1]);

    let relayAmount = await register.getTargetAmount(fromChain.chainId, hre.network.config.chainId, fromToken, amount);

    let swapInfo = await register.getBridgeFeeInfoV3(
      caller,
      fromToken,
      fromChain.chainId,
      amount,
      toChain.chainId,
      true,
    );

    let bridgeInfo = await register.getBridgeFeeInfoV3(
      caller,
      fromToken,
      fromChain.chainId,
      amount,
      toChain.chainId,
      false,
    );

    let swapFee = await register.getTransferFee(
      caller,
      relayToken,
      relayAmount,
      fromChain.chainId,
      toChain.chainId,
      true,
    );
    let bridgeFee = await register.getTransferFee(
      caller,
      relayToken,
      relayAmount,
      fromChain.chainId,
      toChain.chainId,
      false,
    );

    console.log(`token [${taskArgs.token}] [${fromChain.name}] => [${toChain.name}]`);
    console.log(
      `bridge: fromChain fee [${ethers.utils.formatUnits(
        bridgeInfo[0],
        fromTokenInfo[1],
      )}], to amount [${ethers.utils.formatUnits(
        bridgeInfo[1],
        toTokenInfo[1],
      )}], vault [${ethers.utils.formatUnits(bridgeInfo[2], toTokenInfo[1])}]`,
    );
    console.log(
      `  swap: fromChain fee [${ethers.utils.formatUnits(
        swapInfo[0],
        fromTokenInfo[1],
      )}], to amount [${ethers.utils.formatUnits(
        swapInfo[1],
        toTokenInfo[1],
      )}], vault [${ethers.utils.formatUnits(swapInfo[2], toTokenInfo[1])}]`,
    );

    console.log(
      `bridge: receive [${ethers.utils.formatUnits(
        relayAmount.sub(bridgeFee[0]),
        18,
      )}], base fee [${ethers.utils.formatUnits(bridgeFee[1], 18)}], bridge fee [${ethers.utils.formatUnits(
        bridgeFee[2],
        18,
      )}]`,
    );
    console.log(
      `  swap: receive [${ethers.utils.formatUnits(
        relayAmount.sub(swapFee[0]),
        18,
      )}], base fee [${ethers.utils.formatUnits(swapFee[1], 18)}], bridge fee [${ethers.utils.formatUnits(
        swapFee[2],
        18,
      )}]`,
    );
  });

task("register:list", "List token infos")
  .addOptionalParam("token", "The token name", "wtoken", types.string)
  .addParam("v2", "bridge version: v2/v3, true is v2", false, types.boolean)
  .setAction(async (taskArgs, hre) => {
    outputAddr = false;

    let register = await getRegister(hre.network.name, taskArgs.v2);
    console.log("Token register: ", register.address);
    console.log("base receiver: ", await register.getBaseFeeReceiver());

    console.log(`\ntoken: ${taskArgs.token}`);
    let chainId = hre.network.config.chainId;
    let tokenAddr = await getToken(chainId, taskArgs.token);
    console.log(`token address: ${tokenAddr}`);

    let tokenInfo = await register.getTargetToken(chainId, chainId, tokenAddr);
    console.log(`token deciamals: ${tokenInfo[1]}`);
    console.log(`token mintable: ${tokenInfo[2]}`);

    let token = await register.tokenList(tokenAddr);
    console.log(`vault address: ${token.vaultToken}`);

    let vault = await ethers.getContractAt("VaultTokenV3", token.vaultToken);
    let totalVault = await vault.totalVault();
    console.log(`total token:\t ${totalVault}`);
    let totalSupply = await vault.totalSupply();
    console.log(`total vault supply: ${totalSupply}`);

    let chainList = await getChainList(hre.network.name);
    console.log(`chains:`);
    for (let i = 0; i < chainList.length; i++) {
      let tokenInfo = await register.getTargetToken(chainId, chainList[i].chainId, tokenAddr);
      let info = await register.getTargetFeeInfo(tokenAddr, chainList[i].chainId);

      console.log(`${chainList[i].name}(${chainList[i].chainId})\t => ${info[0]}`);

      console.log(`\t decimals(${tokenInfo[1]}) mintalbe (${tokenInfo[2]}) (${tokenInfo[0]})`);

      console.log(
        `\t base fee: bridge(${ethers.utils.formatUnits(info[1][1], "ether")}) swap(${ethers.utils.formatUnits(
          info[1][0],
          "ether",
        )})`,
      );
      console.log(
        `\t in fee: min(${ethers.utils.formatUnits(info[2][0], "ether")}), max(${ethers.utils.formatUnits(
          info[2][1],
          "ether",
        )}), rate(${info[2][2]})`,
      );

      console.log(
        `\t out fee: min(${ethers.utils.formatUnits(info[3][0], "ether")}), max(${ethers.utils.formatUnits(
          info[3][1],
          "ether",
        )}), rate(${info[3][2]})`,
      );
    }
  });
