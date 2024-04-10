const { getMos, getToken, getRole } = require("../../utils/helper");

function stringToHex(str) {
    return str
        .split("")
        .map(function (c) {
            return ("0" + c.charCodeAt(0).toString(16)).slice(-2);
        })
        .join("");
}

let IDeployFactory_abi = [
    "function deploy(bytes32 salt, bytes memory creationCode, uint256 value) external",
    "function getAddress(bytes32 salt) external view returns (address)",
];

task("token:deposit", "Cross-chain deposit token")
    .addOptionalParam("token", "The token address", "0x0000000000000000000000000000000000000000", types.string)
    .addOptionalParam("address", "The receiver address", "", types.string)
    .addParam("value", "deposit value, unit WEI")
    .setAction(async (taskArgs, hre) => {
        const accounts = await ethers.getSigners();
        const deployer = accounts[0];

        console.log("deposit address:", deployer.address);

        const chainId = hre.network.chainId;

        let mos = await getMos(chainId, hre.network.name);

        if (!mos) {
            throw "mos not deployed ...";
        }
        console.log("mos address:", mos.address);

        //let mos = await ethers.getContractAt('IButterMosV2', taskArgs.mos);

        let address = taskArgs.address;
        if (taskArgs.address === "") {
            address = deployer.address;
        }

        let tokenAddr = await getToken(hre.network.config.chainId, taskArgs.token);

        if (tokenAddr === "0x0000000000000000000000000000000000000000") {
            await (await mos.connect(deployer).depositNative(address, { value: taskArgs.value })).wait();
        } else {
            let token = await ethers.getContractAt("MintableToken", tokenAddr);
            console.log("approve token... ");
            await (await token.connect(deployer).approve(mos.address, taskArgs.value)).wait();

            console.log("deposit token... ");
            await (await mos.connect(deployer).depositToken(tokenAddr, address, taskArgs.value)).wait();
        }

        console.log(`deposit token ${taskArgs.token} ${taskArgs.value} to ${address} successful`);
    });

task("token:transferOut", "Cross-chain transfer token")
    .addOptionalParam("token", "The token address", "0x0000000000000000000000000000000000000000", types.string)
    .addOptionalParam("address", "The receiver address", "", types.string)
    .addOptionalParam("chain", "The receiver chain", 22776, types.int)
    .addParam("value", "transfer out value, unit WEI")
    .setAction(async (taskArgs, hre) => {
        const accounts = await ethers.getSigners();
        const deployer = accounts[0];

        console.log("transfer address:", deployer.address);

        const chainId = hre.network.chainId;

        let mos = await getMos(chainId, hre.network.name);
        if (!mos) {
            throw "mos not deployed ...";
        }
        console.log("mos address:", mos.address);

        // let mos = await ethers.getContractAt('IButterMosV2', taskArgs.mos);
        let address = taskArgs.address;
        if (taskArgs.address === "") {
            address = deployer.address;
        } else {
            if (taskArgs.address.substr(0, 2) != "0x") {
                address = "0x" + stringToHex(taskArgs.address);
            }
        }

        let tokenAddr = await getToken(hre.network.config.chainId, taskArgs.token);
        console.log(`token ${taskArgs.token} address ${tokenAddr}`);

        if (tokenAddr === "0x0000000000000000000000000000000000000000") {
            await (
                await mos.connect(deployer).swapOutNative(deployer.address, address, taskArgs.chain, "0x", {
                    value: taskArgs.value,
                })
            ).wait();
        } else {
            console.log("token receiver:", taskArgs.address);

            let token = await ethers.getContractAt("MintableToken", tokenAddr);
            await (await token.connect(deployer).approve(mos.address, taskArgs.value)).wait();

            await (
                await mos
                    .connect(deployer)
                    .swapOutToken(deployer.address, tokenAddr, address, taskArgs.value, taskArgs.chain, "0x")
            ).wait();
        }

        console.log(`transfer token ${taskArgs.token} ${taskArgs.value} to ${address} successful`);
    });

