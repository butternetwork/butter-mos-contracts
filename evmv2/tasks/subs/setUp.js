
let {getMos} = require("../../utils/helper.js")
module.exports = async (taskArgs,hre) => {
    const accounts = await ethers.getSigners()
    const deployer = accounts[0];
    const chainId = await deployer.getChainId();
    console.log("deployer address:",deployer.address);

    let mos = await getMos(chainId,hre.network.name)

    if (mos == undefined) {
        throw "mos not deployed ..."
    }

    console.log("mos address", mos.address);

    if(taskArgs.settype === 'client'){
        if(chainId === 212 || chainId === 22776){
            await (await mos.connect(deployer).setLightClientManager(taskArgs.address)).wait();
            console.log("set client manager:", taskArgs.address);
        } else {
            await (await mos.connect(deployer).setLightClient(taskArgs.address)).wait();
            console.log(`mos set  light client ${taskArgs.address} successfully `);
        }
    } else if(taskArgs.settype === 'butterRouter'){
        await (await mos.connect(deployer).setButterRouterAddress(taskArgs.address)).wait();
        console.log(`mos set butter router to ${taskArgs.address} `);
    } else if(taskArgs.settype === 'tokenregister'){
        if(chainId !== 212 && chainId !== 22776){
            throw("token register only need set on relay chain");
        }
        await (await mos.connect(deployer).setTokenRegister(taskArgs.address)).wait();
        console.log("set token register:", taskArgs.address);
    } else {
        throw("unsuport set type");
    }
                    

}