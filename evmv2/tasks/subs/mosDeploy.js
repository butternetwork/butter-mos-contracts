let {create,readFromFile,writeToFile} = require("../../utils/helper.js")
//const hre = require("hardhat");

module.exports = async (taskArgs, hre) => {
    const {deploy} = hre.deployments
    const accounts = await ethers.getSigners()
    const deployer = accounts[0];
    const chainId = await hre.network.config.chainId;
    console.log("deployer address:", deployer.address);

    let implContract;
    if (chainId === 212 || chainId === 22776) { // Map or Makalu
        implContract = "MAPOmnichainServiceRelayV2";
    } else {
        implContract = "MAPOmnichainServiceV2";
    }
    let Impl = await ethers.getContractFactory(implContract);

    await deploy(implContract, {
        from: deployer.address,
        args: [],
        log: true,
        contract: implContract,
    })

    let impl = await ethers.getContract(implContract);

    console.log(`${implContract} address: ${impl.address}`);

    let Proxy = await ethers.getContractFactory("MAPOmnichainServiceProxyV2");
    let proxy_salt = process.env.SERVICE_PROXY_SALT;
    let data = Impl.interface.encodeFunctionData("initialize", [taskArgs.wrapped, taskArgs.lightnode, deployer.address]);
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