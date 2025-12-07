const {
  time,
  loadFixture,
} = require("@nomicfoundation/hardhat-toolbox/network-helpers");
const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("RifaChain Edge Cases", function () {
  async function deployFixture() {
    const [owner, creator, user1, user2, user3] = await ethers.getSigners();
    
    // Mock VRF Constants
    const subscriptionId = 1n;
    const keyHash = "0x787d74caea10b2b357790d5b5247c2f63d1d91572a9846f780606e4d953677ae";
    
    // Deploy MockVRFCoordinator
    const MockVRFCoordinator = await ethers.getContractFactory("MockVRFCoordinator");
    const mockVRFCoordinator = await MockVRFCoordinator.deploy();
    await mockVRFCoordinator.waitForDeployment();

    // Deploy RifaChain
    const RifaChain = await ethers.getContractFactory("RifaChain");
    const rifaChain = await RifaChain.deploy(await mockVRFCoordinator.getAddress(), subscriptionId, keyHash);
    await rifaChain.waitForDeployment();

    // Configure Fees
    const baseCreationFee = ethers.parseEther("0.005");
    await rifaChain.setCreationFees(baseCreationFee, ethers.parseEther("0.0025"));

    return { rifaChain, mockVRFCoordinator, owner, creator, user1, user2, user3, baseCreationFee };
  }

  it("Should handle winner selection collision", async function () {
    const { rifaChain, mockVRFCoordinator, creator, user1, user2, user3, baseCreationFee } = await loadFixture(deployFixture);
    const now = await time.latest();
    const ticketPrice = ethers.parseEther("0.1");

    // Create Raffle with 2 winners, 3 participants
    const tx = await rifaChain.connect(creator).createRaffle(
      "Collision", "Desc", now + 100, now + 200, 3, 10, true, 0, ethers.ZeroAddress, ticketPrice, creator.address, true, 0, [50, 50],
      { value: baseCreationFee + ethers.parseEther("0.0025") } // Extra fee for 2nd winner
    );
    const receipt = await tx.wait();
    const raffleId = receipt.logs.find(log => log.fragment && log.fragment.name === 'RaffleCreated').args[0];

    await time.increaseTo(now + 101);

    await rifaChain.connect(user1).joinRaffle(raffleId, 1, "0x", { value: ticketPrice });
    await rifaChain.connect(user2).joinRaffle(raffleId, 1, "0x", { value: ticketPrice });
    await rifaChain.connect(user3).joinRaffle(raffleId, 1, "0x", { value: ticketPrice });

    await time.increaseTo(now + 201);

    const reqTx = await rifaChain.connect(creator).requestRandomWinner(raffleId);
    const reqReceipt = await reqTx.wait();
    const requestId = reqReceipt.logs.find(log => log.fragment && log.fragment.name === 'RandomnessRequested').args[1];

    // Force collision: Return [0, 0]
    // 0 % 3 = 0 (user1)
    // 0 % 3 = 0 (user1) -> Collision!
    // Should rehash and pick someone else.
    await mockVRFCoordinator.fulfillRandomWords(await rifaChain.getAddress(), requestId, [0n, 0n]);

    const winners = await rifaChain.getRaffleWinners(raffleId);
    expect(winners.length).to.equal(2);
    expect(winners[0]).to.equal(user1.address);
    expect(winners[1]).to.not.equal(user1.address); // Should be user2 or user3
  });

  it("Should revert requestRandomWinner if not enough participants for winners", async function () {
    const { rifaChain, creator, user1, user2, baseCreationFee } = await loadFixture(deployFixture);
    const now = await time.latest();
    
    // 5 winners configured
    const tx = await rifaChain.connect(creator).createRaffle(
      "Not Enough", "Desc", now + 100, now + 200, 5, 10, true, 0, ethers.ZeroAddress, 0, creator.address, true, 0, [20, 20, 20, 20, 20],
      { value: baseCreationFee + ethers.parseEther("0.01") } // Extra fees
    );
    const receipt = await tx.wait();
    const raffleId = receipt.logs.find(log => log.fragment && log.fragment.name === 'RaffleCreated').args[0];

    await time.increaseTo(now + 101);

    // Only 2 join
    await rifaChain.connect(user1).joinRaffle(raffleId, 1, "0x", { value: 0 });
    await rifaChain.connect(user2).joinRaffle(raffleId, 1, "0x", { value: 0 });

    await time.increaseTo(now + 201);

    await expect(
        rifaChain.connect(creator).requestRandomWinner(raffleId)
    ).to.be.revertedWithCustomError(rifaChain, "InvalidParticipantLimits");
  });

  it("Should revert cancelRaffle if min participants reached and grace period not over", async function () {
    const { rifaChain, creator, user1, baseCreationFee } = await loadFixture(deployFixture);
    const now = await time.latest();

    const tx = await rifaChain.connect(creator).createRaffle(
      "No Cancel", "Desc", now + 100, now + 200, 1, 10, true, 0, ethers.ZeroAddress, 0, creator.address, true, 0, [100],
      { value: baseCreationFee }
    );
    const receipt = await tx.wait();
    const raffleId = receipt.logs.find(log => log.fragment && log.fragment.name === 'RaffleCreated').args[0];

    await time.increaseTo(now + 101);
    await rifaChain.connect(user1).joinRaffle(raffleId, 1, "0x", { value: 0 });

    await time.increaseTo(now + 201); // Ended

    // Min participants (1) reached. Grace period (5 mins) NOT over.
    // Creator tries to cancel.
    await expect(
        rifaChain.connect(creator).cancelRaffle(raffleId)
    ).to.be.revertedWithCustomError(rifaChain, "InvalidParticipantLimits");
  });

  it("Should revert joinRaffle if not active (future start)", async function () {
    const { rifaChain, creator, user1, baseCreationFee } = await loadFixture(deployFixture);
    const now = await time.latest();

    const tx = await rifaChain.connect(creator).createRaffle(
      "Future", "Desc", now + 1000, now + 2000, 1, 10, true, 0, ethers.ZeroAddress, 0, creator.address, true, 0, [100],
      { value: baseCreationFee }
    );
    const receipt = await tx.wait();
    const raffleId = receipt.logs.find(log => log.fragment && log.fragment.name === 'RaffleCreated').args[0];

    await expect(
        rifaChain.connect(user1).joinRaffle(raffleId, 1, "0x", { value: 0 })
    ).to.be.revertedWithCustomError(rifaChain, "RaffleNotActive");
  });

  it("Should revert joinRaffle if ended", async function () {
    const { rifaChain, creator, user1, baseCreationFee } = await loadFixture(deployFixture);
    const now = await time.latest();

    const tx = await rifaChain.connect(creator).createRaffle(
      "Ended", "Desc", now + 100, now + 200, 1, 10, true, 0, ethers.ZeroAddress, 0, creator.address, true, 0, [100],
      { value: baseCreationFee }
    );
    const receipt = await tx.wait();
    const raffleId = receipt.logs.find(log => log.fragment && log.fragment.name === 'RaffleCreated').args[0];

    await time.increaseTo(now + 201);

    await expect(
        rifaChain.connect(user1).joinRaffle(raffleId, 1, "0x", { value: 0 })
    ).to.be.revertedWithCustomError(rifaChain, "RaffleEnded");
  });

  it("Should revert joinRaffle if multiple entries not allowed", async function () {
    const { rifaChain, creator, user1, baseCreationFee } = await loadFixture(deployFixture);
    const now = await time.latest();

    const tx = await rifaChain.connect(creator).createRaffle(
      "Single Entry", "Desc", now + 100, now + 200, 1, 10, true, 0, ethers.ZeroAddress, 0, creator.address, false, 0, [100],
      { value: baseCreationFee }
    );
    const receipt = await tx.wait();
    const raffleId = receipt.logs.find(log => log.fragment && log.fragment.name === 'RaffleCreated').args[0];

    await time.increaseTo(now + 101);

    await rifaChain.connect(user1).joinRaffle(raffleId, 1, "0x", { value: 0 });

    await expect(
        rifaChain.connect(user1).joinRaffle(raffleId, 1, "0x", { value: 0 })
    ).to.be.revertedWithCustomError(rifaChain, "AlreadyJoined");
    
    // Also try joining with 2 tickets at once
    const tx2 = await rifaChain.connect(creator).createRaffle(
      "Single Entry 2", "Desc", now + 100, now + 200, 1, 10, true, 0, ethers.ZeroAddress, 0, creator.address, false, 0, [100],
      { value: baseCreationFee }
    );
    const receipt2 = await tx2.wait();
    const raffleId2 = receipt2.logs.find(log => log.fragment && log.fragment.name === 'RaffleCreated').args[0];
    
    await expect(
        rifaChain.connect(user1).joinRaffle(raffleId2, 2, "0x", { value: 0 })
    ).to.be.revertedWithCustomError(rifaChain, "AlreadyJoined");
  });

  it("Should revert joinRaffle with incorrect payment (Native)", async function () {
    const { rifaChain, creator, user1, baseCreationFee } = await loadFixture(deployFixture);
    const now = await time.latest();
    const ticketPrice = ethers.parseEther("0.1");

    const tx = await rifaChain.connect(creator).createRaffle(
      "Payment", "Desc", now + 100, now + 200, 1, 10, true, 0, ethers.ZeroAddress, ticketPrice, creator.address, true, 0, [100],
      { value: baseCreationFee }
    );
    const receipt = await tx.wait();
    const raffleId = receipt.logs.find(log => log.fragment && log.fragment.name === 'RaffleCreated').args[0];

    await time.increaseTo(now + 101);

    await expect(
        rifaChain.connect(user1).joinRaffle(raffleId, 1, "0x", { value: ethers.parseEther("0.05") })
    ).to.be.revertedWithCustomError(rifaChain, "IncorrectPayment");
  });

  it("Should allow MockRevertingReceiver to withdraw ERC20 earnings (success path)", async function () {
    const { rifaChain, mockVRFCoordinator, baseCreationFee } = await loadFixture(deployFixture);
    const now = await time.latest();
    const ticketPrice = ethers.parseEther("10");

    // Deploy MockERC20
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    const mockToken = await MockERC20.deploy("Test", "TST");
    await mockToken.waitForDeployment();

    // Deploy MockRevertingReceiver
    const MockRevertingReceiver = await ethers.getContractFactory("MockRevertingReceiver");
    const mockRevertingReceiver = await MockRevertingReceiver.deploy();
    await mockRevertingReceiver.waitForDeployment();

    // Mint tokens to user1
    const [owner, creator, user1] = await ethers.getSigners();
    await mockToken.mint(user1.address, ethers.parseEther("100"));
    await mockToken.connect(user1).approve(await rifaChain.getAddress(), ethers.parseEther("100"));

    // Mock creates ERC20 raffle
    // TokenType.ERC20 = 1
    const tx = await mockRevertingReceiver.createRaffle(
        await rifaChain.getAddress(),
        "Mock Creator ERC20",
        now + 50,
        now + 500,
        1,
        10,
        ticketPrice,
        0, // Funding amount
        1, // TokenType.ERC20
        await mockToken.getAddress(),
        { value: baseCreationFee }
    );
    
    // Wait, I called it twice. Let's fix.
    // I need to get the ID.
    const receipt = await tx.wait();
    const log = receipt.logs.find(l => {
        try {
            const parsed = rifaChain.interface.parseLog(l);
            return parsed && parsed.name === 'RaffleCreated';
        } catch (e) { return false; }
    });
    const raffleId = rifaChain.interface.parseLog(log).args[0];

    await time.increase(200);

    // User joins
    await rifaChain.connect(user1).joinRaffle(raffleId, 1, "0x", { value: 0 });

    await time.increase(400); // End time passed

    // Pick Winner (Owner)
    const reqTx = await rifaChain.connect(owner).requestRandomWinner(raffleId);
    const reqReceipt = await reqTx.wait();
    const requestId = reqReceipt.logs.find(log => log.fragment && log.fragment.name === 'RandomnessRequested').args[1];

    await mockVRFCoordinator.fulfillRandomWords(await rifaChain.getAddress(), requestId, [0n]);

    // Mock withdraws earnings
    // Should SUCCEED because it's ERC20 transfer, and MockRevertingReceiver doesn't revert on ERC20.
    await expect(
        mockRevertingReceiver.withdrawCreatorEarnings(await rifaChain.getAddress(), raffleId)
    ).to.not.be.reverted;
    
    // Verify mock has tokens
    // Earnings = ticketPrice * 1 - fee
    // Fee = 8%
    const expectedEarnings = ticketPrice * 92n / 100n;
    expect(await mockToken.balanceOf(await mockRevertingReceiver.getAddress())).to.equal(expectedEarnings);
  });
});
