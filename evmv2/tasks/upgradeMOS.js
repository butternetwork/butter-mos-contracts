let {getMos,create,readFromFile,writeToFile} = require("../utils/helper.js")
module.exports = async (taskArgs, hre) => {
    const {deploy} = hre.deployments
    const accounts = await ethers.getSigners()
    const deployer = accounts[0];
    const chainId = await deployer.getChainId();
    console.log("deployer address:", deployer.address);
    let mos = await getMos(chainId, hre.network.name)

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

    let impl_addr = taskArgs.impl;
    //deployed new impl
    if(impl_addr === ethers.constants.AddressZero) {
        await deploy(implContract, {
            from: deployer.address,
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

    //let d = await readFromFile(hre.network.name);
    //d[hre.network.name]['mosImpl'] = impl_addr;
    //await writeToFile(d);
}