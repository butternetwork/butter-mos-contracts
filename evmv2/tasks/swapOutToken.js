
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
                "1000000000000000000", // 1 USDC
                "000000000000000000",
                abi.encode(["address[]"], [['0x3F1E91BFC874625f4ee6EF6D8668E79291882373', '0x593F6F6748dc203DFa636c299EeA6a39C0734EEd']]),
                "0" // pancake
            ]]
            ,
            '0x593F6F6748dc203DFa636c299EeA6a39C0734EEd',
            '0x6Ac66dCBE1680aAC446B28BE5371Be869B5059cF'
        ]
    );

    const maticSwapData = abi.encode(
        ["tuple(uint256, uint256, bytes, uint64)[]", "bytes", "address"],

        [
            [[
                "1000000000000000000", // 1 USDC
                "800000000000000000",
                abi.encode(["address[]"], [['0x1E01CF4503808Fb30F17806035A87cf5A5217727', '0xe1D8eAB4e616156E11e1c59D1a0E0EFeD66f4cfa']]),
                "0" // quickswap
            ]]
            ,
            '0xe1D8eAB4e616156E11e1c59D1a0E0EFeD66f4cfa',
            '0x6Ac66dCBE1680aAC446B28BE5371Be869B5059cF',
        ]
    );
    console.log('swapdata', maticSwapData)

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