let fs = require("fs");
let path = require("path");

function stringToHex(str) {
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
    1360104473493506,
    "TonTest",
    1360108768460802,
    "SolanaDev",
  ];
  return testnets.includes(chainId);
}

async function getTronContract(contractName, artifacts, network, addr) {
  let tronWeb = await getTronWeb(network);
  console.log("operator address is:", tronWeb.defaultAddress);
  let C = await artifacts.readArtifact(contractName);
  let c = await tronWeb.contract(C.abi, addr);
  return c;
}

async function fromEvmAddress(hex, network) {
  let tronWeb = await getTronWeb(network);
  return tronWeb.address.fromHex(hex);
}

async function toEvmAddress(addr, network) {
  let tronWeb = await getTronWeb(network);
  return tronWeb.address.toHex(addr).replace(/^(41)/, "0x");
}

module.exports = {
  getRole,
  stringToHex,
  isRelayChain,
  isTron,
  isTestnet,
  getTronContract,
  fromEvmAddress,
  toEvmAddress,
};
