const {
    getFeeService,
    getFee,
    getFeeConfig,
    getToken,
    getChain,
    getChainList,
    saveFeeList,
} = require("../utils/utils");

const { isTron, toEvmAddress} = require("../../utils/helper");

task("fee:setReceiver", "Set message fee service address ")
    .addOptionalParam("receiver", "fee receiver address", "latest", types.string)
    .addOptionalParam("service", "the fee service address", "", types.string)
    .setAction(async (taskArgs, hre) => {
        const accounts = await ethers.getSigners();
        const deployer = accounts[0];

        let feeService = await getFeeService(hre, taskArgs.service);

        let receiver = taskArgs.receiver;
        if (taskArgs.receiver === "latest") {
            let feeConfig = await getFeeConfig(hre.network.name);
            receiver = feeConfig.feeReceiver;
        }

        if (isTron(hre.network.config.chainId)) {
            let onchainReceiver = await feeService.feeReceiver().call();
            receiver = await toEvmAddress(receiver,hre.network.name)
            if (onchainReceiver === receiver) {
                console.log(`fee receiver no update`);
                return;
            }
            await feeService.setFeeReceiver(receiver).send();
            console.log(
                `Update chain [${hre.network.name}] fee receiver [${onchainReceiver}] => ${await feeService.feeReceiver().call()}`,
            );
        } else {
            let onchainReceiver = await feeService.feeReceiver();
            if (onchainReceiver.toLowerCase() === receiver.toLowerCase()) {
                console.log(`fee receiver no update`);
                return;
            }
            await (await feeService.setFeeReceiver(receiver)).wait();
            console.log(
                `Update chain [${hre.network.name}] fee receiver [${onchainReceiver}] => [${await feeService.feeReceiver()}]`,
            );
        }
    });

task("fee:setBaseGasMulti", "set target chain base gas limit")
    .addParam("chain", "target chain id or name")
    .addParam("gas", "base gas limit")
    .addOptionalParam("token", "fee token address", "0x0000000000000000000000000000000000000000", types.string)
    .addOptionalParam("service", "the fee service address", "", types.string)
    .setAction(async (taskArgs, hre) => {
        const accounts = await ethers.getSigners();
        const deployer = accounts[0];
        // console.log("deployer address:", deployer.address);

        let feeService = await getFeeService(hre, taskArgs.service);

        let gasList = taskArgs.gas.split(",");
        let chains = taskArgs.chain.split(",");
        let chainList = [];
        for (let chainNetwork of chains) {
            let chain = await getChain(hre.network.name, chainNetwork);
            chainList.push(chain);
        }

        let updateChainList = [];
        let updateGasList = [];
        if (isTron(hre.network.config.chainId)) {
            for (let i = 0; i < chainList.length; i++) {
                let chain = chainList[i];
                let baseGas = await feeService.baseGas(chain.chainId).call();
                if (baseGas.toString() === gasList[i]) {
                    console.log(`target chain [${chain.name}] base gas limit no update`);
                    continue;
                }
                updateChainList.push(chain.chainId);
                updateGasList.push(gasList[i]);
                console.log(`target chain [${chain.name}] base gas limt [${baseGas.toString()}] => [${gasList[i]}]`);
            }
            if (updateChainList.length > 0) {
                await feeService.setBaseGasMulti(updateChainList, updateGasList).send();
                console.log(`Update chain [${updateChainList}] base gas limit]`);
            }
        } else {
            for (let i = 0; i < chainList.length; i++) {
                let chain = chainList[i];
                let baseGas = await feeService.baseGas(chain.chainId);
                if (baseGas.toString() === gasList[i]) {
                    console.log(`chain [${chain.name}] base gas limit no update`);
                    continue;
                }
                updateChainList.push(chain.chainId);
                updateGasList.push(gasList[i]);
                console.log(`chain [${chain.name}] base gas limt [${baseGas.toString()}] => [${gasList[i]}]`);
            }

            if (updateChainList.length > 0) {
                await feeService.setBaseGasMulti(updateChainList, updateGasList);
                console.log(`Update chain [${updateChainList}] base gas limit`);
            }
        }
    });

task("fee:setTargetPrice", "set chain message fee")
    .addParam("chain", "to chain id", "latest", types.string)
    .addParam("price", "to chain id", "latest", types.string)
    .addOptionalParam("token", "fee token", "0x0000000000000000000000000000000000000000", types.string)
    .addOptionalParam("service", "the fee service address", "", types.string)
    .addOptionalParam("decimals", "the fee service address", "18", types.string)
    .setAction(async (taskArgs, hre) => {
        const accounts = await ethers.getSigners();
        const deployer = accounts[0];
        //console.log("deployer address:", deployer.address);

        let feeService = await getFeeService(hre, taskArgs.service);

        let token = await getToken(hre.network.name, taskArgs.token);
        let priceList = taskArgs.price.split(",");
        let chains = taskArgs.chain.split(",");
        let chainList = [];
        for (let chainNetwork of chains) {
            let chain = await getChain(hre.network.name, chainNetwork);
            chainList.push(chain);
        }

        let updateChainList = [];
        let updatePriceList = [];

        if(taskArgs.service !== "" && taskArgs.decimals !== "18"){
            let tokenDecimals;
            if (isTron(hre.network.config.chainId)){
                tokenDecimals = await feeService.tokenDecimals(token).call();
                tokenDecimals = tokenDecimals.toString();
                if (tokenDecimals === taskArgs.decimals){
                    console.log(`FeeService ${token} decimal is ${taskArgs.decimals} no update`);
                }else{
                    await feeService.setTokenDecimals(token, taskArgs.decimals).send();
                    console.log(`FeeService ${token} decimal update is ${await feeService.tokenDecimals(token).call()}`);
                }
            }else{
                tokenDecimals = await feeService.tokenDecimals(token);
                tokenDecimals = tokenDecimals.toString();
                if (tokenDecimals === taskArgs.decimals){
                    console.log(`FeeService ${token} decimal is ${taskArgs.decimals} no update`);
                }else{
                    await feeService.setTokenDecimals(token, taskArgs.decimals);
                    console.log(`FeeService ${token} decimal update is ${await feeService.tokenDecimals(token)}`);
                }
            }
        }

        if (isTron(hre.network.config.chainId)) {
            for (let i = 0; i < chainList.length; i++) {
                let chain = chainList[i];
                let gasPrice = await feeService.chainGasPrice(chain.chainId, token).call();
                if (gasPrice.toString() === priceList[i]) {
                    console.log(`chain [${chain.name}] token [${taskArgs.token}] gas price no update`);
                    continue;
                }
                updateChainList.push(chain.chainId);
                updatePriceList.push(priceList[i]);
                console.log(
                    `chain [${chain.name}] token [${taskArgs.token}] gas price [${gasPrice}] => [${priceList[i]}]`,
                );
            }
            if (updateChainList.length > 0) {
                await feeService.setChainGasPriceMulti(token, updateChainList, updatePriceList).send();
                console.log(`Update chain [${updateChainList}] token [${taskArgs.token}] gas price`);
            }
        } else {
            for (let i = 0; i < chainList.length; i++) {
                let chain = chainList[i];
                let gasPrice = await feeService.chainGasPrice(chain.chainId, token);
                if (gasPrice.toString() === priceList[i]) {
                    console.log(`chain [${chain.name}] token [${taskArgs.token}] gas price no update`);
                    continue;
                }
                updateChainList.push(chain.chainId);
                updatePriceList.push(priceList[i]);
                console.log(
                    `chain [${chain.name}] token [${taskArgs.token}] gas price [${gasPrice}] => [${priceList[i]}]`,
                );
            }
            if (updateChainList.length > 0) {
                console.log(updateChainList)
                console.log(updatePriceList)
                await feeService.setChainGasPriceMulti(token, updateChainList, updatePriceList,{gasLimit:1000000});
                console.log(`Update chain [${updateChainList}] token [${taskArgs.token}] gas price\n`);
            }
        }
    });

