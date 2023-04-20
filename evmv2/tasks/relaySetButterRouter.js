module.exports = async (taskArgs,hre) => {
    const accounts = await ethers.getSigners()
    const deployer = accounts[0];

    console.log("deployer address:",deployer.address);

    let proxy = await hre.deployments.get("MAPOmnichainServiceProxyV2");

    console.log("relay address", proxy.address);

    let mos = await ethers.getContractAt('MAPOmnichainServiceRelayV2', proxy.address);

    await (await mos.connect(deployer).setButterRouterAddress(taskArgs.router)).wait();

    console.log(`relay set butter router to ${taskArgs.router} `);

}