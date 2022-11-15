import {Contract, ethers} from "ethers";
import deploy_config from "./config";
import MCSRelayMetadata from "../../evm/artifacts/contracts/MAPCrossChainServiceRelay.sol/MAPCrossChainServiceRelay.json";
import MCSEVMMetadata from "../../evm/artifacts/contracts/MapCrossChainService.sol/MapCrossChainService.json";
import FeeCenterMetadata from "../../evm/artifacts/contracts/FeeCenter.sol/FeeCenter.json";
import TokenRegisterMetadata from "../../evm/artifacts/contracts/TokenRegister.sol/TokenRegister.json";
import * as net from "net";
import {connect, KeyPair, keyStores, utils, Contract as NearContract, Account} from "near-api-js";
import * as fs from "fs";
import * as path from "path";
import BN from "bn.js";
import {FinalExecutionOutcome} from "near-api-js/lib/providers";
import {readFileSync}  from 'fs'
import {join} from "path";
const MAP_TEST_CHAIN_ID = 212;
const BSC_TESTNET_CHAIN_ID = 97;
const NEAR_TEST_CHAIN_ID = 1313161555;
const MAP_MAIN_CHAIN_ID = 27767;
const ETH_MAIN_CHAIN_ID = 1;
const NEAR_MAIN_CHAIN_ID = 1313161556;

async function main(network: string) {
    let mapChainId, bscChainId, nearChainId: number;
    if (network === 'testnet') {
        mapChainId = MAP_TEST_CHAIN_ID;
        bscChainId = BSC_TESTNET_CHAIN_ID;
        nearChainId = NEAR_TEST_CHAIN_ID;
    } else if (network === 'mainnet') {
        mapChainId = MAP_MAIN_CHAIN_ID;
        bscChainId = BSC_TESTNET_CHAIN_ID;
        nearChainId = NEAR_MAIN_CHAIN_ID;
    } else {
        throw new Error(`network: ${network} is not supported yet`);
    }

    /**
     * deploy all contracts
     */
    const mcsRelayContract = await deployMCSRelay(mapChainId);
    const mcsEVMContract = await deployMCSEVM(bscChainId);
    const feeCenterContract = await deployFeeCenter(mapChainId);
    const tokenRegisterContract = await deployTokenRegister(mapChainId);
    const [mcsAccountId, masterAccount] = await deployNearMcs(nearChainId, network);
    console.log(`
        mcs relay address: ${mcsRelayContract.address}\n
        fee center address: ${feeCenterContract.address}\n
        token register address: ${tokenRegisterContract.address}\n
        \n
        mcs bsc, address: ${mcsEVMContract.address}\n
        mcs near address: ${mcsAccountId}\n
        
    `)
    /**
     * initialize mcs relay
     */
    console.log("initialize mcs contracts")
    // @ts-ignore
    await mcsRelayContract.initialize(deploy_config.namedAccounts.wcoin[mapChainId], deploy_config.namedAccounts.mapcoin[mapChainId], deploy_config.namedAccounts.lightclient[mapChainId])
    console.log("set fee center")
    await mcsRelayContract.setFeeCenter(feeCenterContract.address);
    console.log("set token register")
    await mcsRelayContract.setTokenRegister(tokenRegisterContract.address);
    console.log("set bridge address")
    await mcsRelayContract.setBridgeAddress(bscChainId, mcsEVMContract.address);
    /**
     * initialize eth
     */
    console.log("initialize evm mcs")
    // @ts-ignore
    await mcsEVMContract.initialize(deploy_config.namedAccounts.wcoin[bscChainId], deploy_config.namedAccounts.mapcoin[bscChainId], deploy_config.namedAccounts.lightclient[bscChainId])
    await mcsEVMContract.setBridge(mcsRelayContract.address, mapChainId);


    /**
     * initialize near
     */
    console.log("initialize near mcs")
    const contract = new NearContract(
        masterAccount,
        mcsAccountId,
        {
            viewMethods: [],
            changeMethods: ["init"]
        }
    )
    // @ts-ignore
    await contract.init(
        {
            // @ts-ignore
            "map_light_client": deploy_config.namedAccounts.lightclient[nearChainId],
            "map_bridge_address": '1902347e9CCC4e4aa0cf0b19844bf528f0031642',
            // @ts-ignore
            "owner": deploy_config.namedAccounts.deployer[nearChainId],
            // @ts-ignore
            "wrapped_token": deploy_config.namedAccounts.wcoin[nearChainId],
            "near_chain_id": nearChainId,
        },
        "80000000000000"
    )

    const deploymentData: any = {};
    deploymentData.feeCenter = feeCenterContract.address;
    deploymentData.tokenRegister = tokenRegisterContract.address;
    deploymentData.ethmcs = mcsEVMContract.address;
    deploymentData.mapmcs = mcsRelayContract.address;
    fs.writeFileSync(join("deployment", 'deployed_address.json'), JSON.stringify(deploymentData))


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
    // connect master account
    const masterAccount = await nearConnection.account(masterAccountId)
    // new mcs account id
    const mcsAccountId = "mcs" + Date.now() + "." + masterAccountId;
    // set up new mcs account key
    const mcsKeyPair = KeyPair.fromRandom("ed25519");
    // set new mcs account key store
    await nearConnectionConfig.keyStore.setKey(networkId, mcsAccountId, mcsKeyPair);
    // create new mcs account
    await masterAccount.createAccount(mcsAccountId, mcsKeyPair.getPublicKey(), new BN(utils.format.parseNearAmount("40")!, 10));
    // connect to new mcs account
    const mcsAccount = await nearConnection.account(mcsAccountId);
    // deploy contract from newly created mcs account
    const response = await mcsAccount.deployContract(fs.readFileSync('../near/scripts/res/mcs.wasm'));

    // console.log(response);
    return [mcsAccountId, masterAccount] as const
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

async function deployMCSEVM(chainId: number): Promise<Contract> {
    // @ts-ignore
    const rpcUrl: string = deploy_config.networks[chainId].url;
    // @ts-ignore
    const pk: string = deploy_config.networks[chainId].accounts[0];

    const ethProvider = new ethers.providers.JsonRpcProvider(rpcUrl, chainId);
    const ethSigner = new ethers.Wallet(pk, ethProvider);

    const factory = new ethers.ContractFactory(MCSEVMMetadata.abi, MCSEVMMetadata.bytecode, ethSigner)
    let contract = await factory.deploy();
    contract  = await contract.deployed();

    console.log("mcs evm contract is deployed on : " + chainId, contract.address);
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