task("fee:update", "update chain message fee")
    .addOptionalParam("service", "the fee service address", "", types.string)
    .setAction(async (taskArgs, hre) => {
        const accounts = await ethers.getSigners();
        const deployer = accounts[0];
        console.log("deployer address:", deployer.address);

        console.log("===== fee receiver ========");
        let feeConfig = await getFeeConfig(hre.network.name);
        // set fee receiver
        await hre.run("fee:setReceiver", {
            receiver: feeConfig.feeRecevier,
            service: taskArgs.service,
        });

        let addChainList = [];
        let addBaseList = [];

        let removeChainList = [];
        let removeBaseList = [];
        let chainList = await getChainList(hre.network.name);
        for (let i = 0; i < chainList.length; i++) {
            if (chainList[i].name === hre.network.name) {
                continue;
            }
            if (feeConfig.nontarget.includes(chainList[i].name)) {
                removeChainList.push(chainList[i].name);
                removeBaseList.push("0");
            } else {
                addChainList.push(chainList[i].name);
                let targetConfig = await getFeeConfig(chainList[i].name);
                addBaseList.push(targetConfig.baseGas.toString());
            }
        }
        // console.log("add list", addChainList);
        console.log("remove list", removeChainList);
        if (removeChainList.length > 0) {
            console.log("===== remove chain ========");
            await hre.run("fee:setBaseGasMulti", {
                chain: removeChainList.toString(),
                gas: removeBaseList.toString(),
                service: taskArgs.service,
            });
        }

        console.log("===== base gas ========");
        await hre.run("fee:setBaseGasMulti", {
            chain: addChainList.toString(),
            gas: addBaseList.toString(),
            service: taskArgs.service,
        });

        console.log("===== gas price ========");
        let fee = await getFee(hre.network.name);
        for (let token in fee) {
            let priceList = [];
            for (let chain of addChainList) {
                let price = ethers.utils.parseUnits(fee[token][chain], 9);
                priceList.push(price.toString());
            }
            await hre.run("fee:setTargetPrice", {
                chain: addChainList.toString(),
                price: priceList.toString(),
                token: token,
                service: taskArgs.service,
            });
        }
        console.log("Update fee success!\n");
    });

task("fee:updateFee", "List fee info")
    .addOptionalParam("fee", "The fee address", "", types.string)
    .addOptionalParam("save", "save fee", false, types.boolean)
    .setAction(async (taskArgs, hre) => {
        let feeList = {};
        let chainList = await getChainList(hre.network.name);
        for (let chain of chainList) {
            feeList[chain.name] = {};
            console.log(chain.name)
            let feeConfig = await getFeeConfig(chain.name);

            let nativePriceList = {};
            let nativePrice = ethers.utils.parseUnits(feeConfig.nativePrice, 6);
            for (let targetChain of chainList) {
                if (chain.name === targetChain.name) {
                    continue;
                }
                if (feeConfig.nontarget.includes(targetChain.name)) {
                    continue;
                }
                let targetFeeConfig = await getFeeConfig(targetChain.name);
                let targetGasPrice = ethers.utils.parseUnits(targetFeeConfig.gasPrice, 9); // gwei
                let targetNativePrice = ethers.utils.parseUnits(targetFeeConfig.nativePrice, 6);
                let price = targetGasPrice.mul(targetNativePrice).div(nativePrice);
                let gPrice = ethers.utils.formatUnits(price, 9);
                nativePriceList[targetChain.name] = gPrice;
            }
            feeList[chain.name]["native"] = nativePriceList;
        }

        if (taskArgs.save) {
            await saveFeeList(hre.network.name, feeList);
        } else {
            console.log(feeList);
        }
    });

task("fee:list", "List fee info")
    .addOptionalParam("service", "the fee service address", "", types.string)
    .setAction(async (taskArgs, hre) => {
        let feeService = await getFeeService(hre, taskArgs.service);

        // console.log("owner:\t", await feeService.owner());
        console.log("feeService receiver:\t", await feeService.feeReceiver());

        console.log("fees:");
        let chains = await getChainList(hre.network.name);
        for (let i = 0; i < chains.length; i++) {
            let chainId = chains[i].chainId;
            let baseFee = await feeService.baseGas(chainId);
            if (!baseFee.eq(0)) {
                let price = await feeService.chainGasPrice(chainId, ethers.constants.AddressZero);

                let fee = await feeService.getServiceMessageFee(chainId, ethers.constants.AddressZero, 1000000);

                let nativeFee = ethers.utils.formatUnits(fee[0], "ether");
                console.log(
                    `${chains[i].name} (${chainId}) \t base fee [${baseFee}] gas price [${price}]\t fee [${nativeFee}] when limit [1,000,000]`,
                );
            }
        }
        console.log("");
    });
