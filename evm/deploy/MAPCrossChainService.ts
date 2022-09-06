import '@nomiclabs/hardhat-ethers'
import { Contract } from 'ethers';
import {DeployFunction} from 'hardhat-deploy/types';
import {HardhatRuntimeEnvironment} from 'hardhat/types';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const {deployments, getNamedAccounts} = hre;

  const {deploy} = deployments;
  const {deployer, wcoin, mapcoin, lightclient} = await getNamedAccounts();

  console.log("namedAccounts: ", await getNamedAccounts());

  await deploy('MapCrossChainService', {
      from: deployer,
      args: [],
      log: true,
      contract: 'MapCrossChainService',
  })


  let mcs: Contract = await hre.ethers.getContract('MapCrossChainService');

  console.log("MapCrossChainService address:",mcs.address);

  // await (await mcs.initialize(wcoin, mapcoin, lightclient)).wait();
  await (await mcs.setBridge("0x03e148c46f3704F81991ad11AC9A84970b965e81", 1)).wait();
  await (await mcs.setCanBridgeToken("0x0000000000000000000000000000000000000000", 212, true)).wait();
  await (await mcs.setCanBridgeToken("0xE1b2b81B66150F9EF5A89dC346a7A8B8df05d847", 34434, true)).wait();

}


func.tags = ['MCS'];
export default func;
