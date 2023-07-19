let {getMos,create,readFromFile,writeToFile} = require("../utils/helper.js")
module.exports = async (taskArgs, hre) => {
    const {deploy} = hre.deployments
    const accounts = await ethers.getSigners()
    const deployer = accounts[0];
    const chainId = await deployer.getChainId();
    console.log("deployer address:", deployer.address);
    let mos = await getMos(chainId,hre.network.name)

    if(!mos) {
        throw "mos not deployed ..."
    }
    console.log("mos address:", mos.address);
     let impl_addr = taskArgs.impl;
    //deployed new impl
    if(impl_addr === ethers.constants.AddressZero){
        let Impl;
        if(chainId === 212 || chainId === 22776) { // Map or Makalu
            Impl =  await ethers.getContractFactory("MAPOmnichainServiceRelayV2")
        } else {
            Impl =  await ethers.getContractFactory("MAPOmnichainServiceV2")
        }
        let impl_salt = process.env.SERVICE_IMPL_SALT;

        let creat = await create(impl_salt,Impl.bytecode,"0x")
    
        impl_addr = creat[0];
    }

    console.log("new MAPOmnichainServiceV2 impl address:", impl_addr);

    await mos.upgradeTo(impl_addr);

    console.log("upgrade mos impl to address:", impl_addr)

    let d = await readFromFile(hre.network.name);

    d[hre.network.name]['mosImpl'] = impl_addr;

    await writeToFile(d);
}