let { create, getTronContract } = require("../../utils/create.js");
let { isTron, sleep } = require("../../utils/helper");
const { verify } = require("../../utils/verify");
const {
  getToken,
  getChain,
  getMessageConfig,
  getChainList,
  getMessageFee,
  getDeployment,
  saveDeployment,
  saveMessageFee,
} = require("../utils/utils");
const { tronToHex } = require("../../utils/create");

async function getFeeService(hre, contractAddress) {
  let addr = contractAddress;
  if (contractAddress === "" || contractAddress === "latest") {
    addr = await getDeployment(hre.network.name, "feeService");
  }

  let feeService;
  if (isTron(hre.network.config.chainId)) {
    feeService = await getTronContract("FeeService", hre.artifacts, hre.network.name, addr);
  } else {
    feeService = await ethers.getContractAt("FeeService", addr);
  }

  console.log("feeService address:", feeService.address);
  return feeService;
}

task("fee:deploy", "Deploy the fee service")
  .addOptionalParam("admin", "admin address", "0xACC31A6756B60304C03d6626fc98c062E4539CCA", types.string)
  .setAction(async (taskArgs, hre) => {
    const { deploy } = hre.deployments;
    const accounts = await ethers.getSigners();
    const deployer = accounts[0];

    console.log("deployer address:", deployer.address);

    let admin = taskArgs.admin;
    if (admin === "") {
      admin = deployer.address;
    }
    console.log("admin address:", admin);

    let FeeService = await ethers.getContractFactory("FeeService");
    let service_salt = process.env.FEE_SERVICE_SALT;
    let service_addr = await create(hre, deployer, "FeeService", ["address"], [admin], service_salt);

    if (isTron(hre.network.name)) {
      let service = await getTronContract("FeeService", hre.artifacts, hre.network.name, service_addr);
      console.log("owner:", await service.authority().call());
    } else {
      let service = FeeService.attach(service_addr);
      console.log("owner:", await service.authority());
    }

    await saveDeployment(hre.network.name, "feeService", service_addr);

    await verify(service_addr, [admin], "contracts/FeeService.sol:FeeService", hre.network.config.chainId, true);
  });

task("fee:setBaseGas", "set Base Gas")
  .addParam("chain", "chain Id")
  .addParam("gas", "base gas Limit")
  .addOptionalParam("service", "the fee service address", "", types.string)
  .setAction(async (taskArgs, hre) => {
    let feeService = await getFeeService(hre, taskArgs.service);

    if (isTron(hre.network.name)) {
      await (await feeService.setBaseGas(taskArgs.chain, taskArgs.gas).sned()).wait();
    } else {
      await (await feeService.setBaseGas(taskArgs.chain, taskArgs.gas)).wait();
    }
  });

task("fee:setChainGasPrice", "set chainGas price")
  .addParam("chain", "chain Id")
  .addParam("token", "token address")
  .addParam("price", "chain gas price")
  .addOptionalParam("service", "the fee service address", "", types.string)
  .setAction(async (taskArgs, hre) => {
    let feeService = await getFeeService(hre, taskArgs.service);

    if (isTron(hre.network.name)) {
      await (await feeService.setChainGasPrice(taskArgs.chain, taskArgs.token, taskArgs.price).send()).wait();
    } else {
      await (await feeService.setChainGasPrice(taskArgs.chain, taskArgs.token, taskArgs.price)).wait();
    }
  });

task("fee:setTokenDecimals", "set Token Decimals")
  .addParam("token", "token address")
  .addParam("decimal", "token decimal")
  .addOptionalParam("service", "the fee service address", "", types.string)
  .setAction(async (taskArgs, hre) => {
    let feeService = await getFeeService(hre, taskArgs.service);

    if (isTron(hre.network.name)) {
      await feeService.setTokenDecimals(taskArgs.token, taskArgs.decimal).send();
    } else {
      await (await feeService.setTokenDecimals(taskArgs.token, taskArgs.decimal)).wait();
    }
  });

