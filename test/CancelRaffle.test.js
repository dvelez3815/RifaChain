const {
  time,
  loadFixture,
} = require("@nomicfoundation/hardhat-toolbox/network-helpers");
const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("RifaChain Cancel Raffle", function () {
  async function deployRifaChainFixture() {
    const [owner, creator, user1, user2] = await ethers.getSigners();

    // Mock VRF Constants
    const subscriptionId = 1n;
    const keyHash = "0x787d74caea10b2b357790d5b5247c2f63d1d91572a9846f780606e4d953677ae";
    
    // Deploy MockVRFCoordinator
    const MockVRFCoordinator = await ethers.getContractFactory("MockVRFCoordinator");
    const mockVRFCoordinator = await MockVRFCoordinator.deploy();
    await mockVRFCoordinator.waitForDeployment();
    const vrfCoordinatorAddress = await mockVRFCoordinator.getAddress();

    // Deploy RifaChain
    const RifaChain = await ethers.getContractFactory("RifaChain");
    const rifaChain = await RifaChain.deploy(vrfCoordinatorAddress, subscriptionId, keyHash);
    await rifaChain.waitForDeployment();

    // Deploy MockERC20
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    const mockToken = await MockERC20.deploy("Mock Token", "MCK");
    await mockToken.waitForDeployment();

    return { rifaChain, mockToken, mockVRFCoordinator, owner, creator, user1, user2 };
  }

  describe("Cancellation", function () {
    it("Should allow creator to cancel raffle if conditions met", async function () {
        const { rifaChain, creator } = await loadFixture(deployRifaChainFixture);
        const now = await time.latest();
        
        // Create raffle with minParticipants = 10
        const tx = await rifaChain.connect(creator).createRaffle(
            "Raffle", "Desc", now + 100, now + 200, 10, 0, true, 0, ethers.ZeroAddress, 0, creator.address, true, 0, [100]
        );
        const receipt = await tx.wait();
        const raffleId = receipt.logs.find(log => log.fragment && log.fragment.name === 'RaffleCreated').args[0];

        // Advance time past end
        await time.increaseTo(now + 201);

        // Cancel
        await expect(rifaChain.connect(creator).cancelRaffle(raffleId))
            .to.emit(rifaChain, "RaffleCancelled")
            .withArgs(raffleId);
            
        const raffle = await rifaChain.getRaffle(raffleId);
        expect(raffle.isCancelled).to.be.true;
        expect(raffle.isActive).to.be.false;
    });

    it("Should refund funding amount to creator on cancellation", async function () {
        const { rifaChain, creator } = await loadFixture(deployRifaChainFixture);
        const now = await time.latest();
        const fundingAmount = ethers.parseEther("1.0");
        
        const tx = await rifaChain.connect(creator).createRaffle(
            "Raffle", "Desc", now + 100, now + 200, 10, 0, true, 0, ethers.ZeroAddress, 0, creator.address, true, fundingAmount, [100], { value: fundingAmount }
        );
        const receipt = await tx.wait();
        const raffleId = receipt.logs.find(log => log.fragment && log.fragment.name === 'RaffleCreated').args[0];

        await time.increaseTo(now + 201);

        const balanceBefore = await ethers.provider.getBalance(creator.address);
        
        const cancelTx = await rifaChain.connect(creator).cancelRaffle(raffleId);
        const cancelReceipt = await cancelTx.wait();
        const gasUsed = cancelReceipt.gasUsed * cancelReceipt.gasPrice;
        
        const balanceAfter = await ethers.provider.getBalance(creator.address);

        // Balance change should be +fundingAmount - gasUsed
        expect(balanceAfter + gasUsed - balanceBefore).to.equal(fundingAmount);
    });



    it("Should revert if raffle not ended", async function () {
        const { rifaChain, creator } = await loadFixture(deployRifaChainFixture);
        const now = await time.latest();
        const tx = await rifaChain.connect(creator).createRaffle(
            "Raffle", "Desc", now + 100, now + 200, 10, 0, true, 0, ethers.ZeroAddress, 0, creator.address, true, 0, [100]
        );
        const receipt = await tx.wait();
        const raffleId = receipt.logs.find(log => log.fragment && log.fragment.name === 'RaffleCreated').args[0];

        // Time not passed
        await expect(
            rifaChain.connect(creator).cancelRaffle(raffleId)
        ).to.be.revertedWithCustomError(rifaChain, "RaffleNotEnded");
    });

    it("Should revert if min participants reached", async function () {
        const { rifaChain, creator, user1 } = await loadFixture(deployRifaChainFixture);
        const now = await time.latest();
        // Min participants = 1
        const tx = await rifaChain.connect(creator).createRaffle(
            "Raffle", "Desc", now + 100, now + 200, 1, 0, true, 0, ethers.ZeroAddress, 0, creator.address, true, 0, [100]
        );
        const receipt = await tx.wait();
        const raffleId = receipt.logs.find(log => log.fragment && log.fragment.name === 'RaffleCreated').args[0];

        await time.increaseTo(now + 101);
        await rifaChain.connect(user1).joinRaffle(raffleId, 1, "0x");

        await time.increaseTo(now + 201);

        await expect(
            rifaChain.connect(creator).cancelRaffle(raffleId)
        ).to.be.revertedWithCustomError(rifaChain, "InvalidParticipantLimits");
    });

    it("Should revert if already cancelled", async function () {
        const { rifaChain, creator } = await loadFixture(deployRifaChainFixture);
        const now = await time.latest();
        const tx = await rifaChain.connect(creator).createRaffle(
            "Raffle", "Desc", now + 100, now + 200, 10, 0, true, 0, ethers.ZeroAddress, 0, creator.address, true, 0, [100]
        );
        const receipt = await tx.wait();
        const raffleId = receipt.logs.find(log => log.fragment && log.fragment.name === 'RaffleCreated').args[0];

        await time.increaseTo(now + 201);
        await rifaChain.connect(creator).cancelRaffle(raffleId);

        await expect(
            rifaChain.connect(creator).cancelRaffle(raffleId)
        ).to.be.revertedWithCustomError(rifaChain, "RaffleEnded"); // Or RaffleNotCancelled depending on check order, but here isCancelled check is inside cancelRaffle
    });
    
    it("Should remove from activeRaffles upon cancellation", async function () {
        const { rifaChain, creator } = await loadFixture(deployRifaChainFixture);
        const now = await time.latest();
        const tx = await rifaChain.connect(creator).createRaffle(
            "Raffle", "Desc", now + 100, now + 200, 10, 0, true, 0, ethers.ZeroAddress, 0, creator.address, true, 0, [100]
        );
        const receipt = await tx.wait();
        const raffleId = receipt.logs.find(log => log.fragment && log.fragment.name === 'RaffleCreated').args[0];

        expect(await rifaChain.activeRaffles(0)).to.equal(raffleId);

        await time.increaseTo(now + 201);
        await rifaChain.connect(creator).cancelRaffle(raffleId);

        await expect(rifaChain.activeRaffles(0)).to.be.reverted;
    });

    it("Should allow PARTICIPANT to cancel IMMEDIATELY if raffle failed (min participants not met)", async function () {
        const { rifaChain, creator, user1, user2 } = await loadFixture(deployRifaChainFixture);
        const now = await time.latest();
        const fundingAmount = ethers.parseEther("1.0");
        const ticketPrice = ethers.parseEther("0.1");

        // Min participants = 10, with funding
        const tx = await rifaChain.connect(creator).createRaffle(
            "Raffle", "Desc", now + 100, now + 200, 10, 0, true, 0, ethers.ZeroAddress, ticketPrice, creator.address, true, fundingAmount, [100], { value: fundingAmount }
        );
        const receipt = await tx.wait();
        const raffleId = receipt.logs.find(log => log.fragment && log.fragment.name === 'RaffleCreated').args[0];

        // Advance time to start
        await time.increaseTo(now + 101);

        // User1 joins (becomes participant)
        await rifaChain.connect(user1).joinRaffle(raffleId, 1, "0x", { value: ticketPrice });

        // Advance time past end (no grace period needed)
        await time.increaseTo(now + 201);

        const creatorBalanceBefore = await ethers.provider.getBalance(creator.address);

        // User2 (NON-participant) tries to cancel -> Should fail
        await expect(
            rifaChain.connect(user2).cancelRaffle(raffleId)
        ).to.be.revertedWithCustomError(rifaChain, "Unauthorized");

        // User1 (participant) cancels immediately -> Should succeed
        await expect(rifaChain.connect(user1).cancelRaffle(raffleId))
            .to.emit(rifaChain, "RaffleCancelled")
            .withArgs(raffleId);
            
        const creatorBalanceAfter = await ethers.provider.getBalance(creator.address);
        expect(creatorBalanceAfter - creatorBalanceBefore).to.equal(fundingAmount);

        const raffle = await rifaChain.getRaffle(raffleId);
        expect(raffle.isCancelled).to.be.true;
    });

    it("Should allow PARTICIPANT to cancel after GRACE PERIOD if raffle succeeded (min participants met)", async function () {
        const { rifaChain, creator, user1, user2 } = await loadFixture(deployRifaChainFixture);
        const now = await time.latest();
        const fundingAmount = ethers.parseEther("1.0");

        // Min participants = 1, with funding
        const tx = await rifaChain.connect(creator).createRaffle(
            "Raffle", "Desc", now + 100, now + 200, 1, 0, true, 0, ethers.ZeroAddress, 0, creator.address, true, fundingAmount, [100], { value: fundingAmount }
        );
        const receipt = await tx.wait();
        const raffleId = receipt.logs.find(log => log.fragment && log.fragment.name === 'RaffleCreated').args[0];

        // Advance time to start
        await time.increaseTo(now + 101);

        // User1 joins to meet min participants
        await rifaChain.connect(user1).joinRaffle(raffleId, 1, "0x");

        // Advance time past end
        await time.increaseTo(now + 201);

        // User1 tries to cancel immediately -> Should fail (Protected by Grace Period)
        await expect(
            rifaChain.connect(user1).cancelRaffle(raffleId)
        ).to.be.revertedWithCustomError(rifaChain, "Unauthorized");

        // Advance time past grace period (7 days)
        const sevenDays = 7 * 24 * 60 * 60;
        await time.increaseTo(now + 201 + sevenDays + 1);

        const creatorBalanceBefore = await ethers.provider.getBalance(creator.address);

        // User2 (NON-participant) tries to cancel -> Should fail
        await expect(
            rifaChain.connect(user2).cancelRaffle(raffleId)
        ).to.be.revertedWithCustomError(rifaChain, "Unauthorized");

        // User1 (participant) cancels after grace period -> Should succeed
        await expect(rifaChain.connect(user1).cancelRaffle(raffleId))
            .to.emit(rifaChain, "RaffleCancelled")
            .withArgs(raffleId);

        const creatorBalanceAfter = await ethers.provider.getBalance(creator.address);
        expect(creatorBalanceAfter - creatorBalanceBefore).to.equal(fundingAmount);
    });
  });

  describe("Refunds", function () {
    it("Should allow participants to withdraw refund (Native)", async function () {
        const { rifaChain, creator, user1 } = await loadFixture(deployRifaChainFixture);
        const now = await time.latest();
        const ticketPrice = ethers.parseEther("1.0");
        
        const tx = await rifaChain.connect(creator).createRaffle(
            "Raffle", "Desc", now + 100, now + 200, 10, 0, true, 0, ethers.ZeroAddress, ticketPrice, creator.address, true, 0, [100]
        );
        const receipt = await tx.wait();
        const raffleId = receipt.logs.find(log => log.fragment && log.fragment.name === 'RaffleCreated').args[0];

        await time.increaseTo(now + 101);
        await rifaChain.connect(user1).joinRaffle(raffleId, 1, "0x", { value: ticketPrice });

        await time.increaseTo(now + 201);
        await rifaChain.connect(creator).cancelRaffle(raffleId);

        const balanceBefore = await ethers.provider.getBalance(user1.address);
        
        const refundTx = await rifaChain.connect(user1).withdrawRefund(raffleId);
        const refundReceipt = await refundTx.wait();
        
        const gasUsed = refundReceipt.gasUsed * refundReceipt.gasPrice;
        const balanceAfter = await ethers.provider.getBalance(user1.address);

        expect(balanceAfter + gasUsed - balanceBefore).to.equal(ticketPrice);
        
        await expect(refundTx)
            .to.emit(rifaChain, "RefundClaimed")
            .withArgs(raffleId, user1.address, ticketPrice);
    });

    it("Should allow participants to withdraw refund (ERC20)", async function () {
        const { rifaChain, mockToken, creator, user1 } = await loadFixture(deployRifaChainFixture);
        const now = await time.latest();
        const ticketPrice = ethers.parseUnits("10", 18);
        
        const tx = await rifaChain.connect(creator).createRaffle(
            "Raffle", "Desc", now + 100, now + 200, 10, 0, true, 1, await mockToken.getAddress(), ticketPrice, creator.address, true, 0, [100]
        );
        const receipt = await tx.wait();
        const raffleId = receipt.logs.find(log => log.fragment && log.fragment.name === 'RaffleCreated').args[0];

        await time.increaseTo(now + 101);
        await mockToken.mint(user1.address, ticketPrice);
        await mockToken.connect(user1).approve(await rifaChain.getAddress(), ticketPrice);
        await rifaChain.connect(user1).joinRaffle(raffleId, 1, "0x");

        await time.increaseTo(now + 201);
        await rifaChain.connect(creator).cancelRaffle(raffleId);

        const balanceBefore = await mockToken.balanceOf(user1.address);
        
        await rifaChain.connect(user1).withdrawRefund(raffleId);
        
        const balanceAfter = await mockToken.balanceOf(user1.address);
        expect(balanceAfter - balanceBefore).to.equal(ticketPrice);
    });

    it("Should revert refund if raffle not cancelled", async function () {
        const { rifaChain, creator, user1 } = await loadFixture(deployRifaChainFixture);
        const now = await time.latest();
        const ticketPrice = ethers.parseEther("1.0");
        
        const tx = await rifaChain.connect(creator).createRaffle(
            "Raffle", "Desc", now + 100, now + 200, 10, 0, true, 0, ethers.ZeroAddress, ticketPrice, creator.address, true, 0, [100]
        );
        const receipt = await tx.wait();
        const raffleId = receipt.logs.find(log => log.fragment && log.fragment.name === 'RaffleCreated').args[0];

        await time.increaseTo(now + 101);
        await rifaChain.connect(user1).joinRaffle(raffleId, 1, "0x", { value: ticketPrice });

        await expect(
            rifaChain.connect(user1).withdrawRefund(raffleId)
        ).to.be.revertedWithCustomError(rifaChain, "RaffleNotCancelled");
    });

    it("Should revert refund if user has no tickets", async function () {
        const { rifaChain, creator, user1 } = await loadFixture(deployRifaChainFixture);
        const now = await time.latest();
        
        const tx = await rifaChain.connect(creator).createRaffle(
            "Raffle", "Desc", now + 100, now + 200, 10, 0, true, 0, ethers.ZeroAddress, 0, creator.address, true, 0, [100]
        );
        const receipt = await tx.wait();
        const raffleId = receipt.logs.find(log => log.fragment && log.fragment.name === 'RaffleCreated').args[0];

        await time.increaseTo(now + 201);
        await rifaChain.connect(creator).cancelRaffle(raffleId);

        await expect(
            rifaChain.connect(user1).withdrawRefund(raffleId)
        ).to.be.revertedWithCustomError(rifaChain, "NothingToRefund");
    });
    
    it("Should revert double refund", async function () {
        const { rifaChain, creator, user1 } = await loadFixture(deployRifaChainFixture);
        const now = await time.latest();
        const ticketPrice = ethers.parseEther("1.0");
        
        const tx = await rifaChain.connect(creator).createRaffle(
            "Raffle", "Desc", now + 100, now + 200, 10, 0, true, 0, ethers.ZeroAddress, ticketPrice, creator.address, true, 0, [100]
        );
        const receipt = await tx.wait();
        const raffleId = receipt.logs.find(log => log.fragment && log.fragment.name === 'RaffleCreated').args[0];

        await time.increaseTo(now + 101);
        await rifaChain.connect(user1).joinRaffle(raffleId, 1, "0x", { value: ticketPrice });

        await time.increaseTo(now + 201);
        await rifaChain.connect(creator).cancelRaffle(raffleId);

        await rifaChain.connect(user1).withdrawRefund(raffleId);
        
        await expect(
            rifaChain.connect(user1).withdrawRefund(raffleId)
        ).to.be.revertedWithCustomError(rifaChain, "NothingToRefund");
    });
  });
});
