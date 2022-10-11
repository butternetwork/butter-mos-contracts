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

  await (await mcs.initialize(wcoin, mapcoin, lightclient)).wait();
  await (await mcs.setBridge("0xf0C4f447e361c14F9BF01F9805a78F51FCCb95BB", 212)).wait();

}


func.tags = ['MCS'];
export default func;
