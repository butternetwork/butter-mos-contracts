let {getMos} = require("../../utils/helper.js")
function stringToHex(str) {
    return str.split("").map(function(c) {
        return ("0" + c.charCodeAt(0).toString(16)).slice(-2);
    }).join("");
}


module.exports = async (taskArgs,hre) => {
    const accounts = await ethers.getSigners()
    const deployer = accounts[0];
    const chainId = await deployer.getChainId();
    console.log("deployer address:",deployer.address);

    let mos = await getMos(chainId,hre.network.name)
    if(mos === undefined) {
        throw "mos not deployed ..."
    }
    console.log("mos address:", mos.address);
    let address = taskArgs.address;
    if (taskArgs.address.substr(0,2) != "0x") {
        address = "0x" + stringToHex(taskArgs.address);
    }
    if(chainId === 212 || chainId === 22776){
        await (await mos.connect(deployer).registerChain(taskArgs.chain, address, taskArgs.type)).wait();
        console.log(`mos register chain ${taskArgs.chain}  address ${address} success`);
    } else {
        if(taskArgs.chain !== "212" && taskArgs.chain !== "22776"){
            throw("relay chainId must 212 for testnet or 22776 for mainnet")
        }
        await (await mos.connect(deployer).setRelayContract(taskArgs.chain, address)).wait();

        console.log(`mos set  relay ${address} with chain id ${taskArgs.chain} successfully `);
    }

}