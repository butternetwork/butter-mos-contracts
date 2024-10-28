let fs = require("fs");
let path = require("path");

const { isTron, getTronContract, isTestnet, toEvmAddress,fromEvmAddress } = require("../../utils/helper");
let { readFromFile } = require("../../utils/create.js");
const net = require("node:net");

async function getFeeService(hre, contractAddress) {
    let addr = contractAddress;
    let feeService;
    if (addr === "" || addr === "latest") {
        let deployment = await readFromFile(hre.network.name);
        let feeServiceAddress = deployment[hre.network.name]["feeService"];
        if(!feeServiceAddress) throw "fee service not deploy";
        if (isTron(hre.network.config.chainId)) {
            let feeServiceAddr = await mos.feeService().call();
            feeServiceAddress = await toEvmAddress(feeServiceAddr,hre.network.name)
            feeServiceAddress = await fromEvmAddress(feeServiceAddr,hre.network.name)
            feeService = await getTronContract("FeeService", hre.artifacts, hre.network.name, feeServiceAddress);
        } else {
            feeService = await ethers.getContractAt("FeeService", feeServiceAddress);
        }
    }
    console.log("feeService address:", feeService.address);
    return feeService;
}

async function getToken(network, token) {
    if (token === "native") {
        return ethers.constants.AddressZero;
    }
    let chain = await getChain(network, network);
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

    throw "token not support ..";
}

async function saveFeeList(network, feeList) {
    let p;
    if (isTestnet(network)) {
        p = path.join(__dirname, "../../constants/testnet/feeService.json");
        await folder("../../constants/testnet/");
    } else {
        p = path.join(__dirname, "../../constants/feeService.json");
        await folder("../../constants/");
    }

    fs.writeFileSync(p, JSON.stringify(feeList, null, "\t"));
}

async function getFeeList(network) {
    let p;
    if (isTestnet(network)) {
        p = path.join(__dirname, "../../constants/testnet/feeService.json");
    } else {
        p = path.join(__dirname, "../../constants/feeService.json");
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

async function getFee(network) {
    let feeList = await getFeeList(network);
    if (!feeList[network]) {
        throw "no chain fee...";
    }
    return feeList[network];
}

async function getFeeConfig(network) {
    let p;
    if (isTestnet(network)) {
        p = path.join(__dirname, "../../constants/testnet/feeServiceConfig.json");
    } else {
        p = path.join(__dirname, "../../constants/feeServiceConfig.json");
    }

    let configList;
    if (!fs.existsSync(p)) {
        throw "no fee config ..";
    } else {
        let rawdata = fs.readFileSync(p);
        configList = JSON.parse(rawdata);
        if (!configList) {
            throw "not fee ..";
        }
    }
    console.log(network)
    if (!configList[network]) {
        throw "no chain fee config...";
    }

    return configList[network];
}

async function getChain(network, chain) {
    let chains = await getChainList(network);
    for (let i = 0; i < chains.length; i++) {
        if (chains[i].name === chain || chains[i].chainId == chain) {
            return chains[i];
        }
    }

    throw "can't find the chain";
}

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
    getFeeService,
    getToken,
    getFee,
    getFeeList,
    saveFeeList,
    getFeeConfig,
    getChain,
    getChainList,
};
