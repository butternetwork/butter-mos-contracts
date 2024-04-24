let { getMos, create, readFromFile, writeToFile, zksyncDeploy, getToken } = require("../../utils/helper.js");

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
    if (chainId === 324 || chainId === 280) {
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
    console.log(`${implContract} address: ${implAddr}`);

    let proxyAddr;
    let Impl = await ethers.getContractFactory(implContract);
    let data = Impl.interface.encodeFunctionData("initialize", [wtoken, lightnode, deployer]);
    if (chainId === 324 || chainId === 280) {
        proxyAddr = await zksyncDeploy("MAPOmnichainServiceProxyV2", [implAddr, data], hre);
    } else {
        let Proxy = await ethers.getContractFactory("MAPOmnichainServiceProxyV2");
        let proxy_salt = process.env.SERVICE_PROXY_SALT;
        let param = ethers.utils.defaultAbiCoder.encode(["address", "bytes"], [implAddr, data]);
        let createResult = await create(proxy_salt, Proxy.bytecode, param);
        if (!createResult[1]) {
            return;
        }
        let proxyAddr = createResult[0];
    }

    console.log(`Deploy ${implContract} proxy address ${proxyAddr} successful`);

    let deployment = await readFromFile(hre.network.name);
    //deploy[hre.network.name]["mosImpl"] = mos_impl
    deployment[hre.network.name]["mosProxy"] = proxyAddr;

    await writeToFile(deployment);

    if (needVerify(chainId)) {
        sleep(10000);

        await run("verify:verify", {
            address: proxyAddr,
            constructorArguments: [implAddr, data],
            contract: "contracts/MAPOmnichainServiceProxyV2.sol:MAPOmnichainServiceProxyV2",
        });

        await run("verify:verify", {
            address: implAddr,
            constructorArguments: [],
            contract: "contracts/MAPOmnichainServiceV2.sol:MAPOmnichainServiceV2",
        });
    }
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

    let data = Impl.interface.encodeFunctionData("initialize", [wtoken, lightnode, deployer]);

    let deployment = await readFromFile(hre.network.name);
    let mos_proxy = deployment[hre.network.name]["mosProxy"];
    console.log(`Deploy ${implContract} proxy address ${mos_proxy} successful`);

    if (needVerify(chainId)) {
        await run("verify:verify", {
            address: mos_proxy,
            constructorArguments: [impl.address, data],
            contract: "contracts/MAPOmnichainServiceProxyV2.sol:MAPOmnichainServiceProxyV2",
        });

        await run("verify:verify", {
            address: impl.address,
            constructorArguments: [],
            contract: "contracts/MAPOmnichainServiceV2.sol:MAPOmnichainServiceV2",
        });
    }
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
        if (chainId === 324 || chainId === 280) {
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

        if (needVerify(chainId)) {
            //verify impl
            sleep(10000);
            await run("verify:verify", {
                address: implAddr,
                constructorArguments: [],
                contract: "contracts/MAPOmnichainServiceV2.sol:MAPOmnichainServiceV2",
            });
        }
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

exports.needVerify = function (chainId) {
    return needVerify(chainId);
};

function needVerify(chainId) {
    if (
        chainId === 1 ||
        chainId === 56 ||
        chainId === 137 ||
        chainId === 199 ||
        chainId === 81457 ||
        chainId === 8453 ||
        chainId === 324
    ) {
        return true;
    } else {
        return false;
    }
}

exports.verify = async function (addr, args, code) {
    // await verify("0x3067c49494d25BF468d5eef7d8937a2fa0d5cC0E",[],"contracts/tron/child/ChildERC20.sol:ChildERC20")
    await hre.run("verify:verify", {
        address: addr,
        constructorArguments: args,
        contract: code,
    });
};
