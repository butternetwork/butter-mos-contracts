import {Contract, ethers} from "ethers";
import deploy_config from "./config";
import MCSRelayMetadata from "../../evm/artifacts/contracts/MAPCrossChainServiceRelay.sol/MAPCrossChainServiceRelay.json";
import MCSEVMMetadata from "../../evm/artifacts/contracts/MapCrossChainService.sol/MapCrossChainService.json";
import FeeCenterMetadata from "../../evm/artifacts/contracts/FeeCenter.sol/FeeCenter.json";
import TokenRegisterMetadata from "../../evm/artifacts/contracts/TokenRegister.sol/TokenRegister.json";
import * as net from "net";
import {connect, KeyPair, keyStores, utils} from "near-api-js";
import * as fs from "fs";
import * as path from "path";
import BN from "bn.js";

const MAP_TEST_CHAIN_ID = 212;
const ETH_TEST_CHAIN_ID = 34434;
const NEAR_TEST_CHAIN_ID = 1313161555;
const MAP_MAIN_CHAIN_ID = 27767;
const ETH_MAIN_CHAIN_ID = 1;
const NEAR_MAIN_CHAIN_ID = 1313161556;

async function main(network: string) {
    let mapChainId, ethChainId, nearChainId: number;
    if (network === 'testnet') {
        mapChainId = MAP_TEST_CHAIN_ID;
        ethChainId = ETH_TEST_CHAIN_ID;
        nearChainId = NEAR_TEST_CHAIN_ID;
    } else if (network === 'mainnet') {
        mapChainId = MAP_MAIN_CHAIN_ID;
        ethChainId = ETH_MAIN_CHAIN_ID;
        nearChainId = NEAR_MAIN_CHAIN_ID;
    } else {
        throw new Error(`network: ${network} is not supported yet`);
    }
    //
    // const mcsRelayContract = await deployMCSRelay(mapChainId);
    // const mcsEthContract = await deployMCSETH(ethChainId);
    // const feeCenterContract = await deployFeeCenter(mapChainId);
    // const tokenRegisterContract = await deployTokenRegister(mapChainId);
    //
    // // initialize
    // console.log("initialize mcs contracts")
    //
    // console.log("initialize relay")
    // // @ts-ignore
    // await mcsRelayContract.initialize(deploy_config.namedAccounts.wcoin[mapChainId], deploy_config.namedAccounts.mapcoin[mapChainId], deploy_config.namedAccounts.lightclient[mapChainId])
    // console.log("set fee center")
    // await mcsRelayContract.setFeeCenter(feeCenterContract.address);
    // console.log("set token register")
    // await mcsRelayContract.setTokenRegister(tokenRegisterContract.address);
    // console.log("set bridge address")
    // await mcsRelayContract.setBridgeAddress(ethChainId, mcsEthContract.address);
    //
    // // @ts-ignore
    // await mcsEthContract.initialize(deploy_config.namedAccounts.wcoin[ethChainId], deploy_config.namedAccounts.mapcoin[ethChainId], deploy_config.namedAccounts.lightclient[ethChainId])
    // await mcsEthContract.setBridge(mcsRelayContract.address, mapChainId);

    console.log("deploy near mcs")
    await deployNearMcs(nearChainId, network);

    console.log("finished")

}
async function deployNearMcs(chainId: number, networkId: string) {
    const nearConnectionConfig = {
        networkId: network,
        // @ts-ignore
        keyStore: deploy_config.networks[chainId].keyStore,
        // @ts-ignore
        nodeUrl: deploy_config.networks[chainId].url,
    }
    const nearConnection = await connect(nearConnectionConfig);

    // @ts-ignore
    const masterAccountId = deploy_config.namedAccounts.deployer[chainId];
    const masterAccount = await nearConnection.account(masterAccountId)
    const mcsAccountId = "mcs04." + masterAccountId;
    const mcsKeyPair = KeyPair.fromRandom("ed25519");
    await nearConnectionConfig.keyStore.setKey(networkId, mcsAccountId, mcsKeyPair);

    await masterAccount.createAccount(mcsAccountId, mcsKeyPair.getPublicKey(), new BN(utils.format.parseNearAmount("40")!, 10));

    const mcsAccount = await nearConnection.account(mcsAccountId);
    console.log("mcs account", mcsAccount)
    const response = await mcsAccount.deployContract(fs.readFileSync('../near/scripts/res/mcs.wasm'));
    console.log(response);
}
async function deployMCSRelay(chainId: number): Promise<Contract> {
    // @ts-ignore
    const rpcUrl: string = deploy_config.networks[chainId].url;
    // @ts-ignore
    const pk: string = deploy_config.networks[chainId].accounts[0];

    const mapProvider = new ethers.providers.JsonRpcProvider(rpcUrl, chainId);
    const mapSigner = new ethers.Wallet(pk, mapProvider);

    const factory = new ethers.ContractFactory(MCSRelayMetadata.abi, MCSRelayMetadata.bytecode, mapSigner)
    let contract = await factory.deploy();
    contract  = await contract.deployed();

    console.log("mcs relay contract is deployed at ", contract.address);
    return contract;
}

async function deployMCSETH(chainId: number): Promise<Contract> {
    // @ts-ignore
    const rpcUrl: string = deploy_config.networks[chainId].url;
    // @ts-ignore
    const pk: string = deploy_config.networks[chainId].accounts[0];

    const ethProvider = new ethers.providers.JsonRpcProvider(rpcUrl, chainId);
    const ethSigner = new ethers.Wallet(pk, ethProvider);

    const factory = new ethers.ContractFactory(MCSEVMMetadata.abi, MCSEVMMetadata.bytecode, ethSigner)
    let contract = await factory.deploy();
    contract  = await contract.deployed();

    console.log("mcs eth contract is deployed: ", contract.address);
    return contract;
}

async function deployFeeCenter(chainId: number): Promise<Contract> {
    // @ts-ignore
    const rpcUrl: string = deploy_config.networks[chainId].url;
    // @ts-ignore
    const pk: string = deploy_config.networks[chainId].accounts[0];

    const mapProvider = new ethers.providers.JsonRpcProvider(rpcUrl, chainId);
    const mapSigner = new ethers.Wallet(pk, mapProvider);

    const factory = new ethers.ContractFactory(FeeCenterMetadata.abi, FeeCenterMetadata.bytecode, mapSigner)
    let contract = await factory.deploy();
    contract  = await contract.deployed();

    console.log("FeeCenter contract is deployed at ", contract.address);
    return contract;
}

async function deployTokenRegister(chainId: number): Promise<Contract> {
    // @ts-ignore
    const rpcUrl: string = deploy_config.networks[chainId].url;
    // @ts-ignore
    const pk: string = deploy_config.networks[chainId].accounts[0];

    const mapProvider = new ethers.providers.JsonRpcProvider(rpcUrl, chainId);
    const mapSigner = new ethers.Wallet(pk, mapProvider);

    const factory = new ethers.ContractFactory(TokenRegisterMetadata.abi, TokenRegisterMetadata.bytecode, mapSigner)
    let contract = await factory.deploy();
    contract  = await contract.deployed();

    console.log("TokenRegister contract is deployed at ", contract.address);
    return contract;
}

const network: string = process.argv[2]!.toString();
console.log("deploy mcs on", network)
main(network)
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });