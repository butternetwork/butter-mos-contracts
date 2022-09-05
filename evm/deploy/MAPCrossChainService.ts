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
  await (await mcs.setBridge("0x0118Cb5811AFC492D2fcB94daC5C89fBc92E4d70", 1)).wait();
  await (await mcs.setCanBridgeToken("0x0000000000000000000000000000000000000000", 212, true)).wait();

}


func.tags = ['MCS'];
export default func;