task("fee:setReceiver", "Set message fee service address ")
  .addOptionalParam("receiver", "fee receiver address", "latest", types.string)
  .addOptionalParam("service", "the fee service address", "", types.string)
  .setAction(async (taskArgs, hre) => {
    const accounts = await ethers.getSigners();
    const deployer = accounts[0];

    let feeService = await getFeeService(hre, taskArgs.service);

    let receiver = taskArgs.receiver;
    if (taskArgs.receiver === "latest") {
      let feeConfig = await getMessageConfig(hre.network.name);
      receiver = feeConfig.feeReceiver;
    }

    if (isTron(hre.network.config.chainId)) {
      let onchainReceiver = await feeService.feeReceiver().call();
      onchainReceiver = await tronToHex(onchainReceiver, hre.network.name);
      receiver = await tronToHex(receiver, hre.network.name);
      if (onchainReceiver.toLowerCase() === receiver.toLowerCase()) {
        console.log(`fee receiver no update`);
        return;
      }
      await feeService.setFeeReceiver(receiver).send();
      console.log(
        `Update chain [${hre.network.name}] fee receiver [${onchainReceiver}] => ${await feeService.feeReceiver().call()}`,
      );
    } else {
      let onchainReceiver = await feeService.feeReceiver();
      if (onchainReceiver.toLowerCase() === receiver.toLowerCase()) {
        console.log(`fee receiver no update`);
        return;
      }
      await (await feeService.setFeeReceiver(receiver)).wait();
      console.log(
        `Update chain [${hre.network.name}] fee receiver [${onchainReceiver}] => [${await feeService.feeReceiver()}]`,
      );
    }
  });

task("fee:setMultiBaseGas", "set target chain base gas limit")
  .addParam("chain", "target chain id or name")
  .addParam("gas", "base gas limit")
  .addOptionalParam("token", "fee token address", "0x0000000000000000000000000000000000000000", types.string)
  .addOptionalParam("service", "the fee service address", "", types.string)
  .setAction(async (taskArgs, hre) => {
    const accounts = await ethers.getSigners();
    const deployer = accounts[0];
    // console.log("deployer address:", deployer.address);

    let feeService = await getFeeService(hre, taskArgs.service);

    let gasList = taskArgs.gas.split(",");
    let chains = taskArgs.chain.split(",");
    let chainList = [];
    for (let chainNetwork of chains) {
      let chain = await getChain(chainNetwork);
      chainList.push(chain);
    }

    let updateChainList = [];
    let updateGasList = [];
    if (isTron(hre.network.config.chainId)) {
      for (let i = 0; i < chainList.length; i++) {
        let chain = chainList[i];
        let baseGas = await feeService.baseGas(chain.chainId).call();
        if (baseGas.toString() === gasList[i]) {
          console.log(`target chain [${chain.name}] base gas limit no update`);
          continue;
        }
        updateChainList.push(chain.chainId);
        updateGasList.push(gasList[i]);
        console.log(`target chain [${chain.name}] base gas limt [${baseGas.toString()}] => [${gasList[i]}]`);

        await sleep(200);
      }
      if (updateChainList.length > 0) {
        await feeService.setMultiBaseGas(updateChainList, updateGasList).send();
        console.log(`Update chain [${updateChainList}] base gas limit]`);
      }
    } else {
      for (let i = 0; i < chainList.length; i++) {
        let chain = chainList[i];
        let baseGas = await feeService.baseGas(chain.chainId);
        if (baseGas.toString() === gasList[i]) {
          console.log(`chain [${chain.name}] base gas limit no update`);
          continue;
        }
        updateChainList.push(chain.chainId);
        updateGasList.push(gasList[i]);
        console.log(`chain [${chain.name}] base gas limt [${baseGas.toString()}] => [${gasList[i]}]`);
      }

      if (updateChainList.length > 0) {
        await feeService.setMultiBaseGas(updateChainList, updateGasList);
        console.log(`Update chain [${updateChainList}] base gas limit`);
      }
    }
  });

task("fee:setTargetPrice", "set chain message fee")
  .addParam("chain", "to chain id", "latest", types.string)
  .addParam("price", "to chain id", "latest", types.string)
  .addOptionalParam("token", "fee token", "0x0000000000000000000000000000000000000000", types.string)
  .addOptionalParam("service", "the fee service address", "", types.string)
  .addOptionalParam("decimals", "the fee service address", "18", types.string)
  .setAction(async (taskArgs, hre) => {
    const accounts = await ethers.getSigners();
    const deployer = accounts[0];
    //console.log("deployer address:", deployer.address);

    let feeService = await getFeeService(hre, taskArgs.service);

    let token = await getToken(hre.network.name, taskArgs.token);
    let priceList = taskArgs.price.split(",");
    let chains = taskArgs.chain.split(",");
    let chainList = [];
    for (let chainNetwork of chains) {
      let chain = await getChain(chainNetwork);
      chainList.push(chain);
    }

    let updateChainList = [];
    let updatePriceList = [];

    if (taskArgs.service !== "" && taskArgs.decimals !== "18") {
      let tokenDecimals;
      if (isTron(hre.network.config.chainId)) {
        tokenDecimals = await feeService.tokenDecimals(token).call();
        tokenDecimals = tokenDecimals.toString();
        if (tokenDecimals === taskArgs.decimals) {
          console.log(`FeeService ${token} decimal is ${taskArgs.decimals} no update`);
        } else {
          await feeService.setTokenDecimals(token, taskArgs.decimals).send();
          console.log(`FeeService ${token} decimal update is ${await feeService.tokenDecimals(token).call()}`);
        }
      } else {
        tokenDecimals = await feeService.tokenDecimals(token);
        tokenDecimals = tokenDecimals.toString();
        if (tokenDecimals === taskArgs.decimals) {
          console.log(`FeeService ${token} decimal is ${taskArgs.decimals} no update`);
        } else {
          await feeService.setTokenDecimals(token, taskArgs.decimals);
          console.log(`FeeService ${token} decimal update is ${await feeService.tokenDecimals(token)}`);
        }
      }
    }

    if (isTron(hre.network.config.chainId)) {
      for (let i = 0; i < chainList.length; i++) {
        let chain = chainList[i];
        let gasPrice = await feeService.chainGasPrice(chain.chainId, token).call();
        if (gasPrice.toString() === priceList[i]) {
          console.log(`chain [${chain.name}] token [${taskArgs.token}] gas price no update`);
          continue;
        }
        updateChainList.push(chain.chainId);
        updatePriceList.push(priceList[i]);
        console.log(`chain [${chain.name}] token [${taskArgs.token}] gas price [${gasPrice}] => [${priceList[i]}]`);

        await sleep(200);
      }
      if (updateChainList.length > 0) {
        await feeService.setMultiChainGasPrice(token, updateChainList, updatePriceList).send();
        console.log(`Update chain [${updateChainList}] token [${taskArgs.token}] gas price`);
      }
    } else {
      for (let i = 0; i < chainList.length; i++) {
        let chain = chainList[i];
        let gasPrice = await feeService.chainGasPrice(chain.chainId, token);
        if (gasPrice.toString() === priceList[i]) {
          console.log(`chain [${chain.name}] token [${taskArgs.token}] gas price no update`);
          continue;
        }
        updateChainList.push(chain.chainId);
        updatePriceList.push(priceList[i]);
        console.log(`chain [${chain.name}] token [${taskArgs.token}] gas price [${gasPrice}] => [${priceList[i]}]`);
      }
      if (updateChainList.length > 0) {
        console.log(updateChainList);
        console.log(updatePriceList);
        await feeService.setMultiChainGasPrice(token, updateChainList, updatePriceList, { gasLimit: 1000000 });
        console.log(`Update chain [${updateChainList}] token [${taskArgs.token}] gas price\n`);
      }
    }
  });

task("fee:update", "update chain message fee")
  .addOptionalParam("service", "the fee service address", "", types.string)
  .setAction(async (taskArgs, hre) => {
    const accounts = await ethers.getSigners();
    const deployer = accounts[0];
    console.log("deployer address:", deployer.address);

    console.log("===== fee receiver ========");
    let feeConfig = await getMessageConfig(hre.network.name);
    // set fee receiver
    await hre.run("fee:setReceiver", {
      receiver: feeConfig.feeRecevier,
      service: taskArgs.service,
    });

    await sleep(500);

    let addChainList = [];
    let addBaseList = [];

    let removeChainList = [];
    let removeBaseList = [];
    let chainList = await getChainList(hre.network.name);
    for (let i = 0; i < chainList.length; i++) {
      if (chainList[i].name === hre.network.name) {
        continue;
      }
      if (feeConfig.nontarget.includes(chainList[i].name)) {
        removeChainList.push(chainList[i].name);
        removeBaseList.push("0");
      } else {
        addChainList.push(chainList[i].name);
        let targetConfig = await getMessageConfig(chainList[i].name);
        addBaseList.push(targetConfig.baseGas.toString());
      }
    }
    // console.log("add list", addChainList);
    console.log("remove list", removeChainList);
    if (removeChainList.length > 0) {
      console.log("===== remove chain ========");
      await hre.run("fee:setMultiBaseGas", {
        chain: removeChainList.toString(),
        gas: removeBaseList.toString(),
        service: taskArgs.service,
      });
    }

    await sleep(500);

    console.log("===== base gas ========");
    await hre.run("fee:setMultiBaseGas", {
      chain: addChainList.toString(),
      gas: addBaseList.toString(),
      service: taskArgs.service,
    });

    await sleep(500);

    console.log("===== gas price ========");
    let fee = await getMessageFee(hre.network.name);
    for (let token in fee) {
      let priceList = [];
      for (let chain of addChainList) {
        let price = ethers.utils.parseUnits(fee[token][chain], 9);
        priceList.push(price.toString());
      }
      console.log("3");
      console.log(addChainList);
      console.log(priceList);
      await hre.run("fee:setTargetPrice", {
        chain: addChainList.toString(),
        price: priceList.toString(),
        token: token,
        service: taskArgs.service,
      });
    }
    console.log("Update fee success!\n");
  });

