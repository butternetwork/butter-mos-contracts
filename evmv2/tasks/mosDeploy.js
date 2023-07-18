let {create,readFromFile,writeToFile} = require("../utils/helper.js")

module.exports = async (taskArgs, hre) => {
    const accounts = await ethers.getSigners()
    const deployer = accounts[0];
    const chainId = await deployer.getChainId();
    console.log("deployer address:", deployer.address);

    let Impl;

    if(chainId === 212 || chainId === 22776) { // Map or Makalu
        Impl =  await ethers.getContractFactory("MAPOmnichainServiceRelayV2")
    } else {
        Impl =  await ethers.getContractFactory("MAPOmnichainServiceV2")
    }

    let impl_salt = process.env.SERVICE_IMPL_SALT;

    let creat = await create(impl_salt,Impl.bytecode,"0x")

    let mos_impl = creat[0];

    console.log("mos impl :",mos_impl);
    let Proxy = await ethers.getContractFactory("MAPOmnichainServiceProxyV2");
    let proxy_salt = process.env.SERVICE_PROXY_SALT;

    let data = Impl.interface.encodeFunctionData("initialize", [taskArgs.wrapped,taskArgs.lightnode,deployer.address]);

    let param = ethers.utils.defaultAbiCoder.encode(['address', 'bytes'], [mos_impl,data]);

    creat = await create(proxy_salt,Proxy.bytecode,param)
    let mos_proxy = creat[0];
    console.log("mos proxy..",mos_proxy)

    let deploy = await readFromFile(hre.network.name);
    deploy[hre.network.name]["mosImpl"] = mos_impl
    deploy[hre.network.name]["mosProxy"] = mos_proxy

    await writeToFile(deploy);

}