const { ethers } = require("hardhat");
const { expect } = require("chai");
const mosData = require("./mosData");
require("solidity-coverage");
const { BigNumber } = require("ethers");

describe("Authority start test", function () {
    let owner;
    let addr1;
    let addr2;
    let addr3;

    let MOSS;
    let mos;
    let impl;
    let Wrapped;
    let wrapped;
    let LightNode;
    let lightNode;
    let authority;
    let addControlRole = ethers.utils.keccak256("0x01");
    let mos_control_role = ethers.utils.keccak256("0x02");
    const abi = ethers.utils.defaultAbiCoder;

    beforeEach(async function () {
        [owner, addr1, addr2, addr3] = await ethers.getSigners();
        MOSS = await ethers.getContractFactory("MAPOmnichainServiceV2");
        impl = await MOSS.deploy();

        Wrapped = await ethers.getContractFactory("Wrapped");
        wrapped = await Wrapped.deploy();

        LightNode = await ethers.getContractFactory("LightNode");
        lightNode = await LightNode.deploy();

        let Authority = await ethers.getContractFactory("Authority");
        authority = await Authority.deploy(owner.address);

        let initData = MOSS.interface.encodeFunctionData("initialize", [
            wrapped.address,
            lightNode.address,
            owner.address,
        ]);
        let MAPOmnichainServiceProxyV2 = await ethers.getContractFactory("MAPOmnichainServiceProxyV2");
        let proxy = await MAPOmnichainServiceProxyV2.deploy(impl.address, initData);
        mos = MOSS.attach(proxy.address);

        await mos.connect(owner).changeAdmin(authority.address);
    });

    it("constract deploy init", async function () {
        expect(await mos.lightNode()).to.be.eq(lightNode.address);
        expect(await mos.wToken()).to.be.eq(wrapped.address);
        expect(await mos.getAdmin()).to.be.eq(authority.address);
        expect(await mos.getImplementation()).to.be.eq(impl.address);
        expect(await authority.hasRole(await authority.DEFAULT_ADMIN_ROLE(), owner.address)).to.be.true;
        expect(await authority.hasRole(await authority.DEFAULT_ADMIN_ROLE(), addr1.address)).to.be.false;
    });

    it("addControl", async function () {
        let missing_defualt_admin_role =
            "AccessControl: account 0x70997970c51812dc3a010c7d01b50e0d17dc79c8 is missing role 0x0000000000000000000000000000000000000000000000000000000000000000";
        let func = MOSS.interface.getSighash("setLightClient");
        await expect(authority.connect(addr1).addControl(mos.address, func, addControlRole)).to.be.revertedWith(
            missing_defualt_admin_role
        );
        await expect(authority.connect(owner).addControl(mos.address, func, addControlRole)).to.emit(
            authority,
            "AddControl"
        );
        let func1 = authority.interface.getSighash("addControl");
        await authority.connect(owner).addControl(authority.address, func1, addControlRole);
        let missing_add_control_role =
            "AccessControl: account 0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266 is missing role 0x5fe7f977e71dba2ea1a68e21057beebb9be2ac30c6410aa38d4f3fbe41dcffd2";
        expect(await authority.isAuthorized(owner.address, authority.address, func1)).to.be.false;
        await expect(authority.connect(owner).addControl(mos.address, func, addControlRole)).to.be.revertedWith(
            missing_add_control_role
        );
        await authority.grantRole(addControlRole, addr1.address);
        expect(await authority.isAuthorized(addr1.address, authority.address, func1)).to.be.true;
        await expect(authority.connect(addr1).addControl(authority.address, func1, addControlRole)).to.emit(
            authority,
            "AddControl"
        );
    });

    it("execute", async function () {
        let missing_mos_control_role =
            "AccessControl: account 0x70997970c51812dc3a010c7d01b50e0d17dc79c8 is missing role 0xf2ee15ea639b73fa3db9b34a245bdfa015c260c598b211bf05a1ecc4b3e3b4f2";
        let func = MOSS.interface.getSighash("setLightClient");
        await authority.connect(owner).addControl(mos.address, func, mos_control_role);
        expect(await authority.isAuthorized(addr1.address, mos.address, func)).to.be.false;

        // setLightClient
        let playload = MOSS.interface.encodeFunctionData("setLightClient", [addr2.address]);
        await expect(authority.connect(addr1).execute(mos.address, 0, playload)).to.be.revertedWith(
            missing_mos_control_role
        );
        await authority.grantRole(mos_control_role, addr1.address);
        expect(await authority.isAuthorized(addr1.address, mos.address, func)).to.be.true;
        await expect(authority.connect(addr1).execute(mos.address, 0, playload)).to.emit(authority, "Execute");
        expect(await mos.lightNode()).to.be.eq(addr2.address);

        //upgradeTo
        MOSS = await ethers.getContractFactory("MAPOmnichainServiceV2");
        let impl1 = await MOSS.deploy();
        let func1 = MOSS.interface.getSighash("upgradeTo");
        await authority.connect(owner).addControl(mos.address, func1, mos_control_role);
        let playload1 = MOSS.interface.encodeFunctionData("upgradeTo", [impl1.address]);
        await expect(authority.connect(addr1).execute(mos.address, 0, playload1)).to.emit(authority, "Execute");
        expect(await mos.getImplementation()).to.be.eq(impl1.address);

        //addMintableToken
        let MintableToken = await ethers.getContractFactory("MintableToken");
        let token1 = await MintableToken.deploy("Token1", "T1", 18);
        let token2 = await MintableToken.deploy("Token2", "T2", 18);
        let func2 = MOSS.interface.getSighash("addMintableToken");
        await authority.connect(owner).addControl(mos.address, func2, mos_control_role);
        let playload2 = MOSS.interface.encodeFunctionData("addMintableToken", [[token1.address, token2.address]]);
        await expect(authority.connect(addr1).execute(mos.address, 0, playload2)).to.emit(authority, "Execute");
        expect(await mos.mintableTokens(token1.address)).to.be.true;
        expect(await mos.mintableTokens(token2.address)).to.be.true;

        //removeMintableToken
        let func3 = MOSS.interface.getSighash("removeMintableToken");
        await authority.connect(owner).addControl(mos.address, func3, mos_control_role);
        let playload3 = MOSS.interface.encodeFunctionData("removeMintableToken", [[token1.address, token2.address]]);
        await expect(authority.connect(addr1).execute(mos.address, 0, playload3)).to.emit(authority, "Execute");
        expect(await mos.mintableTokens(token1.address)).to.be.false;
        expect(await mos.mintableTokens(token2.address)).to.be.false;

        //registerToken
        let func4 = MOSS.interface.getSighash("registerToken");
        await authority.connect(owner).addControl(mos.address, func4, mos_control_role);
        let playload4 = MOSS.interface.encodeFunctionData("registerToken", [token1.address, 97, true]);
        await expect(authority.connect(addr1).execute(mos.address, 0, playload4)).to.emit(authority, "Execute");
        expect(await mos.isBridgeable(token1.address, 97)).to.be.true;

        //setRelayContract
        let func5 = MOSS.interface.getSighash("setRelayContract");
        await authority.connect(owner).addControl(mos.address, func5, mos_control_role);
        let playload5 = MOSS.interface.encodeFunctionData("setRelayContract", [212, token2.address]);
        await expect(authority.connect(addr1).execute(mos.address, 0, playload5)).to.emit(authority, "Execute");
        expect(await mos.relayContract()).to.be.eq(token2.address);
        expect(await mos.relayChainId()).to.be.eq(212);

        //changeAdmin
        let func6 = MOSS.interface.getSighash("changeAdmin");
        await authority.connect(owner).addControl(mos.address, func6, mos_control_role);
        let playload6 = MOSS.interface.encodeFunctionData("changeAdmin", [addr3.address]);
        await expect(authority.connect(addr1).execute(mos.address, 0, playload6)).to.emit(authority, "Execute");
        expect(await mos.getAdmin()).to.be.eq(addr3.address);
    });
});
