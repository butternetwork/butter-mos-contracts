const { ethers } = require("hardhat");
const { expect } = require("chai");

describe("VaultTokenV3 Tests", function () {
    let vaultToken, underlyingToken, owner, manager, user1, user2, user3;

    beforeEach(async function () {
        [owner, manager, user1, user2, user3] = await ethers.getSigners();

        // Deploy underlying token (USDT-like token)
        const MockToken = await ethers.getContractFactory("MockToken");
        underlyingToken = await MockToken.deploy("Underlying Token", "UNDER");

        // Deploy VaultTokenV3
        const VaultTokenV3 = await ethers.getContractFactory("VaultTokenV3");
        vaultToken = await VaultTokenV3.deploy(
            underlyingToken.address,
            "Vault Token",
            "VAULT"
        );

        // Add manager role
        await vaultToken.addManager(manager.address);
    });

    // ==================== CONSTRUCTOR TESTS ====================
    describe("Constructor Tests", function () {
        it("Should initialize with correct parameters", async function () {
            expect(await vaultToken.name()).to.equal("Vault Token");
            expect(await vaultToken.symbol()).to.equal("VAULT");
            expect(await vaultToken.getTokenAddress()).to.equal(underlyingToken.address);
            expect(await vaultToken.decimals()).to.equal(await underlyingToken.decimals());
            expect(await vaultToken.totalVault()).to.equal(0);
        });

        it("Should grant DEFAULT_ADMIN_ROLE to deployer", async function () {
            const DEFAULT_ADMIN_ROLE = await vaultToken.DEFAULT_ADMIN_ROLE();
            expect(await vaultToken.hasRole(DEFAULT_ADMIN_ROLE, owner.address)).to.be.true;
        });

        it("Should grant MANAGER_ROLE to deployer", async function () {
            const MANAGER_ROLE = await vaultToken.MANAGER_ROLE();
            expect(await vaultToken.hasRole(MANAGER_ROLE, owner.address)).to.be.true;
        });

        it("Should revert with zero underlying address", async function () {
            const VaultTokenV3 = await ethers.getContractFactory("VaultTokenV3");
            await expect(
                VaultTokenV3.deploy(ethers.constants.AddressZero, "Vault Token", "VAULT")
            ).to.be.revertedWith("underlying address is zero");
        });
    });

    // ==================== ROLE MANAGEMENT TESTS ====================
    describe("Role Management Tests", function () {
        it("Should add manager correctly", async function () {
            const MANAGER_ROLE = await vaultToken.MANAGER_ROLE();
            await vaultToken.addManager(user1.address);
            expect(await vaultToken.hasRole(MANAGER_ROLE, user1.address)).to.be.true;
        });

        it("Should remove manager correctly", async function () {
            const MANAGER_ROLE = await vaultToken.MANAGER_ROLE();
            await vaultToken.addManager(user1.address);
            expect(await vaultToken.hasRole(MANAGER_ROLE, user1.address)).to.be.true;
            
            await vaultToken.removeManager(user1.address);
            expect(await vaultToken.hasRole(MANAGER_ROLE, user1.address)).to.be.false;
        });

        it("Should revert when non-admin adds manager", async function () {
            await expect(
                vaultToken.connect(user1).addManager(user2.address)
            ).to.be.revertedWithCustomError(vaultToken, "AccessControlUnauthorizedAccount");
        });

        it("Should revert when non-admin removes manager", async function () {
            await expect(
                vaultToken.connect(user1).removeManager(manager.address)
            ).to.be.revertedWithCustomError(vaultToken, "AccessControlUnauthorizedAccount");
        });
    });

    // ==================== DEPOSIT TESTS ====================
    describe("Deposit Tests", function () {
        it("Should deposit tokens correctly", async function () {
            const amount = ethers.utils.parseEther("100");
            const fromChain = 1;
            
            await vaultToken.connect(manager).deposit(fromChain, amount, user1.address);
            
            expect(await vaultToken.balanceOf(user1.address)).to.equal(amount);
            expect(await vaultToken.totalVault()).to.equal(amount);
            expect(await vaultToken.getVaultByChainId(fromChain)).to.equal(amount);
        });

        it("Should handle multiple deposits from same chain", async function () {
            const amount1 = ethers.utils.parseEther("100");
            const amount2 = ethers.utils.parseEther("50");
            const fromChain = 1;
            
            await vaultToken.connect(manager).deposit(fromChain, amount1, user1.address);
            await vaultToken.connect(manager).deposit(fromChain, amount2, user2.address);
            
            expect(await vaultToken.balanceOf(user1.address)).to.equal(amount1);
            expect(await vaultToken.balanceOf(user2.address)).to.equal(amount2);
            expect(await vaultToken.totalVault()).to.equal(amount1.add(amount2));
            expect(await vaultToken.getVaultByChainId(fromChain)).to.equal(amount1.add(amount2));
        });

        it("Should handle deposits from different chains", async function () {
            const amount1 = ethers.utils.parseEther("100");
            const amount2 = ethers.utils.parseEther("200");
            const chain1 = 1;
            const chain2 = 56;
            
            await vaultToken.connect(manager).deposit(chain1, amount1, user1.address);
            await vaultToken.connect(manager).deposit(chain2, amount2, user2.address);
            
            expect(await vaultToken.getVaultByChainId(chain1)).to.equal(amount1);
            expect(await vaultToken.getVaultByChainId(chain2)).to.equal(amount2);
            expect(await vaultToken.totalVault()).to.equal(amount1.add(amount2));
        });

        it("Should revert when non-manager deposits", async function () {
            const amount = ethers.utils.parseEther("100");
            const fromChain = 1;
            
            await expect(
                vaultToken.connect(user1).deposit(fromChain, amount, user1.address)
            ).to.be.revertedWith("Caller is not a manager");
        });

        it("Should emit DepositVault event", async function () {
            const amount = ethers.utils.parseEther("100");
            const fromChain = 1;
            
            await expect(vaultToken.connect(manager).deposit(fromChain, amount, user1.address))
                .to.emit(vaultToken, "DepositVault")
                .withArgs(underlyingToken.address, user1.address, amount, amount);
        });
    });

    // ==================== WITHDRAW TESTS ====================
    describe("Withdraw Tests", function () {
        beforeEach(async function () {
            // Setup initial deposit
            const amount = ethers.utils.parseEther("100");
            const fromChain = 1;
            await vaultToken.connect(manager).deposit(fromChain, amount, user1.address);
        });

        it("Should withdraw tokens correctly", async function () {
            const vaultAmount = ethers.utils.parseEther("50");
            const toChain = 56;
            
            await vaultToken.connect(manager).withdraw(toChain, vaultAmount, user1.address);
            
            expect(await vaultToken.balanceOf(user1.address)).to.equal(ethers.utils.parseEther("50"));
            expect(await vaultToken.totalVault()).to.equal(ethers.utils.parseEther("50"));
            expect(await vaultToken.getVaultByChainId(toChain)).to.equal(ethers.utils.parseEther("-50"));
        });

        it("Should handle multiple withdrawals", async function () {
            const vaultAmount1 = ethers.utils.parseEther("30");
            const vaultAmount2 = ethers.utils.parseEther("20");
            const toChain = 56;
            
            await vaultToken.connect(manager).withdraw(toChain, vaultAmount1, user1.address);
            await vaultToken.connect(manager).withdraw(toChain, vaultAmount2, user1.address);
            
            expect(await vaultToken.balanceOf(user1.address)).to.equal(ethers.utils.parseEther("50"));
            expect(await vaultToken.totalVault()).to.equal(ethers.utils.parseEther("50"));
            expect(await vaultToken.getVaultByChainId(toChain)).to.equal(ethers.utils.parseEther("-50"));
        });

        it("Should revert when non-manager withdraws", async function () {
            const vaultAmount = ethers.utils.parseEther("50");
            const toChain = 56;
            
            await expect(
                vaultToken.connect(user1).withdraw(toChain, vaultAmount, user1.address)
            ).to.be.revertedWith("Caller is not a manager");
        });

        it("Should emit WithdrawVault event", async function () {
            const vaultAmount = ethers.utils.parseEther("50");
            const toChain = 56;
            
            await expect(vaultToken.connect(manager).withdraw(toChain, vaultAmount, user1.address))
                .to.emit(vaultToken, "WithdrawVault")
                .withArgs(underlyingToken.address, user1.address, vaultAmount, vaultAmount);
        });

        it("Should revert when withdrawing more than balance", async function () {
            const vaultAmount = ethers.utils.parseEther("150"); // More than user has
            const toChain = 56;
            
            await expect(
                vaultToken.connect(manager).withdraw(toChain, vaultAmount, user1.address)
            ).to.be.revertedWithCustomError(vaultToken, "ERC20InsufficientBalance");
        });
    });

    // ==================== TRANSFER TOKEN TESTS ====================
    describe("Transfer Token Tests", function () {
        it("Should transfer tokens between chains correctly", async function () {
            const fromChain = 1;
            const toChain = 56;
            const relayChain = 137;
            const amount = ethers.utils.parseEther("100");
            const outAmount = ethers.utils.parseEther("95");
            const fee = ethers.utils.parseEther("2");
            
            await vaultToken.connect(manager).transferToken(
                fromChain, amount, toChain, outAmount, relayChain, fee
            );
            
            expect(await vaultToken.getVaultByChainId(fromChain)).to.equal(amount);
            expect(await vaultToken.getVaultByChainId(toChain)).to.equal(ethers.utils.parseEther("-95"));
            expect(await vaultToken.totalVault()).to.equal(amount.sub(outAmount).sub(fee));
        });

        it("Should handle transfer with zero fee", async function () {
            const fromChain = 1;
            const toChain = 56;
            const relayChain = 137;
            const amount = ethers.utils.parseEther("100");
            const outAmount = ethers.utils.parseEther("95");
            const fee = 0;
            
            await vaultToken.connect(manager).transferToken(
                fromChain, amount, toChain, outAmount, relayChain, fee
            );
            
            expect(await vaultToken.getVaultByChainId(fromChain)).to.equal(amount);
            expect(await vaultToken.getVaultByChainId(toChain)).to.equal(ethers.utils.parseEther("-95"));
            expect(await vaultToken.totalVault()).to.equal(amount.sub(outAmount));
        });

        it("Should revert when non-manager transfers", async function () {
            const fromChain = 1;
            const toChain = 56;
            const relayChain = 137;
            const amount = ethers.utils.parseEther("100");
            const outAmount = ethers.utils.parseEther("95");
            const fee = ethers.utils.parseEther("2");
            
            await expect(
                vaultToken.connect(user1).transferToken(
                    fromChain, amount, toChain, outAmount, relayChain, fee
                )
            ).to.be.revertedWith("Caller is not a manager");
        });
    });

    // ==================== UPDATE VAULT TESTS ====================
    describe("Update Vault Tests", function () {
        it("Should update vault correctly", async function () {
            const fromChain = 1;
            const toChain = 56;
            const relayChain = 137;
            const amount = ethers.utils.parseEther("100");
            const outAmount = ethers.utils.parseEther("95");
            const vaultFee = ethers.utils.parseEther("3");
            
            await vaultToken.connect(manager).updateVault(
                fromChain, amount, toChain, outAmount, relayChain, vaultFee
            );
            
            expect(await vaultToken.getVaultByChainId(fromChain)).to.equal(amount);
            expect(await vaultToken.getVaultByChainId(toChain)).to.equal(ethers.utils.parseEther("-95"));
            expect(await vaultToken.totalVault()).to.equal(vaultFee);
        });

        it("Should revert when non-manager updates vault", async function () {
            const fromChain = 1;
            const toChain = 56;
            const relayChain = 137;
            const amount = ethers.utils.parseEther("100");
            const outAmount = ethers.utils.parseEther("95");
            const vaultFee = ethers.utils.parseEther("2");
            
            await expect(
                vaultToken.connect(user1).updateVault(
                    fromChain, amount, toChain, outAmount, relayChain, vaultFee
                )
            ).to.be.revertedWith("Caller is not a manager");
        });
    });

    // ==================== VIEW FUNCTION TESTS ====================
    describe("View Function Tests", function () {
        beforeEach(async function () {
            // Setup deposits on multiple chains
            await vaultToken.connect(manager).deposit(1, ethers.utils.parseEther("100"), user1.address);
            await vaultToken.connect(manager).deposit(56, ethers.utils.parseEther("200"), user2.address);
            await vaultToken.connect(manager).deposit(137, ethers.utils.parseEther("300"), user3.address);
        });

        it("Should return correct vault balance by chain ID", async function () {
            expect(await vaultToken.getVaultByChainId(1)).to.equal(ethers.utils.parseEther("100"));
            expect(await vaultToken.getVaultByChainId(56)).to.equal(ethers.utils.parseEther("200"));
            expect(await vaultToken.getVaultByChainId(137)).to.equal(ethers.utils.parseEther("300"));
            expect(await vaultToken.getVaultByChainId(999)).to.equal(0);
        });

        it("Should return all chains", async function () {
            const chains = await vaultToken.allChains();
            expect(chains.length).to.equal(3);
            expect(chains.map(c => c.toNumber())).to.include.members([1, 56, 137]);
        });

        it("Should return chain count", async function () {
            expect(await vaultToken.chainCount()).to.equal(3);
        });

        it("Should return chain by index", async function () {
            expect(await vaultToken.getChain(0)).to.equal(1);
            expect(await vaultToken.getChain(1)).to.equal(56);
            expect(await vaultToken.getChain(2)).to.equal(137);
        });

        it("Should return vault by index", async function () {
            const vault0 = await vaultToken.getVaultByIndex(0);
            const vault1 = await vaultToken.getVaultByIndex(1);
            const vault2 = await vaultToken.getVaultByIndex(2);
            
            // The actual values depend on the order of deposits in the test setup
            // Let's check that we get the expected values in the correct order
            expect(vault0).to.equal(ethers.utils.parseEther("100"));
            expect(vault1).to.equal(ethers.utils.parseEther("200"));
            expect(vault2).to.equal(ethers.utils.parseEther("300"));
        });

        it("Should return correct token amount calculation", async function () {
            const vaultAmount = ethers.utils.parseEther("50");
            const tokenAmount = await vaultToken.getTokenAmount(vaultAmount);
            expect(tokenAmount).to.equal(ethers.utils.parseEther("50"));
        });

        it("Should return correct vault token amount calculation", async function () {
            const tokenAmount = ethers.utils.parseEther("50");
            const vaultAmount = await vaultToken.getVaultTokenAmount(tokenAmount);
            expect(vaultAmount).to.equal(ethers.utils.parseEther("50"));
        });

        it("Should handle zero total supply in calculations", async function () {
            // Create new vault with no deposits
            const VaultTokenV3 = await ethers.getContractFactory("VaultTokenV3");
            const newVault = await VaultTokenV3.deploy(
                underlyingToken.address,
                "New Vault",
                "NEW"
            );
            
            const tokenAmount = ethers.utils.parseEther("100");
            const vaultAmount = await newVault.getVaultTokenAmount(tokenAmount);
            expect(vaultAmount).to.equal(tokenAmount);
            
            const calculatedTokenAmount = await newVault.getTokenAmount(vaultAmount);
            expect(calculatedTokenAmount).to.equal(tokenAmount);
        });
    });

    // ==================== ERC20 FUNCTIONALITY TESTS ====================
    describe("ERC20 Functionality Tests", function () {
        beforeEach(async function () {
            // Setup initial deposit
            const amount = ethers.utils.parseEther("100");
            await vaultToken.connect(manager).deposit(1, amount, user1.address);
        });

        it("Should transfer vault tokens between users", async function () {
            const transferAmount = ethers.utils.parseEther("30");
            await vaultToken.connect(user1).transfer(user2.address, transferAmount);
            
            expect(await vaultToken.balanceOf(user1.address)).to.equal(ethers.utils.parseEther("70"));
            expect(await vaultToken.balanceOf(user2.address)).to.equal(transferAmount);
        });

        it("Should approve and transferFrom correctly", async function () {
            const approveAmount = ethers.utils.parseEther("50");
            await vaultToken.connect(user1).approve(user2.address, approveAmount);
            
            const transferAmount = ethers.utils.parseEther("30");
            await vaultToken.connect(user2).transferFrom(user1.address, user3.address, transferAmount);
            
            expect(await vaultToken.balanceOf(user1.address)).to.equal(ethers.utils.parseEther("70"));
            expect(await vaultToken.balanceOf(user3.address)).to.equal(transferAmount);
            expect(await vaultToken.allowance(user1.address, user2.address)).to.equal(ethers.utils.parseEther("20"));
        });

        it("Should burn tokens correctly", async function () {
            const burnAmount = ethers.utils.parseEther("30");
            await vaultToken.connect(user1).burn(burnAmount);
            
            expect(await vaultToken.balanceOf(user1.address)).to.equal(ethers.utils.parseEther("70"));
            expect(await vaultToken.totalSupply()).to.equal(ethers.utils.parseEther("70"));
        });

        it("Should burn tokens from other address", async function () {
            const burnAmount = ethers.utils.parseEther("30");
            await vaultToken.connect(user1).approve(user2.address, burnAmount);
            await vaultToken.connect(user2).burnFrom(user1.address, burnAmount);
            
            expect(await vaultToken.balanceOf(user1.address)).to.equal(ethers.utils.parseEther("70"));
            expect(await vaultToken.totalSupply()).to.equal(ethers.utils.parseEther("70"));
        });
    });

    // ==================== EDGE CASES AND ERROR HANDLING ====================
    describe("Edge Cases and Error Handling", function () {
        it("Should handle very large amounts", async function () {
            const largeAmount = ethers.constants.MaxUint256.div(1000); // Large but not max
            await vaultToken.connect(manager).deposit(1, largeAmount, user1.address);
            
            expect(await vaultToken.balanceOf(user1.address)).to.equal(largeAmount);
            expect(await vaultToken.totalVault()).to.equal(largeAmount);
        });

        it("Should handle zero amount deposits", async function () {
            await vaultToken.connect(manager).deposit(1, 0, user1.address);
            
            expect(await vaultToken.balanceOf(user1.address)).to.equal(0);
            expect(await vaultToken.totalVault()).to.equal(0);
        });

        it("Should handle zero amount withdrawals", async function () {
            // First deposit some tokens
            await vaultToken.connect(manager).deposit(1, ethers.utils.parseEther("100"), user1.address);
            
            // Then withdraw zero
            await vaultToken.connect(manager).withdraw(56, 0, user1.address);
            
            expect(await vaultToken.balanceOf(user1.address)).to.equal(ethers.utils.parseEther("100"));
            expect(await vaultToken.totalVault()).to.equal(ethers.utils.parseEther("100"));
        });

        it("Should handle complex vault calculations", async function () {
            // Multiple deposits and withdrawals to test complex scenarios
            await vaultToken.connect(manager).deposit(1, ethers.utils.parseEther("100"), user1.address);
            await vaultToken.connect(manager).deposit(56, ethers.utils.parseEther("200"), user2.address);
            await vaultToken.connect(manager).withdraw(137, ethers.utils.parseEther("50"), user1.address);
            
            expect(await vaultToken.totalVault()).to.equal(ethers.utils.parseEther("250"));
            expect(await vaultToken.getVaultByChainId(1)).to.equal(ethers.utils.parseEther("100"));
            expect(await vaultToken.getVaultByChainId(56)).to.equal(ethers.utils.parseEther("200"));
            expect(await vaultToken.getVaultByChainId(137)).to.equal(ethers.utils.parseEther("-50"));
        });

        it("Should handle negative vault balances correctly", async function () {
            // First deposit
            await vaultToken.connect(manager).deposit(1, ethers.utils.parseEther("100"), user1.address);
            
            // Then withdraw more than deposited - this should fail
            await expect(
                vaultToken.connect(manager).withdraw(56, ethers.utils.parseEther("150"), user1.address)
            ).to.be.revertedWithCustomError(vaultToken, "ERC20InsufficientBalance");
        });
    });

    // ==================== ACCESS CONTROL TESTS ====================
    describe("Access Control Tests", function () {
        it("Should only allow managers to call restricted functions", async function () {
            const amount = ethers.utils.parseEther("100");
            
            // Non-manager should not be able to deposit
            await expect(
                vaultToken.connect(user1).deposit(1, amount, user1.address)
            ).to.be.revertedWith("Caller is not a manager");
            
            // Non-manager should not be able to withdraw
            await expect(
                vaultToken.connect(user1).withdraw(1, amount, user1.address)
            ).to.be.revertedWith("Caller is not a manager");
            
            // Non-manager should not be able to transferToken
            await expect(
                vaultToken.connect(user1).transferToken(1, amount, 56, amount, 137, 0)
            ).to.be.revertedWith("Caller is not a manager");
            
            // Non-manager should not be able to updateVault
            await expect(
                vaultToken.connect(user1).updateVault(1, amount, 56, amount, 137, 0)
            ).to.be.revertedWith("Caller is not a manager");
        });

        it("Should allow managers to call restricted functions", async function () {
            const amount = ethers.utils.parseEther("100");
            
            // Manager should be able to deposit
            await expect(
                vaultToken.connect(manager).deposit(1, amount, user1.address)
            ).to.not.be.reverted;
            
            // Manager should be able to withdraw
            await expect(
                vaultToken.connect(manager).withdraw(56, amount, user1.address)
            ).to.not.be.reverted;
            
            // Manager should be able to transferToken
            await expect(
                vaultToken.connect(manager).transferToken(1, amount, 56, amount, 137, 0)
            ).to.not.be.reverted;
            
            // Manager should be able to updateVault
            await expect(
                vaultToken.connect(manager).updateVault(1, amount, 56, amount, 137, 0)
            ).to.not.be.reverted;
        });
    });
}); 