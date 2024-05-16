let { getMos, create, readFromFile, writeToFile, zksyncDeploy, getToken } = require("../../utils/helper.js");
let { verify } = require("./verify.js");

const sleep = (delay) => new Promise((resolve) => setTimeout(resolve, delay));

exports.mosDeploy = async function (deploy, chainId, deployer, wtoken, lightnode) {
    let implContract;
    if (chainId === 212 || chainId === 22776) {
        // Map or Makalu
        implContract = "MAPOmnichainServiceRelayV2";
    } else {
        implContract = "MAPOmnichainServiceV2";
    }

    let implAddr;
    if (hre.network.zksync === true){
        implAddr = await zksyncDeploy(implContract, [], hre);
    } else {
        await deploy(implContract, {
            from: deployer,
            args: [],
            log: true,
            contract: implContract,
        });
        let impl = await ethers.getContract(implContract);
        implAddr = impl.address;

        await verify(implAddr, [], "contracts/MAPOmnichainServiceV2.sol:MAPOmnichainServiceV2", chainId, true);
    }
    console.log(`${implContract} address: ${implAddr}`);

    let proxyAddr;
    let Impl = await ethers.getContractFactory(implContract);
    let data = Impl.interface.encodeFunctionData("initialize", [wtoken, lightnode, deployer]);
    if (hre.network.zksync === true) {
        proxyAddr = await zksyncDeploy("MAPOmnichainServiceProxyV2", [implAddr, data], hre);
    } else {
        let Proxy = await ethers.getContractFactory("MAPOmnichainServiceProxyV2");
        let proxy_salt = process.env.SERVICE_PROXY_SALT;
        let param = ethers.utils.defaultAbiCoder.encode(["address", "bytes"], [implAddr, data]);
        let createResult = await create(proxy_salt, Proxy.bytecode, param);
        if (!createResult[1]) {
            return;
        }
        proxyAddr = createResult[0];
    }

    console.log(`Deploy ${implContract} proxy address ${proxyAddr} successful`);

    let deployment = await readFromFile(hre.network.name);
    //deploy[hre.network.name]["mosImpl"] = mos_impl
    deployment[hre.network.name]["mosProxy"] = proxyAddr;

    await writeToFile(deployment);

    await verify(proxyAddr, [implAddr, data], "contracts/MAPOmnichainServiceProxyV2.sol:MAPOmnichainServiceProxyV2", chainId, true);
};

exports.mosVerify = async function (deploy, chainId, deployer, wtoken, lightnode) {
    let implContract;
    if (chainId === 212 || chainId === 22776) {
        // Map or Makalu
        implContract = "MAPOmnichainServiceRelayV2";
    } else {
        implContract = "MAPOmnichainServiceV2";
    }

    let impl = await ethers.getContract(implContract);
    console.log(`${implContract} address: ${impl.address}`);



    let data = impl.interface.encodeFunctionData("initialize", [wtoken, lightnode, deployer]);

    let deployment = await readFromFile(hre.network.name);
    let mos_proxy = deployment[hre.network.name]["mosProxy"];
    console.log(`proxy address: ${mos_proxy}`);

    await verify(mos_proxy, [impl.address, data], "contracts/MAPOmnichainServiceProxyV2.sol:MAPOmnichainServiceProxyV2", chainId, false);

    await verify(impl.address, [], "contracts/MAPOmnichainServiceV2.sol:MAPOmnichainServiceV2", chainId, false);

};

exports.mosUpgrade = async function (deploy, chainId, deployer, network, impl_addr, auth) {
    let mos = await getMos(chainId, network);
    if (mos === undefined) {
        throw "mos proxy not deployed ...";
    }
    console.log("mos proxy address:", mos.address);

    let implContract;
    if (chainId === 212 || chainId === 22776) {
        // Map or Makalu
        implContract = "MAPOmnichainServiceRelayV2";
    } else {
        implContract = "MAPOmnichainServiceV2";
    }

    //deployed new impl
    let implAddr = impl_addr;
    if (impl_addr === ethers.constants.AddressZero) {
        if (hre.network.zksync === true) {
            implAddr = await zksyncDeploy(implContract, [], hre);
        } else {
            await deploy(implContract, {
                from: deployer,
                args: [],
                log: true,
                contract: implContract,
            });

            let impl = await ethers.getContract(implContract);

            implAddr = impl.address;
        }

        console.log("new mos impl to address:", implAddr);

        await verify(implAddr, [], "contracts/MAPOmnichainServiceV2.sol:MAPOmnichainServiceV2", chainId, true);
    }

    console.log(`${implContract} implementation address: ${implAddr}`);

    if (auth) {
        let deployment = await readFromFile(hre.network.name);
        if (!deployment[hre.network.name]["authority"]) {
            throw "authority not deployed";
        }
        let Authority = await ethers.getContractFactory("Authority");
        let authority = Authority.attach(deployment[hre.network.name]["authority"]);

        let data = mos.interface.encodeFunctionData("upgradeTo", [implAddr]);
        let executeData = authority.interface.encodeFunctionData("execute", [mos.address, 0, data]);
        console.log("execute input", executeData);

        await (await authority.execute(mos.address, 0, data)).wait();
    } else {
        await mos.upgradeTo(implAddr);
    }

    console.log("upgrade mos impl to address:", implAddr);
};

exports.stringToHex = async function (str) {
    return str
        .split("")
        .map(function (c) {
            return ("0" + c.charCodeAt(0).toString(16)).slice(-2);
        })
        .join("");
};
