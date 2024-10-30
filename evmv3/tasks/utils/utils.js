let fs = require("fs");
let path = require("path");

const { isTron, getTronContract, isTestnet, toEvmAddress, fromEvmAddress } = require("../../utils/helper");

async function getChainList(network) {
  let p;
  if (isTestnet(network)) {
    p = path.join(__dirname, "../../constants/testnet/chains.json");
  } else {
    p = path.join(__dirname, "../../constants/chains.json");
  }
  let chains;
  if (!fs.existsSync(p)) {
    throw "no chains ..";
  } else {
    let rawdata = fs.readFileSync(p);
    chains = JSON.parse(rawdata);
  }

  return chains;
}

async function getChain(network) {
  let chains = await getChainList(network);

  for (let i = 0; i < chains.length; i++) {
    if (chains[i].name === network || chains[i].chainId == network) {
      return chains[i];
    }
  }

  throw "can't find the chain";
}

async function getTokenList(network) {
  let p;
  if (isTestnet(network)) {
    p = path.join(__dirname, "../../constants/testnet/tokens.json");
  } else {
    p = path.join(__dirname, "../../constants/tokens.json");
  }

  let tokens;
  if (!fs.existsSync(p)) {
    throw "not tokens ..";
  } else {
    let rawdata = fs.readFileSync(p);
    tokens = JSON.parse(rawdata);
    if (!tokens[network]) {
      throw "no tokens ..";
    }
  }

  return tokens[network];
}

async function getToken(network, token) {
  if (token === "native") {
    return ethers.constants.AddressZero;
  }
  let chain = await getChain(network, network);
  let chainId = chain.chainId;

  if (chainId === 1360100178526209 || chainId === 1360100178526210) {
    // near
    if (token.length >= 4 && token.length <= 64) {
      return token;
    }
  } else if (chainId === 728126428 || chainId === 728126429) {
    // tron
    if (token.length === 34) {
      return token;
    }
  } else {
    if (token.substr(0, 2) === "0x") {
      return token;
    }
  }
  let tokens = await getTokenList(chain.name);
  if (tokens[token]) {
    return tokens[token];
  }

  throw "token not support ..";
}

async function getFeeList(chain) {
  let p;
  if (isTestnet(chain)) {
    p = path.join(__dirname, "../../constants/testnet/fee.json");
  } else {
    p = path.join(__dirname, "../../constants/fee.json");
  }
  if (!fs.existsSync(p)) {
    throw "no fee file ..";
  }
  let rawdata = fs.readFileSync(p);
  let tokenFees = JSON.parse(rawdata);
  if (!tokenFees[chain]) {
    throw `no fee at chain ${chain} ..`;
  }

  return tokenFees[chain];
}

async function getFeeInfo(chain, token) {
  let feeList = await getFeeList(chain);

  if (!feeList[token]) {
    throw "not token fee ..";
  }

  return feeList[token];
}

async function getFeeConfig(subject) {
  let configFile = "../../constants/" + subject + ".json";
  let p = path.join(__dirname, configFile);
  console.log("fee path", p);
  let configs = {};
  if (fs.existsSync(p)) {
    let rawdata = fs.readFileSync(p);
    configs = JSON.parse(rawdata);
  }
  return configs;
}

async function getMessageFeeList(network) {
  let p;
  if (isTestnet(network)) {
    p = path.join(__dirname, "../../constants/testnet/messageFee.json");
  } else {
    p = path.join(__dirname, "../../constants/messageFee.json");
  }

  let feeList;
  if (!fs.existsSync(p)) {
    throw "no fee ..";
  } else {
    let rawdata = fs.readFileSync(p);
    feeList = JSON.parse(rawdata);
    if (!feeList) {
      throw "not fee ..";
    }
  }

  return feeList;
}

async function getMessageFee(network) {
  let feeList = await getMessageFeeList(network);
  if (!feeList[network]) {
    throw "no chain fee...";
  }
  return feeList[network];
}

async function getMessageConfigList(network) {
  let p;
  if (isTestnet(network)) {
    p = path.join(__dirname, "../../constants/testnet/messageConfig.json");
  } else {
    p = path.join(__dirname, "../../constants/messageConfig.json");
  }

  let configList;
  if (!fs.existsSync(p)) {
    throw `no fee config ..`;
  } else {
    let rawdata = fs.readFileSync(p);
    configList = JSON.parse(rawdata);
    if (!configList) {
      throw "not fee ..";
    }
  }
  return configList;
}

async function getMessageConfig(network) {
  let configList = await getMessageConfigList(network);
  if (!configList[network]) {
    throw `no chain ${network} fee config...`;
  }

  return configList[network];
}

async function readFromFile(network) {
  let p = path.join(__dirname, "../../deployments/deploy.json");
  let deploy;
  if (!fs.existsSync(p)) {
    deploy = {};
    deploy[network] = {};
  } else {
    let rawdata = fs.readFileSync(p);
    deploy = JSON.parse(rawdata);
    if (!deploy[network]) {
      deploy[network] = {};
    }
  }

  return deploy;
}

async function getDeployment(network, contract) {
  let deployment = await readFromFile(network);
  let deployAddress = deployment[network][contract];
  if (!deployAddress) throw `no ${contract} deployment in ${network}`;

  return deployAddress;
}

async function writeToFile(deploy) {
  let p = path.join(__dirname, "../../deployments/deploy.json");
  await folder("../../deployments/");
  fs.writeFileSync(p, JSON.stringify(deploy, null, "\t"));
}

async function saveDeployment(network, contract, addr) {
  let deployment = await readFromFile(network);
  deployment[network][contract] = addr;

  let p = path.join(__dirname, "../../deployments/deploy.json");
  await folder("../../deployments/");
  fs.writeFileSync(p, JSON.stringify(deployment, null, "\t"));
}

async function saveMessageFee(network, feeList) {
  let p;
  if (isTestnet(network)) {
    p = path.join(__dirname, "../../constants/testnet/messageFee.json");
    await folder("../../constants/testnet/");
  } else {
    p = path.join(__dirname, "../../constants/messageFee.json");
    await folder("../../constants/");
  }

  fs.writeFileSync(p, JSON.stringify(feeList, null, "\t"));
}

const folder = async (reaPath) => {
  const absPath = path.resolve(__dirname, reaPath);
  try {
    await fs.promises.stat(absPath);
  } catch (e) {
    // {recursive: true}
    await fs.promises.mkdir(absPath, { recursive: true });
  }
};

module.exports = {
  getChain,
  getToken,
  getChainList,
  getTokenList,
  getFeeList,
  getFeeConfig,
  getFeeInfo,
  getMessageFee,
  getMessageFeeList,
  getMessageConfigList,
  getMessageConfig,
  saveMessageFee,
  readFromFile,
  writeToFile,
  getDeployment,
  saveDeployment,
};
