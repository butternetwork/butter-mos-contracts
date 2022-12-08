
function stringToHex(str) {
    return str.split("").map(function (c) {
        return ("0" + c.charCodeAt(0).toString(16)).slice(-2);
    }).join("");
}

module.exports = async (taskArgs) => {
    const abi = ethers.utils.defaultAbiCoder;
    const bscSwapData = abi.encode(
        ["tuple(uint256, uint256, bytes, uint64)[]", "bytes", "address"],

        [
            [[
                "10000000000000000", // 1 USDC
                "0",
                '0xaB1a4d4f1D656d2450692D237fdD6C7f9146e814ae13d989daC2f0dEbFf460aC112a837C89BAa7cd', // usdc - wbnb
                "0" // pancake
            ]]
            ,
            '0x0000000000000000000000000000000000000000',
            '0x0000000000000000000000000000000000001111'
        ]
    );
    console.log('swapdata', abi.decode(["tuple(uint256, uint256, bytes, uint64)[]", "bytes", "address"], bscSwapData))

    const maticSwapData = abi.encode(
        ["tuple(uint256, uint256, bytes, uint64)[]", "bytes", "address"],

        [
            [[
                "10000000000000000", // 1 USDC
                "0",
                '0x64544969ed7EBf5f083679233325356EbE738930094616F0BdFB0b526bD735Bf66Eca0Ad254ca81F', // usdc - matic
                "0" // quickswap
            ]]
            ,
            '0x0000000000000000000000000000000000000000',
            '0x0000000000000000000000000000000000002222'
        ]
    );

    const accounts = await ethers.getSigners();
    const deployer = accounts[0];

    console.log("deployer address:", deployer.address);

    let token = await ethers.getContractAt("IERC20", taskArgs.token);

    let mos = await ethers.getContractAt('MAPOmnichainServiceV2', taskArgs.mos);

    let address = taskArgs.address;
    if (taskArgs.address === "") {
        address = deployer.address;
    } else {
        if (taskArgs.address.substr(0, 2) != "0x") {
            address = "0x" + stringToHex(taskArgs.address);
        }
    }
    let toChainSwapData;
    if (taskArgs.tochain === '97') {
        toChainSwapData = bscSwapData;
    } else {
        toChainSwapData = maticSwapData;
    }

    if (taskArgs.token === "0x0000000000000000000000000000000000000000") {
        await (await mos.connect(deployer).swapOutNative(
            address,
            taskArgs.tochain,
            toChainSwapData,
            {value: taskArgs.value}
        )).wait();
    } else {

        await (await token.connect(deployer).approve(
            taskArgs.mos,
            taskArgs.value
        )).wait();

        await (await mos.connect(deployer).swapOutToken(
            taskArgs.token,
            address,
            taskArgs.value,
            taskArgs.tochain,
            toChainSwapData
        )).wait();
    }

    console.log(`swap out token ${taskArgs.token} ${taskArgs.value} to chain ${taskArgs.tochain} ${address} successful`);
}