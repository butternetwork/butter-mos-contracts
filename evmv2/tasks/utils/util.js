let {getMos,create,readFromFile,writeToFile} = require("../../utils/helper.js")



exports.mosDeploy = async function (deploy,chainId,deployer,wtoken,lightnode) {

    let implContract;
    if (chainId === 212 || chainId === 22776) { // Map or Makalu
        implContract = "MAPOmnichainServiceRelayV2";
    } else {
        implContract = "MAPOmnichainServiceV2";
    }
    let Impl = await ethers.getContractFactory(implContract);

    await deploy(implContract, {
        from: deployer,
        args: [],
        log: true,
        contract: implContract,
    })

    let impl = await ethers.getContract(implContract);

    console.log(`${implContract} address: ${impl.address}`);

    let Proxy = await ethers.getContractFactory("MAPOmnichainServiceProxyV2");
    let proxy_salt = process.env.SERVICE_PROXY_SALT;
    let data = Impl.interface.encodeFunctionData("initialize", [wtoken, lightnode, deployer]);
    let param = ethers.utils.defaultAbiCoder.encode(['address', 'bytes'], [impl.address, data]);

    let createResult = await create(proxy_salt, Proxy.bytecode, param)

    if (!createResult[1]) {
        return;
    }
    let mos_proxy = createResult[0];
    console.log(`Deploy ${implContract} proxy address ${mos_proxy} successful`)

    let deployment = await readFromFile(hre.network.name);
    //deploy[hre.network.name]["mosImpl"] = mos_impl
    deployment[hre.network.name]["mosProxy"] = mos_proxy;

    await writeToFile(deployment);
}


exports.mosUpgrade = async function (deploy,chainId,deployer,network,impl_addr) {

    let mos = await getMos(chainId,network)

    if (mos === undefined) {
        throw "mos proxy not deployed ..."
    }
    console.log("mos proxy address:", mos.address);

    let implContract;
    if (chainId === 212 || chainId === 22776) { // Map or Makalu
        implContract = "MAPOmnichainServiceRelayV2";
    } else {
        implContract = "MAPOmnichainServiceV2";
    }

    //deployed new impl
    if(impl_addr === ethers.constants.AddressZero) {
        await deploy(implContract, {
            from: deployer,
            args: [],
            log: true,
            contract: implContract,
        })

        let impl = await ethers.getContract(implContract);

        impl_addr = impl.address;
    }

    console.log(`${implContract} implementation address: ${impl_addr}`);

    await mos.upgradeTo(impl_addr);

    console.log("upgrade mos impl to address:", impl_addr)
}


exports.stringToHex = async function(str) {
    return str.split("").map(function(c) {
        return ("0" + c.charCodeAt(0).toString(16)).slice(-2);
    }).join("");
}