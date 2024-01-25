let { tronDeployRootToken } = require("../utils/tron.js");
const { getMos } = require("../../utils/helper");
//const {task} = require("hardhat/src/internal/core/config/config-env");

task("rootToken:deploy", "deploy root token on tron")
    .addParam("name", "tron root token name")
    .addParam("symbol", "tron root token symbol")
    .addParam("supply", "tron root token totalSupply")
    .setAction(async (taskArgs, hre) => {
        if (hre.network.name === "Tron" || hre.network.name === "TronTest") {
            await tronDeployRootToken(hre.artifacts, hre.network.name, taskArgs.name, taskArgs.symbol, taskArgs.supply);
        } else {
            throw "unsupported chain";
        }
    });

task("childToken:deploy", "deploy child token on bttc")
    .addParam("name", "child token name")
    .addParam("symbol", "child token symbol")
    .addParam("decimals", "child token decimals")
    .setAction(async (taskArgs, hre) => {
        const { deploy } = hre.deployments;
        const accounts = await ethers.getSigners();
        const deployer = accounts[0];
        console.log("deployer address:", deployer.address);
        if (hre.network.name === "Bttc" || hre.network.name === "BttcTest") {
            let childChainManager;
            if (hre.network.name === "Bttc") {
                childChainManager = "0x9a15f3a682d086c515be4037bda3b0676203a8ef";
            } else {
                childChainManager = "0xfe22C61F33e6d39c04dE80B7DE4B1d83f75210C4";
            }
            await deploy("ChildERC20", {
                from: deployer.address,
                args: [taskArgs.name, taskArgs.symbol, taskArgs.decimals, childChainManager],
                log: true,
                contract: "ChildERC20",
            });

            let token = await ethers.getContract("ChildERC20");

            console.log("ChildERC20 deployed to ", token.address);
        } else {
            throw "unsupported chain";
        }
    });

task("childToken:verify", "verify child token")
    .addOptionalParam("addr", "tron child token name", "", types.string)
    .addParam("name", "tron child token name")
    .addParam("symbol", "tron child token symbol")
    .addParam("decimals", "tron child token decimals")
    .setAction(async (taskArgs, hre) => {
        const { deploy } = hre.deployments;
        const accounts = await ethers.getSigners();
        const deployer = accounts[0];
        console.log("deployer address:", deployer.address);
        if (hre.network.name === "Bttc" || hre.network.name === "BttcTest") {
            let childChainManager;
            if (hre.network.name === "Bttc") {
                childChainManager = "0x9a15f3a682d086c515be4037bda3b0676203a8ef";
            } else {
                childChainManager = "0xfe22C61F33e6d39c04dE80B7DE4B1d83f75210C4";
            }

            let addr = taskArgs.addr;
            if (addr === "") {
                let childERC20 = await deployments.get("ChildERC20");
                addr = childERC20.address;
            }

            // await verify("0x3067c49494d25BF468d5eef7d8937a2fa0d5cC0E",[],"contracts/tron/child/ChildERC20.sol:ChildERC20")
            await hre.run("verify:verify", {
                address: addr,
                constructorArguments: [taskArgs.name, taskArgs.symbol, taskArgs.decimals, childChainManager],
                contract: "contracts/tron/tokens/child/ChildERC20.sol:ChildERC20",
            });
        } else {
            throw "unsupported chain";
        }
    });

task("childToken:deployEventRelay", "deploy event relay on bttc")
    .addParam("childtoken", "child token address")
    .setAction(async (taskArgs, hre) => {
        const { deploy } = hre.deployments;
        const accounts = await ethers.getSigners();
        const deployer = accounts[0];
        console.log("deployer address:", deployer.address);
        if (hre.network.name === "Bttc" || hre.network.name === "BttcTest") {
            await deploy("EventRelay", {
                from: deployer,
                args: [taskArgs.childtoken],
                log: true,
                contract: "EventRelay",
            });
        } else {
            throw "unsupport chain";
        }
    });

task("childToken:revoke", "deploy root token on tron")
    .addParam("token", "bttc child token address")
    .addOptionalParam(
        "role",
        "child token role, default is DEFAULT_ADMIN_ROLE",
        "0x0000000000000000000000000000000000000000000000000000000000000000",
        types.string
    )
    .setAction(async (taskArgs, hre) => {
        const { deploy } = hre.deployments;
        const accounts = await ethers.getSigners();
        const deployer = accounts[0];

        console.log("deployer address:", deployer.address);

        let token = await ethers.getContractAt("ChildERC20", taskArgs.token);

        console.log("Child token address:", token.address);

        await await token.connect(deployer).revokeRole(taskArgs.role, deployer.address);

        console.log(`Revoke ${deployer.address} the token ${token.address} role ${taskArgs.role} `);
    });
