
function stringToHex(str) {
    return str.split("").map(function(c) {
        return ("0" + c.charCodeAt(0).toString(16)).slice(-2);
    }).join("");
}

module.exports = async (taskArgs) => {
    const accounts = await ethers.getSigners()
    const deployer = accounts[0];

    console.log("deployer address:",deployer.address);

    let token = await ethers.getContractAt("IERC20", taskArgs.token);

    let mos = await ethers.getContractAt('MAPOmnichainServiceV2',taskArgs.mos);

    let address = taskArgs.address;
    if (taskArgs.address === "") {
        address = deployer.address;
    } else {
        if (taskArgs.address.substr(0,2) != "0x") {
            address = "0x" + stringToHex(taskArgs.address);
        }
    }

    if (taskArgs.token === "0x0000000000000000000000000000000000000000"){
        await (await mos.connect(deployer).swapOutNative(
            address,
            taskArgs.tochain,
            {value:taskArgs.value}
        )).wait();
    }else {
        await (await token.connect(deployer).approve(
            taskArgs.mos,
            taskArgs.value
        )).wait();
        const swapData = {
            swapParams: [
                {
                    amountIn: '100000000000000',
                    minAmountOut: '0',
                    path: '0x' + stringToHex('wrap.testnetXmost.testnet'),
                    routerIndex: 1
                }
            ],
            targetToken: '0x' + stringToHex('most.testnet'),
            toAddress: '0x' + stringToHex('xyli.testnet')
        }
        await (await mos.connect(deployer).swapOutToken(
            taskArgs.token,
            taskArgs.value,
            taskArgs.mapTargetToken,
            taskArgs.tochain,
            swapData
        )).wait();

    }

    console.log(`swap out token ${taskArgs.token} ${taskArgs.value} to chain ${taskArgs.chain} ${address} successful`);
}