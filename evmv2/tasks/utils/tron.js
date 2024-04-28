let { readFromFile, writeToFile, getToken } = require("../../utils/helper.js");
const TronWeb = require("tronweb");
const { getFeeList, getChain, getChainList } = require("../../utils/helper");
const net = require("net");
require("dotenv").config();

const sleep = (delay) => new Promise((resolve) => setTimeout(resolve, delay));

async function getTronMos(tronWeb, artifacts, network) {
    let deploy = await readFromFile(network);
    if (!deploy[network]["mosProxy"]) {
        throw "mos proxy not deployed ...";
    }
    let Mos = await artifacts.readArtifact("MAPOmnichainServiceTron");
    let mos = await tronWeb.contract(Mos.abi, deploy[network]["mosProxy"]);

    return mos;
}

exports.tronMosDeploy = async function (artifacts, network, wtoken, lightnode) {
    let tronWeb = await getTronWeb(network);
    console.log("deployer :", tronWeb.defaultAddress);

    let wtokenHex = tronWeb.address.toHex(wtoken).replace(/^(41)/, "0x");
    let lightnodeHex = tronWeb.address.toHex(lightnode).replace(/^(41)/, "0x");
    let deployer = tronWeb.defaultAddress.hex.replace(/^(41)/, "0x");

    console.log(`deployer : ${deployer}`);
    console.log(`wToken : ${wtoken} (${wtokenHex})`);
    console.log(`lightnode : ${lightnode} (${lightnodeHex})`);

    let impl = await deploy_contract(artifacts, "MAPOmnichainServiceV2", [], tronWeb);

    let interface = new ethers.utils.Interface([
        "function initialize(address _wToken, address _lightNode, address _owner) external",
    ]);

    let data = interface.encodeFunctionData("initialize", [wtokenHex, lightnodeHex, deployer]);
    let mos_addr = await deploy_contract(artifacts, "MAPOmnichainServiceProxyV2", [impl, data], tronWeb);

    let deployment = await readFromFile(network);
    deployment[network]["mosProxy"] = tronWeb.address.fromHex(mos_addr);
    await writeToFile(deployment);

    /*
    //RootChainManager   rootToken  Predicate
    let config = getConfig(network);
    let Mos = await artifacts.readArtifact("MAPOmnichainServiceTron");
    let mos = await tronWeb.contract(Mos.abi, tronWeb.address.fromHex(mos_addr));

    let rootManager = tronWeb.address.toHex(config[0]).replace(/^(41)/, "0x");
    let rootToken = tronWeb.address.toHex(config[1]).replace(/^(41)/, "0x");

    await mos.setRootChainManager(rootManager).send();
    await mos.setRootToken(rootToken).send();
    // await mos.giveAllowance(config[1],config[2],"100000000000000").send()

    console.log("roo token", await mos.rootToken().call());

    console.log("rootChainManager", await mos.rootChainManager().call());
    */
};

exports.tronMosUpgrade = async function (artifacts, network, impl) {
    let tronWeb = await getTronWeb(network);
    console.log("deployer :", tronWeb.defaultAddress);

    let mos = await getTronMos(tronWeb, artifacts, network);
    console.log("mos address", mos.address);

    let implAddr = tronWeb.address.toHex(impl).replace(/^(41)/, "0x");
    if (implAddr === ethers.constants.AddressZero) {
        implAddr = await deploy_contract(artifacts, "MAPOmnichainServiceV2", [], tronWeb);
    }
    console.log("old impl", await mos.getImplementation().call());
    await mos.upgradeTo(implAddr).send();
    console.log("new impl", await mos.getImplementation().call());
};

exports.tronSetup = async function (artifacts, network, addr) {
    let tronWeb = await getTronWeb(network);
    console.log("deployer :", tronWeb.defaultAddress);

    let mos = await getTronMos(tronWeb, artifacts, network);
    console.log("mos address", mos.address);

    let addrHex = tronWeb.address.toHex(addr).replace(/^(41)/, "0x");

    await mos.setLightClient(addrHex).send();
    console.log(`mos set  light client ${addr} ( ${addrHex} ) successfully `);
};

exports.tronSetRelay = async function (artifacts, network, addr, chain) {
    let tronWeb = await getTronWeb(network);
    console.log("deployer :", tronWeb.defaultAddress);

    let mos = await getTronMos(tronWeb, artifacts, network);
    console.log("mos address", mos.address);

    if (addr.substr(0, 2) != "0x") {
        addr = "0x" + stringToHex(addr);
    }

    await mos.setRelayContract(chain, addr).send();

    console.log(`mos set  relay ${addr} with chain id ${chain} successfully `);
};

exports.tronRegisterToken = async function (artifacts, network, token, chains, enable) {
    let tronWeb = await getTronWeb(network);
    console.log("deployer :", tronWeb.defaultAddress);

    let mos = await getTronMos(tronWeb, artifacts, network);
    console.log("mos address", mos.address);

    let ids = chains.split(",");
    for (let i = 0; i < ids.length; i++) {
        await mos.registerToken(token, ids[i], enable).send();
        console.log(`mos register token ${token} to chain ${ids[i]} success`);
    }
    console.log("mos registerToken success");
};

exports.tronUpdateChain = async function (artifacts, network, token, addList, removeList) {
    let tronWeb = await getTronWeb(network);
    console.log("deployer :", tronWeb.defaultAddress);

    let mos = await getTronMos(tronWeb, artifacts, network);
    console.log("mos address", mos.address);

    for (let i = 0; i < removeList.length; i++) {
        let bridgeable = await mos.isBridgeable(token, removeList[i]).call();
        sleep(500);
        if (bridgeable) {
            await mos.registerToken(token, removeList[i], false).send();
            console.log(`mos register token ${token} to chain ${removeList[i]} success`);
        }
        sleep(500);
    }
    for (let i = 0; i < addList.length; i++) {
        let bridgeable = await mos.isBridgeable(token, addList[i]).call();
        sleep(500);
        if (!bridgeable) {
            await mos.registerToken(token, addList[i], true).send();
            console.log(`mos register token ${token} to chain ${addList[i]} success`);
        }
        sleep(500);
    }

    console.log(`mos update update token ${token} bridge success`);
};

exports.tronSetMintableToken = async function (artifacts, network, token, mintable) {
    let tronWeb = await getTronWeb(network);
    console.log("deployer :", tronWeb.defaultAddress);

    let mos = await getTronMos(tronWeb, artifacts, network);
    console.log("mos address", mos.address);

    let tokens = token.split(",");
    if (mintable) {
        await mos.addMintableToken(tokens).send();
        console.log(`mos set token ${token} mintable ${mintable} success`);
    } else {
        await mos.removeMintableToken(tokens).send();
        console.log(`mos set token ${token} mintable ${mintable}  success`);
    }
};

exports.tronTokenTransferOut = async function (artifacts, network, tokenAddr, chain, receiver, amount) {
    let tronWeb = await getTronWeb(network);
    console.log("deployer :", tronWeb.defaultAddress);

    let mos = await getTronMos(tronWeb, artifacts, network);
    console.log("mos address", mos.address);

    let fromAddr = tronWeb.defaultAddress.hex.replace(/^(41)/, "0x");

    let Token = await artifacts.readArtifact("MintableToken");
    let token = await tronWeb.contract(Token.abi, tokenAddr);

    let decimals = await token.decimals().call();
    let value = ethers.utils.parseUnits(amount, decimals);

    console.log(`${tokenAddr} approve ${mos.address} value ${value} ...`);
    let tx = await token.approve(mos.address, value).send();
    console.log("approve tx", tx);
    let result = await tronWeb.trx.getTransaction(tx);

    let swapTx = await mos.swapOutToken(fromAddr, tokenAddr, receiver, value, chain, "0x").send();
    console.log("transfer out tx", swapTx);
    let swapRst = await tronWeb.trx.getTransaction(swapTx);
    console.log(swapRst);

    console.log(`${tokenAddr} transfer out to chain ${chain} value ${value}.`);
};

exports.tronDeployRootToken = async function (artifacts, network, name, symbol, decimals) {
    console.log("network: ", network);
    console.log("name: ", name);
    console.log("symbol: ", symbol);
    console.log("decimal: ", decimals);
    let tronWeb = await getTronWeb(network);
    let deployer = tronWeb.defaultAddress.hex;
    console.log("deployer :", tronWeb.address.fromHex(deployer));
    let deploy = await readFromFile(network);
    let rootToken = await deploy_contract(artifacts, "RootERC20", [name, symbol, decimals], tronWeb);

    let rootTokenAddr = tronWeb.address.fromHex(rootToken);
    deploy[network]["rootToken"] = rootTokenAddr;
    await writeToFile(deploy);
};

const chainlist = [
    1,
    5,
    56,
    97, // bsc
    137,
    80001, // matic
    212,
    22776, // mapo
    1001,
    8217, // klaytn
    "1360100178526209",
    "1360100178526210", // near
];
exports.tronList = async function (artifacts, network, mos_addr, token) {
    let tronWeb = await getTronWeb(network);
    let deployer = tronWeb.defaultAddress.hex.substring(2);
    console.log("deployer :", tronWeb.address.fromHex(deployer));
    if (mos_addr === "mos") {
        let deploy = await readFromFile(network);
        if (!deploy[network]["mosProxy"]) {
            throw "mos proxy not deployed ...";
        }
        mos_addr = deploy[network]["mosProxy"];
    }

    let Mos = await artifacts.readArtifact("MAPOmnichainServiceV2");
    let mos = await tronWeb.contract(Mos.abi, mos_addr);
    console.log("mos address", mos_addr);
    let wtoken = await mos.wToken().call();
    let selfChainId = await mos.selfChainId().call();
    let relayContract = await mos.relayContract().call();
    let relayChainId = await mos.relayChainId().call();
    let lightNode = await mos.lightNode().call();

    console.log("selfChainId:\t", selfChainId.toString());
    console.log("wToken address:\t", wtoken);
    console.log("light node:\t", lightNode);
    console.log("relay chain:\t", relayChainId.toString());
    console.log("relay contract:\t", relayContract);

    address = token;
    if (address == "wtoken") {
        address = wtoken;
    }
    console.log("\ntoken address:", address);
    let mintable = await mos.isMintable(address).call();
    console.log(`token mintalbe:\t ${mintable}`);

    console.log("register chains:");
    for (let i = 0; i < chainlist.length; i++) {
        let bridgeable = await mos.isBridgeable(address, chainlist[i]).call();
        if (bridgeable) {
            console.log(`${chainlist[i]}`);
        }
    }
};

exports.getTronAddress = async function (address) {
    let tronWeb = await getTronWeb("Tron");
    let addr = tronWeb.address.fromHex(address);
    let addrHex = tronWeb.address.toHex(addr).replace(/^(41)/, "0x");
    return [addr, addrHex];
};

exports.getTron = async function (network) {
    if (network === "Tron" || network === "TronTest") {
        if (network === "Tron") {
            return new TronWeb(
                "https://api.trongrid.io/",
                "https://api.trongrid.io/",
                "https://api.trongrid.io/",
                process.env.TRON_PRIVATE_KEY
            );
        } else {
            return new TronWeb(
                "https://api.nileex.io/",
                "https://api.nileex.io/",
                "https://api.nileex.io/",
                process.env.TRON_PRIVATE_KEY
            );
        }
    } else {
        throw ("unsupported network", network);
    }
};

async function deploy_contract(artifacts, name, args, tronWeb) {
    let c = await artifacts.readArtifact(name);
    let contract_instance = await tronWeb.contract().new({
        abi: c.abi,
        bytecode: c.bytecode,
        feeLimit: 15000000000,
        callValue: 0,
        parameters: args,
    });

    let contract_address = tronWeb.address.fromHex(contract_instance.address);

    console.log(`${name} deployed on: ${contract_address} (${contract_instance.address})`);

    //return contract_address;
    return "0x" + contract_instance.address.substring(2);
}

async function getTronWeb(network) {
    if (network === "Tron" || network === "TronTest") {
        if (network === "Tron") {
            return new TronWeb(
                "https://api.trongrid.io/",
                "https://api.trongrid.io/",
                "https://api.trongrid.io/",
                process.env.TRON_PRIVATE_KEY
            );
        } else {
            return new TronWeb(
                "https://api.nileex.io/",
                "https://api.nileex.io/",
                "https://api.nileex.io/",
                process.env.TRON_PRIVATE_KEY
            );
        }
    } else {
        throw "unsupport network";
    }
}

function getConfig(network) {
    if (network === "Tron") {
        return [
            "0x84DC96FB5AE46F55FAEE6432FAAB3050BAF5EF9E",
            "TYNaAmYK7TLjRFiftTb9tHtjqHaRLCUmNR",
            "0xC5D2E7D264D7722870BAF34D5375838473655F71",
        ];
    } else {
        //RootChainManager   rootToken  Predicate
        return [
            "0xD1E3BF32FB1BD308673C93B11D0BE266B3D993F0",
            "0xEA51342DABBB928AE1E576BD39EFF8AAF070A8C6",
            "0x97D515B421330C57C545D8DBE946BA7CAD02DBB1",
        ];
    }
}
