let {tronDeployRootToken} = require('../utils/tron.js')

task("rootToken:deploy","deploy root token on tron")
    .addParam("name", "tron root token name")
    .addParam("symbol", "tron root token symbol")
    .addParam("supply", "tron root token totalSupply")
    .setAction(async (taskArgs,hre) => {
        if(hre.network.name === 'Tron' || hre.network.name === 'TronTest'){
           await tronDeployRootToken(hre.artifacts,hre.network.name,taskArgs.name,taskArgs.symbol,taskArgs.supply)
        } else {
           throw("unsupport chain")
        }    
});


task("childToken:deploy","deploy child token on bttc")
    .addParam("name", "child token name")
    .addParam("symbol", "child token symbol")
    .addParam("decimals", "child token decimals")
    .setAction(async (taskArgs,hre) => {
        const {deploy} = hre.deployments
        const accounts = await ethers.getSigners()
        const deployer = accounts[0];
        console.log("deployer address:",deployer.address);
        if(hre.network.name === 'Bttc' || hre.network.name === 'BttcTest'){
           let childChainManager;
           if(hre.network.name === 'Bttc') {
                childChainManager = "0x9a15f3a682d086c515be4037bda3b0676203a8ef";
           } else {
                childChainManager = "0xfe22C61F33e6d39c04dE80B7DE4B1d83f75210C4";
           }
           await deploy("ChildERC20", {
                from: deployer.address,
                args: [taskArgs.name,taskArgs.symbol,taskArgs.decimals,childChainManager],
                log: true,
                contract: "ChildERC20",
            })
    
        } else {
           throw("unsupport chain")
        }    
});

task("childToken:verify","verify child token")
    .addParam("addr", "tron child token name")
    .addParam("name", "tron child token name")
    .addParam("symbol", "tron child token symbol")
    .addParam("decimals", "tron child token decimals")
    .setAction(async (taskArgs,hre) => {
        const {deploy} = hre.deployments
        const accounts = await ethers.getSigners()
        const deployer = accounts[0];
        console.log("deployer address:",deployer.address);
        if(hre.network.name === 'Bttc' || hre.network.name === 'BttcTest'){
           let childChainManager;
           if(hre.network.name === 'Bttc') {
                childChainManager = "0x9a15f3a682d086c515be4037bda3b0676203a8ef";
           } else {
                childChainManager = "0xfe22C61F33e6d39c04dE80B7DE4B1d83f75210C4";
           }
            
            // await verify("0x3067c49494d25BF468d5eef7d8937a2fa0d5cC0E",[],"contracts/tron/child/ChildERC20.sol:ChildERC20")
            await hre.run("verify:verify", {
                address: taskArgs.addr,
                constructorArguments: [taskArgs.name,taskArgs.symbol,taskArgs.decimals,childChainManager],
                contract: "contracts/tron/tokens/child/ChildERC20.sol:ChildERC20"
            });
    
        } else {
           throw("unsupport chain")
        }    
});


task("child:deployEventRelay","deploy event relay on bttc")
    .addParam("childtoken", "child token address")
    .setAction(async (taskArgs,hre) => {
        const {deploy} = hre.deployments
        const accounts = await ethers.getSigners()
        const deployer = accounts[0];
        console.log("deployer address:",deployer.address);
        if(hre.network.name === 'Bttc' || hre.network.name === 'BttcTest'){
         await deploy("EventRelay", {
            from: deployer,
            args: [taskArgs.childtoken],
            log: true,
            contract: "EventRelay",
        })
        } else {
           throw("unsupport chain")
        }    
});