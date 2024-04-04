let { getMos, create, readFromFile, writeToFile, getToken } = require("../../utils/helper.js");
const TronWeb = require("tronweb");
require("dotenv").config();

exports.tronMosDeploy = async function (artifacts, network, wtoken, lightnode) {
    let tronWeb = await getTronWeb(network);
    console.log("deployer :", tronWeb.defaultAddress);

    let wtokenHex = tronWeb.address.toHex(wtoken).replace(/^(41)/, "0x");
    let lightnodeHex = tronWeb.address.toHex(lightnode).replace(/^(41)/, "0x");
    let deployer = tronWeb.defaultAddress.hex.replace(/^(41)/, "0x");

    console.log(`deployer : ${deployer}`);
    console.log(`wToken : ${wtoken} (${wtokenHex})`);
    console.log(`lightnode : ${lightnode} (${lightnodeHex})`);

    let impl = await deploy_contract(artifacts, "MAPOmnichainServiceTron", [], tronWeb);

    let interface = new ethers.utils.Interface([
        "function initialize(address _wToken, address _lightNode,address _owner) external",
    ]);

    let data = interface.encodeFunctionData("initialize", [wtokenHex, lightnodeHex, deployer]);
    let mos_addr = await deploy_contract(artifacts, "MAPOmnichainServiceProxyV2", [impl, data], tronWeb);

    let deployment = await readFromFile(network);
    deployment[network]["mosProxy"] = tronWeb.address.fromHex(mos_addr);
    await writeToFile(deployment);

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
};

exports.tronMosUpgrade = async function (artifacts, network, impl) {
    let tronWeb = await getTronWeb(network);
    console.log("deployer :", tronWeb.defaultAddress);

    let implAddr = tronWeb.address.toHex(impl).replace(/^(41)/, "0x");

    let deploy = await readFromFile(network);
    if (!deploy[network]["mosProxy"]) {
        throw "mos proxy not deployed ...";
    }
    console.log("mos proxy :", deploy[network]["mosProxy"]);
    let Mos = await artifacts.readArtifact("MAPOmnichainServiceTron");
    let mos = await tronWeb.contract(Mos.abi, deploy[network]["mosProxy"]);
    if (implAddr === ethers.constants.AddressZero) {
        implAddr = await deploy_contract(artifacts, "MAPOmnichainServiceTron", [], tronWeb);
    }
    console.log("old impl", await mos.getImplementation().call());
    await mos.upgradeTo(implAddr).send();
    console.log("new impl", await mos.getImplementation().call());
};

exports.tronSetup = async function (artifacts, network, addr) {
    let tronWeb = await getTronWeb(network);
    console.log("deployer :", tronWeb.defaultAddress);

    let deployer = tronWeb.defaultAddress.base58;

    let deploy = await readFromFile(network);
    if (!deploy[network]["mosProxy"]) {
        throw "mos proxy not deployed ...";
    }
    let Mos = await artifacts.readArtifact("MAPOmnichainServiceTron");
    let mos = await tronWeb.contract(Mos.abi, deploy[network]["mosProxy"]);
    console.log("mos address", deploy[network]["mosProxy"]);

    let addrHex = tronWeb.address.toHex(addr).replace(/^(41)/, "0x");

    await mos.setLightClient(addrHex).send();
    console.log(`mos set  light client ${addr} ( ${addrHex} ) successfully `);
};

exports.tronSetRelay = async function (artifacts, network, addr, chain) {
    let tronWeb = await getTronWeb(network);
    console.log("deployer :", tronWeb.defaultAddress);

    let deploy = await readFromFile(network);

    if (!deploy[network]["mosProxy"]) {
        throw "mos proxy not deployed ...";
    }

    console.log(`mos ${deploy[network]["mosProxy"]},  ${tronWeb.address.toHex(deploy[network]["mosProxy"])}`);

    return;

    let Mos = await artifacts.readArtifact("MAPOmnichainServiceTron");
    let mos = await tronWeb.contract(Mos.abi, deploy[network]["mosProxy"]);
    console.log("mos address", deploy[network]["mosProxy"]);
    if (addr.substr(0, 2) != "0x") {
        addr = "0x" + stringToHex(addr);
    }

    await mos.setRelayContract(chain, addr).send();

    console.log(`mos set  relay ${addr} with chain id ${chain} successfully `);
};

exports.tronRegisterToken = async function (artifacts, network, token, chains, enable) {
    let tronWeb = await getTronWeb(network);
    let deployer = tronWeb.defaultAddress.hex.substring(2);
    console.log("deployer :", tronWeb.address.fromHex(deployer));
    let deploy = await readFromFile(network);
    if (!deploy[network]["mosProxy"]) {
        throw "mos proxy not deployed ...";
    }
    let Mos = await artifacts.readArtifact("MAPOmnichainServiceTron");
    let mos = await tronWeb.contract(Mos.abi, deploy[network]["mosProxy"]);
    console.log("mos address", deploy[network]["mosProxy"]);
    let ids = chains.split(",");

    for (let i = 0; i < ids.length; i++) {
        await mos.registerToken(token, ids[i], enable).send();
        console.log(`mos register token ${token} to chain ${ids[i]} success`);
    }
    console.log("mos registerToken success");
};

exports.tronSetMintableToken = async function (artifacts, network, token, mintable) {
    let tronWeb = await getTronWeb(network);
    let deployer = tronWeb.defaultAddress.hex.substring(2);
    console.log("deployer :", tronWeb.address.fromHex(deployer));
    let deploy = await readFromFile(network);
    if (!deploy[network]["mosProxy"]) {
        throw "mos proxy not deployed ...";
    }
    let Mos = await artifacts.readArtifact("MAPOmnichainServiceTron");
    let mos = await tronWeb.contract(Mos.abi, deploy[network]["mosProxy"]);
    console.log("mos address", deploy[network]["mosProxy"]);
    let tokens = token.split(",");
    if (mintable) {
        await mos.addMintableToken(tokens).send();
        console.log(`mos set token ${token} mintable ${mintable} success`);
    } else {
        await mos.removeMintableToken(tokens).send();
        console.log(`mos set token ${token} mintable ${mintable}  success`);
    }
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

    let Mos = await artifacts.readArtifact("MAPOmnichainServiceTron");
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
