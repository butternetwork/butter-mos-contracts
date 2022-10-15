import '@nomiclabs/hardhat-ethers'
import { Contract } from 'ethers';
import {DeployFunction} from 'hardhat-deploy/types';
import {HardhatRuntimeEnvironment} from 'hardhat/types';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const {deployments, getNamedAccounts} = hre;

  const {deploy} = deployments;
  const {deployer, wcoin, mapcoin, lightclient} = await getNamedAccounts();

  console.log("namedAccounts: ", await getNamedAccounts());

  await deploy('FeeCenter', {
    from: deployer,
    args: [],
    log: true,
    contract: 'FeeCenter',
  })

  await deploy('MAPCrossChainServiceRelay', {
      from: deployer,
      args: [],
      log: true,
      contract: 'MAPCrossChainServiceRelay',
  })

  await deploy('TokenRegister', {
      from: deployer,
      args: [],
      log: true,
      contract: 'TokenRegister',
  })

  let mcsRelay: Contract = await hre.ethers.getContract('MAPCrossChainServiceRelay');
  let feeCenter: Contract = await hre.ethers.getContract('FeeCenter');
  let tokenRegister: Contract = await hre.ethers.getContract('TokenRegister');

  console.log("MAPCrossChainServiceRelay address:"+mcsRelay.address);
  console.log("feeCenter address:",feeCenter.address);
  console.log("tokenRegister address :",tokenRegister.address);
  //
  // await (await mcsRelay.initialize(wcoin, mapcoin, lightclient)).wait();
  // await (await mcsRelay.setFeeCenter(feeCenter.address)).wait();
  // await (await mcsRelay.setTokenRegister(tokenRegister.address)).wait();
  // await (await mcsRelay.setTokenOtherChainDecimals(mapcoin, 212, 18)).wait();
  // await (await mcsRelay.setTokenOtherChainDecimals(wcoin, 212, 18)).wait();
  // // await (await mcsRelay.setTokenOtherChainDecimals("0x7F3e86D38Eb0281a3Acc0Fa5Fe09a420ccE519aD", 212, 18)).wait();
  // // await (await mcsRelay.setTokenOtherChainDecimals("0xAC35D87EfcA068c9dcEf65f89937B7593fA03d37", 212, 18)).wait(); // BNear Token
  // // await (await mcsRelay.setTokenOtherChainDecimals("0xAC35D87EfcA068c9dcEf65f89937B7593fA03d37", 1313161555, 18)).wait(); // BNear Token
  // // await (await mcsRelay.setTokenOtherChainDecimals(mapcoin, 34434, 18)).wait();
  //
  // await (await mcsRelay.setVaultBalance(34434, mapcoin, "100000000000000000000000000000")).wait();
  // await (await mcsRelay.setVaultBalance(34434, wcoin, "100000000000000000000000000000")).wait();
  // await (await mcsRelay.setIdTable(1313161555, 1)).wait();
  //
  // // await (await feeCenter.setChainTokenGasFee(34434, wcoin, "10000000000000000","10000000000000000000",200)).wait();
  // await (await feeCenter.setDistributeRate(0, deployer, 10000)).wait();
  // await (await feeCenter.setDistributeRate(1, deployer, 10000)).wait();

  // await (await tokenRegister.regToken(
  //   34434,
  //   "0xE1b2b81B66150F9EF5A89dC346a7A8B8df05d847",
  //   "0x0000000000000000000000000000000000000000"
  // )).wait();

  // await (await mcsRelay.setBridgeAddress(34434, "0x2A73b5736f71BdCb888DE1d444682b3abA62d969")).wait();
  // await (await mcsRelay.setLightClientManager("0x3174b169Faa275244cA308a6f939CaB5502BA841")).wait();

}

func.tags = ['MCSRelay'];
export default func;
