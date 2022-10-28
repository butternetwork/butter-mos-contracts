import * as fs from "fs";
import {join} from 'path';
async function main() {
    const deploymentData: any = {};
    deploymentData.feeCenter = 'feeCenterContract.address';
    deploymentData.tokenRegister = 'tokenRegisterContract.address';
    deploymentData.ethmcs = 'mcsEthContract.address';
    deploymentData.mapmcs = 'mcsRelayContract.address';

    fs.writeFileSync(join("deployment", 'deployed_address.json'), JSON.stringify(deploymentData))
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });