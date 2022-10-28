import deploy_config from "./config";
import {Contract, ethers} from "ethers";
import MAPVaultTokenMetadata from "../../evm/artifacts/contracts/vault/MAPVaultToken.sol/MAPVaultToken.json"
import FeeCenterMetadata from "../../evm/artifacts/contracts/FeeCenter.sol/FeeCenter.json";
import DEPLOYED_ADDRESS from '../deployment/deployed_address.json'
async function main(tokenAddress: string, network: string) {

    let chainId: number;
    if(network === 'testnet') {
        chainId = 212;
    } else if (network === 'mainnet') {
        chainId = 27767;
    } else {
        throw new Error("Unsupported network")
    }

    // @ts-ignore
    const rpcUrl: string = deploy_config.networks[chainId].url;
    // @ts-ignore
    const pk: string = deploy_config.networks[chainId].accounts[0];

    const mapProvider = new ethers.providers.JsonRpcProvider(rpcUrl, chainId);
    const mapSigner = new ethers.Wallet(pk, mapProvider);

    // check
    const feeCenter = new ethers.Contract(DEPLOYED_ADDRESS.feeCenter, FeeCenterMetadata.abi, mapSigner)
    const currentVaultAddress = await feeCenter.getVaultToken(tokenAddress)
    if (currentVaultAddress != ethers.constants.AddressZero) {
        throw new Error(`token ${tokenAddress} is already assign to vault ${currentVaultAddress}`)
    }

    // deploy map vault token contract
    const factory = new ethers.ContractFactory(MAPVaultTokenMetadata.abi, MAPVaultTokenMetadata.bytecode, mapSigner);
    let contract = await factory.deploy();
    contract = await contract.deployed();

    // initialize
    const abi = [
        // Read-Only Functions
        "function decimals() view returns (uint8)",
        "function symbol() view returns (string)",
        "function name() view returns (string)",
    ];
    const tokenContract = new Contract(tokenAddress, abi, mapSigner);
    const name = await tokenContract.name();
    const symbol = await tokenContract.symbol();
    const decimals: number = await tokenContract.decimals();

    contract.initialize(tokenAddress, name, symbol, decimals);
    console.log(`
    name: ${name} 
    symbol: ${symbol}
    decimal: ${decimals}
    address: ${tokenAddress}
    
    vault address: ${contract.address}
    `)
    await feeCenter.setTokenVault(tokenAddress, contract.address)
}

const tokenAddress: string = process.argv[2]!.toString();
const network: string = process.argv[3]!.toString();
console.log("deploy mcs on", network)
main(tokenAddress, network)
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });