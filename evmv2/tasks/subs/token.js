const { getMos, getToken, getRole, getChain, readFromFile } = require("../../utils/helper");
const { tronTokenTransferOut } = require("../utils/tron");

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

task("token:transferOut", "Cross-chain transfer token")
    .addOptionalParam("token", "The token address", "0x0000000000000000000000000000000000000000", types.string)
    .addOptionalParam("receiver", "The receiver address", "", types.string)
    .addOptionalParam("chain", "The receiver chain", "22776", types.string)
    .addParam("value", "transfer out value, unit WEI")
    .setAction(async (taskArgs, hre) => {
        const accounts = await ethers.getSigners();
        const deployer = accounts[0];

        console.log("transfer address:", deployer.address);

        let target = await getChain(taskArgs.chain);
        let targetChainId = target.chainId;
        console.log("target chain:", targetChainId);

        let receiver = taskArgs.receiver;
        if (taskArgs.receiver === "") {
            receiver = deployer.address;
        } else {
            if (taskArgs.receiver.substr(0, 2) != "0x") {
                receiver = "0x" + stringToHex(taskArgs.receiver);
            }
        }
        console.log("token receiver:", receiver);

        let tokenAddr = await getToken(hre.network.config.chainId, taskArgs.token);
        console.log(`token ${taskArgs.token} address: ${tokenAddr}`);

        if (hre.network.name === "Tron" || hre.network.name === "TronTest") {
            await tronTokenTransferOut(
                hre.artifacts,
                hre.network.name,
                tokenAddr,
                targetChainId,
                receiver,
                taskArgs.value
            );
            return;
        }

        let mos = await getMos(hre.network.config.chainId, hre.network.name);
        if (!mos) {
            throw "mos not deployed ...";
        }
        console.log("mos address:", mos.address);

        let value = ethers.utils.parseUnits("0", 18);
        let amount;
        if (tokenAddr === "0x0000000000000000000000000000000000000000") {
            value = ethers.utils.parseUnits(taskArgs.value, 18);
            amount = value;
        } else {
            let token = await ethers.getContractAt("MintableToken", tokenAddr);
            let decimals = await token.decimals();
            amount = ethers.utils.parseUnits(taskArgs.value, decimals);

            let approved = await token.allowance(deployer.address, mos.address);
            console.log("approved ", approved);
            if (approved.lt(amount)) {
                console.log(`${tokenAddr} approve ${mos.address} value [${amount}] ...`);
                await (await token.approve(mos.address, amount)).wait();
            }
        }
        await mos.connect(deployer).swapOutToken(deployer.address, tokenAddr, receiver, amount, targetChainId, "0x", {
            value: value,
        });

        console.log(`transfer token ${taskArgs.token} ${taskArgs.value} to ${receiver} successful`);
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
        "0x6258e4d2950757A749a4d4683A7342261ce12471",
        types.string
    )
    .setAction(async (taskArgs, hre) => {
        const { deployments, ethers } = hre;
        const { deploy } = deployments;
        const accounts = await ethers.getSigners();
        const deployer = accounts[0];

        let admin = taskArgs.admin;
        if (taskArgs.admin === "") {
            admin = deployer.address;
        }
        console.log("token name:", taskArgs.name);
        console.log("token symbol:", taskArgs.symbol);
        console.log("token decimals:", taskArgs.decimals);
        console.log("token admin:", admin);

        if (taskArgs.salt === "") {
            await deploy("MappingToken", {
                from: deployer.address,
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
            if (create.status === 1) {
                console.log("deployed to :", addr);
            } else {
                console.log("deploy fail");
                throw "deploy fail";
            }
        }
    });

task("token:grant", "grant role")
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
        let token = await Token.attach(tokenAddr);
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

task("token:revoke", "revoke role")
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
        let token = await Token.attach(tokenAddr);
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

        await (await token.revokeRole(role, addr)).wait();
    });

task("token:getMember", "get role member")
    .addOptionalParam("token", "The token addr", "", types.string)
    .addOptionalParam("role", "The role", "admin", types.string)
    .setAction(async (taskArgs, hre) => {
        const { deployments, ethers } = hre;
        const { deploy } = deployments;
        const accounts = await ethers.getSigners();
        const deployer = accounts[0];
        console.log("deployer:", deployer.address);

        let Token = await ethers.getContractFactory("MappingToken");
        let tokenAddr = await getToken(hre.network.config.chainId, taskArgs.token);
        let token = await Token.attach(tokenAddr);
        let role = getRole(taskArgs.role);

        console.log("token:", token.address);
        console.log("role:", role);

        let count = await token.getRoleMemberCount(role);
        console.log(`role ${taskArgs.role} has ${count} member(s)`);

        for (let i = 0; i < count; i++) {
            let member = await token.getRoleMember(role, i);
            console.log(`    ${i}: ${member}`);
        }
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

        let decimals = await token.decimals();
        console.log("token:", token.address);
        console.log("minter:", addr);

        console.log("before: ", await token.getMinterCap(addr));

        let cap = ethers.utils.parseUnits(taskArgs.cap, decimals);
        await (await token.setMinterCap(addr, cap)).wait();

        let info = await token.minterCap(addr);
        console.log(`cap: ${info.cap}, total: ${info.total}`);
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

task("token:mint", "mint token")
    .addParam("token", "token address")
    .addParam("amount", "mint amount")
    .setAction(async (taskArgs, hre) => {
        const { deploy } = hre.deployments;
        const accounts = await ethers.getSigners();
        const deployer = accounts[0];

        console.log("deployer address:", deployer.address);

        let tokenAddr = await getToken(hre.network.config.chainId, taskArgs.token);
        let token = await ethers.getContractAt("MintableToken", tokenAddr);

        console.log("Mintable Token address:", token.address);

        let decimals = await token.decimals();
        let amount = ethers.utils.parseUnits(taskArgs.amount, decimals);

        await token.mint(deployer.address, amount);

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
        let token = await ethers.getContractAt("MintableToken", tokenAddr);
        console.log("Token address:", token.address);

        let decimals = await token.decimals();
        let amount = ethers.utils.parseUnits(taskArgs.amount, decimals);

        // ethers.utils.toWei();

        await token.transfer(taskArgs.receiver, amount);

        console.log(`Transfer '${taskArgs.token}' Token ${taskArgs.amount} to ${taskArgs.receiver} `);
    });
