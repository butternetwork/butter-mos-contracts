let fs = require("fs");
let path = require("path");

async function stringToHex(str) {
  return str
    .split("")
    .map(function (c) {
      return ("0" + c.charCodeAt(0).toString(16)).slice(-2);
    })
    .join("");
}

function getRole(role) {
  if (role.substr(0, 2) === "0x") {
    return role;
  }
  if (role === "admin") {
    return "0x0000000000000000000000000000000000000000000000000000000000000000";
  }
  let roleName = role;
  if (role === "manager") {
    roleName = "MANAGER_ROLE";
  } else if (role === "minter") {
    roleName = "MINTER_ROLE";
  }
  return ethers.utils.keccak256(ethers.utils.toUtf8Bytes(roleName));
}

async function getFeeList(chain) {
  let p;
  if (isTestnet(network)) {
    p = path.join(__dirname, "../constants/testnet/fee.json");
  } else {
    p = path.join(__dirname, "../constants/fee.json");
  }
  let tokenFees;
  if (!fs.existsSync(p)) {
    throw "not fee ..";
  }
  let rawdata = fs.readFileSync(p);
  tokenFees = JSON.parse(rawdata);
  if (!tokenFees[chain]) {
    throw "not fee ..";
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

async function getChain(network) {
  let chains = await getChainList(network);

  for (let i = 0; i < chains.length; i++) {
    if (chains[i].chain === network || chains[i].chainId == network) {
      return chains[i];
    }
  }

  throw "can't find the chain";
}

async function getChainList(network) {
  let p;
  if (isTestnet(network)) {
    p = path.join(__dirname, "../constants/testnet/chains.json");
  } else {
    p = path.join(__dirname, "../constants/chains.json");
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

async function getTokenList(network) {
  let p;
  if (isTestnet(network)) {
    p = path.join(__dirname, "../constants/testnet/tokens.json");
  } else {
    p = path.join(__dirname, "../constants/tokens.json");
  }

  let tokens;
  if (!fs.existsSync(p)) {
    throw "not tokens ..";
  } else {
    let rawdata = fs.readFileSync(p);
    tokens = JSON.parse(rawdata);
    if (!tokens[chainId]) {
      throw "no tokens ..";
    }
  }
  let tokenList = Object.keys(tokens[network]);

  return tokenList;
}

async function getToken(network, token) {
  let chain = await getChain(network);
  let chainId = chain.chainId;

  if (chainId === 1360100178526209 || chainId === 1360100178526210) {
    // near
    if (token.length > 4) {
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
  let tokens = await getTokenList(chain.chain);
  if (tokens[token]) {
    return tokens[token];
  }

  throw "token not support ..";
}


async function getFeeConfig(subject) {
  let configFile = "../constants/" + subject + ".json";
  let p = path.join(__dirname, configFile);
  console.log("fee path", p);
  let configs = {};
  if (fs.existsSync(p)) {
    let rawdata = fs.readFileSync(p);
    configs = JSON.parse(rawdata);
  }
  return configs;
}

function isRelayChain(network) {
  let networks = [22776, "Mapo", "Map", 212, "Makalu"];
  return networks.includes(network);
}

function isTron(network) {
  let networks = [728126428, "Tron", 3448148188, "TronTest"];
  return networks.includes(network);
}

function isTestnet(chainId) {
  let testnets = [
    212,
    "Makalu",
    11155111,
    "Sepolia",
    97,
    "BscTest",
    300,
    "zkSyncTest",
    421614,
    "ArbitrumSepolia",
    53457,
    "DodoTest",
    11155420,
    "OpSepolia",
    80002,
    "Amoy",
    3448148188,
    "TronTest",
  ];
  return testnets.includes(chainId);
}

module.exports = {
  getChain,
  getToken,
  getRole,
  getTokenList,
  getFeeInfo,
  getChainList,
  stringToHex,
  getFeeList,
  getFeeConfig,
};