task("fee:updateFee", "List fee info")
  .addOptionalParam("fee", "The fee address", "", types.string)
  .addOptionalParam("save", "save fee", false, types.boolean)
  .setAction(async (taskArgs, hre) => {
    let feeList = {};
    let chainList = await getChainList(hre.network.name);
    for (let chain of chainList) {
      feeList[chain.name] = {};
      let feeConfig = await getMessageConfig(chain.name);

      let nativePriceList = {};
      let nativePrice = ethers.utils.parseUnits(feeConfig.nativePrice, 6);
      for (let targetChain of chainList) {
        if (chain.name === targetChain.name) {
          continue;
        }
        if (feeConfig.nontarget.includes(targetChain.name)) {
          continue;
        }
        let targetFeeConfig = await getMessageConfig(targetChain.name);
        let targetGasPrice = ethers.utils.parseUnits(targetFeeConfig.gasPrice, 9); // gwei
        let targetNativePrice = ethers.utils.parseUnits(targetFeeConfig.nativePrice, 6);
        let price = targetGasPrice.mul(targetNativePrice).div(nativePrice);
        let gPrice = ethers.utils.formatUnits(price, 9);
        nativePriceList[targetChain.name] = gPrice;

        //console.log(`${chain.name}: ${targetChain.name} native: ${nativePrice}, target: ${targetGasPrice}, ${targetNativePrice}, ${price}`)
      }
      feeList[chain.name]["native"] = nativePriceList;
    }

    if (taskArgs.save) {
      await saveMessageFee(hre.network.name, feeList);
    } else {
      console.log(feeList);
    }
  });

task("fee:list", "List fee info")
  .addOptionalParam("service", "the fee service address", "", types.string)
  .addOptionalParam("limit", "the gas limit", 1000000, types.int)
  .setAction(async (taskArgs, hre) => {
    let feeService = await getFeeService(hre, taskArgs.service);

    if (isTron(hre.network.name)) {
      console.log("owner:\t", await feeService.authority().call());
      console.log("feeService receiver:\t", await feeService.feeReceiver().call());
    } else {
      console.log("owner:\t", await feeService.authority());
      console.log("feeService receiver:\t", await feeService.feeReceiver());
    }

    console.log("fees:");
    let chains = await getChainList(hre.network.name);
    for (let i = 0; i < chains.length; i++) {
      let chainId = chains[i].chainId;
      let baseFee;
      if (isTron(hre.network.name)) {
        baseFee = await feeService.baseGas(chainId).call();
      } else {
        baseFee = await feeService.baseGas(chainId);
      }

      if (!baseFee.eq(0)) {
        let price, fee;
        if (isTron(hre.network.name)) {
          price = await feeService.chainGasPrice(chainId, ethers.constants.AddressZero).call();
          fee = await feeService.getServiceMessageFee(chainId, ethers.constants.AddressZero, taskArgs.limit).call();
        } else {
          price = await feeService.chainGasPrice(chainId, ethers.constants.AddressZero);
          fee = await feeService.getServiceMessageFee(chainId, ethers.constants.AddressZero, taskArgs.limit);
        }

        let decimals = isTron(hre.network.name) ? 6 : 18;
        let nativeFee = ethers.utils.formatUnits(fee[0], decimals);
        console.log(
          `${chains[i].name} (${chainId}) \t baseLimit [${baseFee}] gasPrice [${price}]\t fee [${nativeFee}] when limit [${taskArgs.limit}]`,
        );
      }

      await sleep(200);
    }
    console.log("");
  });
