import {Contract, ethers} from "ethers";
import deploy_config from "./config";
import MOSRelayMetadata from "../../evmv2/artifacts/contracts/MAPOmnichainServiceRelayV2.sol/MAPOmnichainServiceRelayV2.json";
import MOSEVMMetadata from "../../evmv2/artifacts/contracts/MAPOmnichainServiceV2.sol/MAPOmnichainServiceV2.json";
import TokenRegisterMetadata from "../../evmv2/artifacts/contracts/TokenRegisterV2.sol/TokenRegisterV2.json";
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
    const mosRelayContract = await deployMOSRelay(mapChainId);
    const mosEVMContract = await deployMOSEVM(bscChainId);
    const tokenRegisterContract = await deployTokenRegister(mapChainId);
    const [mosAccountId, masterAccount] = await deployNearMcs(nearChainId, network);
    console.log(`
        mos relay address: ${mosRelayContract.address}\n
        token register address: ${tokenRegisterContract.address}\n
        \n
        mos bsc, address: ${mosEVMContract.address}\n
        mos near address: ${mosAccountId}\n
        
    `)
    /**
     * initialize mos relay
     */
    console.log("initialize mos contracts")
    // @ts-ignore
    await mosRelayContract.initialize(deploy_config.namedAccounts.wcoin[mapChainId], deploy_config.namedAccounts.lightclient[mapChainId])
    console.log("set token register")
    await mosRelayContract.setTokenManager(tokenRegisterContract.address);
    console.log("register chain")
    await mosRelayContract.registerChain(bscChainId, mosEVMContract.address, 1);
    /**
     * initialize eth
     */
    console.log("initialize evm mos")
    // @ts-ignore
    await mosEVMContract.initialize(deploy_config.namedAccounts.wcoin[bscChainId], deploy_config.namedAccounts.lightclient[bscChainId])
    await mosEVMContract.setRelayContract(mapChainId, mosRelayContract.address);


    /**
     * initialize near
     */
    console.log("initialize near mos")
    const contract = new NearContract(
        masterAccount,
        mosAccountId,
        {
            viewMethods: [],
            changeMethods: ["init"]
        }
    )
    // @ts-ignore
    await contract.init(
        {
            // @ts-ignore
            "map_light_client": deploy_config.namedAccounts.lightclient[mapChainId],
            "map_bridge_address": mosRelayContract.address,
            // @ts-ignore
            "owner": deploy_config.namedAccounts.deployer[nearChainId],
            // @ts-ignore
            "wrapped_token": deploy_config.namedAccounts.wcoin[nearChainId],
            "near_chain_id": nearChainId.toString(),
            "map_chain_id": mapChainId.toString()
        },
        "80000000000000"
    )

    const deploymentData: any = {};
    deploymentData.tokenRegister = tokenRegisterContract.address;
    deploymentData.ethmos = mosEVMContract.address;
    deploymentData.mapmos = mosRelayContract.address;
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
    // new mos account id
    const mosAccountId = "mos" + Date.now() + "." + masterAccountId;
    // set up new mos account key
    const mosKeyPair = KeyPair.fromRandom("ed25519");
    // set new mos account key store
    await nearConnectionConfig.keyStore.setKey(networkId, mosAccountId, mosKeyPair);
    // create new mos account
    await masterAccount.createAccount(mosAccountId, mosKeyPair.getPublicKey(), new BN(utils.format.parseNearAmount("40")!, 10));
    // connect to new mos account
    const mosAccount = await nearConnection.account(mosAccountId);
    // deploy contract from newly created mos account
    const response = await mosAccount.deployContract(fs.readFileSync('../near/scripts/res/mcs.wasm'));

    // console.log(response);
    return [mosAccountId, masterAccount] as const
}
async function deployMOSRelay(chainId: number): Promise<Contract> {
    // @ts-ignore
    const rpcUrl: string = deploy_config.networks[chainId].url;
    // @ts-ignore
    const pk: string = deploy_config.networks[chainId].accounts[0];

    const mapProvider = new ethers.providers.JsonRpcProvider(rpcUrl, chainId);
    const mapSigner = new ethers.Wallet(pk, mapProvider);

    const factory = new ethers.ContractFactory(MOSRelayMetadata.abi, MOSRelayMetadata.bytecode, mapSigner)
    let contract = await factory.deploy();
    contract  = await contract.deployed();

    console.log("mos relay contract is deployed at ", contract.address);
    return contract;
}

async function deployMOSEVM(chainId: number): Promise<Contract> {
    // @ts-ignore
    const rpcUrl: string = deploy_config.networks[chainId].url;
    // @ts-ignore
    const pk: string = deploy_config.networks[chainId].accounts[0];

    const ethProvider = new ethers.providers.JsonRpcProvider(rpcUrl, chainId);
    const ethSigner = new ethers.Wallet(pk, ethProvider);

    const factory = new ethers.ContractFactory(MOSEVMMetadata.abi, MOSEVMMetadata.bytecode, ethSigner)
    let contract = await factory.deploy();
    contract  = await contract.deployed();

    console.log("mos evm contract is deployed on : " + chainId, contract.address);
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
console.log("deploy mos on", network)
main(network)
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });