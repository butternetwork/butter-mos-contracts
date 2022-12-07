
function stringToHex(str) {
    return str.split("").map(function(c) {
        return ("0" + c.charCodeAt(0).toString(16)).slice(-2);
    }).join("");
}

const bscSwapData = {
    swapParams: [
        {
            amountIn: '100000000000000000000', // 100 USDC
            minAmountOut: '0',
            path: '0x64544969ed7EBf5f083679233325356EbE738930094616F0BdFB0b526bD735Bf66Eca0Ad254ca81F', // usdc - wbnb
            routerIndex: 0 // pancake
        }
    ],
    targetToken: '0x0000000000000000000000000000000000000000',
    toAddress: '0x8c9b3cAf7DedD3003f53312779c1b92ba1625D94' // receiver address
}

const maticSwapData = {
    swapParams: [
        {
            amountIn: '100000000000000000000', // 100 USDC
            minAmountOut: '0',
            path: '0x64544969ed7EBf5f083679233325356EbE738930094616F0BdFB0b526bD735Bf66Eca0Ad254ca81F', // usdc - wmatic
            routerIndex: 0 // quick
        }
    ],
    targetToken: '0x0000000000000000000000000000000000000000',
    toAddress: '0x8c9b3cAf7DedD3003f53312779c1b92ba1625D94'
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
    let toChainSwapData;
    if (taskArgs.fromchain === 'bsc') {
        toChainSwapData = maticSwapData;
    } else {
        toChainSwapData = bscSwapData;
    }

    if (taskArgs.token === "0x0000000000000000000000000000000000000000"){
        await (await mos.connect(deployer).swapOutNative(
            address,
            taskArgs.tochain,
            {value:taskArgs.value}
        )).wait();
    } else {
        await (await token.connect(deployer).approve(
            taskArgs.mos,
            taskArgs.value
        )).wait();

        await (await mos.connect(deployer).swapOutToken(
            taskArgs.token,
            taskArgs.value,
            taskArgs.mapTargetToken,
            taskArgs.tochain,
            toChainSwapData
        )).wait();

    }

    console.log(`swap out token ${taskArgs.token} ${taskArgs.value} to chain ${taskArgs.tochain} ${address} successful`);
}