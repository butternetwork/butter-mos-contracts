const { ethers, network } = require("hardhat");
const { expect } = require("chai");

describe("emergencyWithdraw", function () {
    const NATIVE = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
    let deployer, other, receiver, wtoken, usdt, authority;

    async function deployProxy(name) {
        const F = await ethers.getContractFactory(name);
        const impl = await F.deploy();
        const data = F.interface.encodeFunctionData("initialize", [wtoken.address, authority.address]);
        const Proxy = await ethers.getContractFactory("OmniServiceProxy");
        const proxy = await Proxy.deploy(impl.address, data);
        return F.attach(proxy.address);
    }

    beforeEach(async function () {
        [deployer, other, receiver] = await ethers.getSigners();
        wtoken = await (await ethers.getContractFactory("WrapedToken")).deploy();
        usdt = await (await ethers.getContractFactory("MockToken")).deploy("USDT", "USDT");
        authority = await (await ethers.getContractFactory("AuthorityManager")).deploy(deployer.address);
    });

    for (const name of ["Bridge", "BridgeAndRelay"]) {
        describe(name, function () {
            let c;
            beforeEach(async function () {
                c = await deployProxy(name);
                // unconfigured selector defaults to ADMIN_ROLE (deployer is admin)
                await usdt.mint(c.address, 1000);
                await network.provider.send("hardhat_setBalance", [c.address, "0x3635C9ADC5DEA00000"]); // 1000 ETH
            });

            it("admin withdraws ERC20", async function () {
                await expect(c.emergencyWithdraw(usdt.address, receiver.address, 600))
                    .to.emit(c, "EmergencyWithdraw")
                    .withArgs(usdt.address, receiver.address, 600);
                expect(await usdt.balanceOf(receiver.address)).to.equal(600);
                expect(await usdt.balanceOf(c.address)).to.equal(400);
            });

            for (const [label, addr] of [["address(0)", ethers.constants.AddressZero], ["0xEeee", NATIVE]]) {
                it(`admin withdraws native via ${label}`, async function () {
                    const amount = ethers.utils.parseEther("5");
                    const before = await ethers.provider.getBalance(receiver.address);
                    await c.emergencyWithdraw(addr, receiver.address, amount);
                    expect((await ethers.provider.getBalance(receiver.address)).sub(before)).to.equal(amount);
                });
            }

            it("works while paused", async function () {
                // pause is restricted; deployer is admin
                await c.trigger();
                expect(await c.paused()).to.equal(true);
                await c.emergencyWithdraw(usdt.address, receiver.address, 1);
                expect(await usdt.balanceOf(receiver.address)).to.equal(1);
            });

            it("rejects non-authorized caller", async function () {
                await expect(
                    c.connect(other).emergencyWithdraw(usdt.address, receiver.address, 1)
                ).to.be.reverted;
            });

            it("rejects zero receiver and zero amount", async function () {
                await expect(c.emergencyWithdraw(usdt.address, ethers.constants.AddressZero, 1)).to.be.reverted;
                await expect(c.emergencyWithdraw(usdt.address, receiver.address, 0)).to.be.reverted;
            });

            it("reverts when balance is insufficient", async function () {
                await expect(c.emergencyWithdraw(usdt.address, receiver.address, 1001)).to.be.reverted;
            });
        });
    }
});