task("token:deploy", "deploy mapping token")
    .addParam("name", "token name")
    .addParam("symbol", "token symbol")
    .addOptionalParam("salt", "deploy salt", "", types.string)
    .addOptionalParam("decimals", "decimals, default is 18", 18, types.int)
    .addOptionalParam("admin", "admin address, default is deployer", "", types.string)
    .addOptionalParam(
        "factory",
        "deploy factory address, default is 0x6258e4d2950757A749a4d4683A7342261ce12471",
        "0x6258e4d2950757A749a4d4683A7342261ce12471", types.string
    )
    .setAction(async (taskArgs, hre) => {
        const { deployments, ethers } = hre;
        const { deploy } = deployments;
        const accounts = await ethers.getSigners();
        const deployer = accounts[0];

        let admin = taskArgs.admin;
        if (taskArgs.admin === "") {
            admin = deployer;
        }
        console.log("token name:", taskArgs.name);
        console.log("token symbol:", taskArgs.symbol);
        console.log("token decimals:", taskArgs.decimals);
        console.log("token admin:", admin);

        if (taskArgs.salt === "") {
            await deploy("MappingToken", {
                from: deployer,
                args: [taskArgs.name, taskArgs.symbol, taskArgs.decimals, admin],
                log: true,
                contract: "MappingToken",
            });

            let token = await deployments.get("MappingToken");

            console.log("token ==", token.address);
        } else {
            let factory = await ethers.getContractAt(IDeployFactory_abi, taskArgs.factory);
            let salt_hash = await ethers.utils.keccak256(await ethers.utils.toUtf8Bytes(taskArgs.salt));
            console.log("deploy factory address:", factory.address);
            console.log("deploy salt:", taskArgs.salt);
            let addr = await factory.getAddress(salt_hash);
            console.log("deployed to :", addr);

            let param = ethers.utils.defaultAbiCoder.encode(
                ["string", "string", "uint8", "address"],
                [taskArgs.name, taskArgs.symbol, taskArgs.decimals, admin]
            );

            let code = await ethers.provider.getCode(addr);
            if (code !== "0x") {
                console.log("token already deployed", addr);
                return;
            }
            let token = await ethers.getContractFactory("MappingToken");
            let create_code = ethers.utils.solidityPack(["bytes", "bytes"], [token.bytecode, param]);
            let create = await (await factory.deploy(salt_hash, create_code, 0)).wait();
            if (create.status == 1) {
                console.log("deployed to :", addr);
            } else {
                console.log("deploy fail");
                throw "deploy fail";
            }
        }
    });

task("token:grant", "grantRole")
    .addParam("token", "role")
    .addParam("role", "role")
    .addOptionalParam("addr", "role address", "mos", types.string)
    .setAction(async (taskArgs, hre) => {
        const { deployments, ethers } = hre;
        const { deploy } = deployments;
        const accounts = await ethers.getSigners();
        const deployer = accounts[0];
        console.log("deployer:", deployer.address);

        let Token = await ethers.getContractFactory("MappingToken");

        let tokenAddr = await getToken(hre.network.config.chainId, taskArgs.token);
        let token = Token.attach(tokenAddr);
        let role = getRole(taskArgs.role);

        let addr = taskArgs.addr;
        if (taskArgs.addr === "mos") {
            let mos = await getMos(hre.network.config.chainId, hre.network.name);
            if (!mos) {
                throw "mos not deployed ...";
            }
            addr = mos.address;
        }

        console.log("token:", token.address);
        console.log("role:", role);
        console.log("addr:", addr);

        await (await token.grantRole(role, addr)).wait();
    });

task("token:revoke", "grantRole")
    .addParam("token", "role")
    .addParam("role", "role")
    .addOptionalParam("addr", "role address", "mos", types.string)
    .setAction(async (taskArgs, hre) => {
        const { deployments, ethers } = hre;
        const { deploy } = deployments;
        const accounts = await ethers.getSigners();
        const deployer = accounts[0];
        console.log("deployer:", deployer.address);

        console.log("deployer:", deployer);
        let Token = await ethers.getContractFactory("MappingToken");
        let tokenAddr = getToken(hre.network.config.chainId, taskArgs.token);
        let token = Token.attach(tokenAddr);
        let role = getRole(taskArgs.role);
        let addr = taskArgs.addr;
        if (taskArgs.addr === "mos") {
            let mos = await getMos(chainId, hre.network.name);
            if (!mos) {
                throw "mos not deployed ...";
            }
            addr = mos.address;
        }

        console.log("token:", token.address);
        console.log("role:", role);
        console.log("addr:", addr);

        await (await token.revokeRole(role, addr)).wait();
    });


task("token:setMintCap", "setMinterCap")
    .addParam("token", "token addr")
    .addOptionalParam("addr", "minter address", "mos", types.string)
    .addParam("cap", "cap")
    .setAction(async (taskArgs, hre) => {
        const { deployments, ethers } = hre;
        const { deploy } = deployments;
        const accounts = await ethers.getSigners();
        const deployer = accounts[0];
        console.log("deployer:", deployer.address);

        let Token = await ethers.getContractFactory("MappingToken");
        let tokenAddr = await getToken(hre.network.config.chainId, taskArgs.token);
        let token = Token.attach(tokenAddr);
        let addr = taskArgs.addr;
        if (taskArgs.addr === "mos") {
            let mos = await getMos(hre.network.config.chainId, hre.network.name);
            if (!mos) {
                throw "mos not deployed ...";
            }
            addr = mos.address;
        }

        console.log("token:", token.address);
        console.log("minter:", addr);

        console.log("before: ", await token.getMinterCap(addr));
        await (await token.setMinterCap(addr, ethers.utils.parseEther(taskArgs.cap))).wait();
        console.log("after : ", await token.getMinterCap(addr));
        let info = await token.minterCap(addr);
        console.log(`cap: ${info.cap}, total: ${info.total}`)
    });

task("mintToken", "mint token")
    .addParam("token", "token address")
    .addParam("to", "mint address ")
    .addParam("amount", "mint amount")
    .setAction(async (taskArgs, HardhatRuntimeEnvironment) => {
        const { deployments, getNamedAccounts, ethers } = HardhatRuntimeEnvironment;
        const { deploy } = deployments;
        const { deployer } = await getNamedAccounts();

        console.log("deployer:", deployer);
        let Token = await ethers.getContractFactory("MappingToken");
        let token = Token.attach(taskArgs.token);
        await (await token.mint(taskArgs.to, taskArgs.amount)).wait();
    });
task("token:mintableDeploy", "Deploy a token with role control")
    .addParam("name", "token name")
    .addParam("symbol", "token symbol")
    .addOptionalParam("decimals", "default 18", 18, types.int)
    .addOptionalParam("balance", "init balance, default 0", 0, types.int)
    .setAction(async (taskArgs, hre) => {
        const { deploy } = hre.deployments;
        const accounts = await ethers.getSigners();
        const deployer = accounts[0];

        console.log("deployer address:", deployer.address);

        await deploy("MintableToken", {
            from: deployer.address,
            args: [taskArgs.name, taskArgs.symbol, taskArgs.decimals],
            log: true,
            contract: "MintableToken",
        });

        let token = await ethers.getContract("MintableToken");

        console.log(`Deply token '${taskArgs.symbol}' address:`, token.address);

        if (taskArgs.balance > 0) {
            balance = ethers.BigNumber.from(taskArgs.balance).mul(ethers.BigNumber.from("1000000000000000000"));

            await token.mint(deployer.address, balance.toString());

            console.log(`Mint '${taskArgs.name}' Token ${taskArgs.balance} ${taskArgs.symbol}`);
        }
    });

task("token:grant2", "Grant a mintable token mint role")
    .addParam("token", "token address")
    .addOptionalParam("minter", "minter address, default mos", "mos", types.string)
    .setAction(async (taskArgs, hre) => {
        const { deploy } = hre.deployments;
        const accounts = await ethers.getSigners();
        const deployer = accounts[0];

        let chainId = hre.network.config.chainId;

        console.log("deployer address:", deployer.address);

        let tokenAddr = await getToken(hre.network.config.chainId, taskArgs.token);

        let token = await ethers.getContractAt("MintableToken", taskArgs.token);

        console.log("Mintable Token address:", token.address);

        let minter = taskArgs.minter;
        if (taskArgs.minter === "mos") {
            let proxy = await getMos(chainId, hre.network.name);
            if (proxy === undefined) {
                throw "mos not deployed ...";
            }
            minter = proxy.address;
        }
        await await token
            .connect(deployer)
            .grantRole("0x9f2df0fed2c77648de5860a4cc508cd0818c85b8b8a1ab4ceeef8d981c8956a6", minter);

        console.log("Grant token ", token.address, " to address", minter);
    });

task("token:mint2", "mint token")
    .addParam("token", "token address")
    .addParam("amount", "mint amount")
    .setAction(async (taskArgs, hre) => {
        const { deploy } = hre.deployments;
        const accounts = await ethers.getSigners();
        const deployer = accounts[0];

        console.log("deployer address:", deployer.address);

        let tokenAddr = await getToken(hre.network.config.chainId, taskArgs.token);

        let token = await ethers.getContractAt("MintableToken", taskArgs.token);

        console.log("Mintable Token address:", token.address);

        await token.mint(deployer.address, taskArgs.amount);

        console.log(`Mint '${taskArgs.token}' Token ${taskArgs.amount} `);
    });

task("token:transfer", "transfer token")
    .addParam("token", "token address")
    .addParam("receiver", "receiver address")
    .addParam("amount", "mint amount")
    .setAction(async (taskArgs, hre) => {
        const { deploy } = hre.deployments;
        const accounts = await ethers.getSigners();
        const deployer = accounts[0];

        console.log("deployer address:", deployer.address);

        let tokenAddr = await getToken(hre.network.config.chainId, taskArgs.token);

        let token = await ethers.getContractAt("MintableToken", taskArgs.token);

        console.log("Token address:", token.address);

        await token.transfer(taskArgs.receiver, taskArgs.amount);

        console.log(`Transfer '${taskArgs.token}' Token ${taskArgs.amount} to ${taskArgs.receiver} `);
    });
