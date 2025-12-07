const {
  time,
  loadFixture,
} = require("@nomicfoundation/hardhat-toolbox/network-helpers");
const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("RifaChain Transfer Failures", function () {
  async function deployFixture() {
    const [owner, creator, user1] = await ethers.getSigners();

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

    // Deploy MockRevertingReceiver
    const MockRevertingReceiver = await ethers.getContractFactory("MockRevertingReceiver");
    const mockRevertingReceiver = await MockRevertingReceiver.deploy();
    await mockRevertingReceiver.waitForDeployment();

    // Configure Fees
    const baseCreationFee = ethers.parseEther("0.005");
    const additionalWinnerFee = ethers.parseEther("0.0025");
    const platformFeeBasisPoints = 800; // 8%
    
    await rifaChain.setCreationFees(baseCreationFee, additionalWinnerFee);
    await rifaChain.setPlatformFee(platformFeeBasisPoints);

    return { rifaChain, mockVRFCoordinator, mockRevertingReceiver, owner, creator, user1, baseCreationFee };
  }

  it("Should revert createRaffle if fee transfer fails", async function () {
    const { rifaChain, mockRevertingReceiver, creator, baseCreationFee } = await loadFixture(deployFixture);
    const now = await time.latest();

    // Set fee recipient to reverting contract
    await rifaChain.setFeeRecipient(await mockRevertingReceiver.getAddress());

    await expect(
      rifaChain.connect(creator).createRaffle(
        "Fail Fee", "Desc", now + 100, now + 200, 1, 10, true, 0, ethers.ZeroAddress, 0, creator.address, true, 0, [100],
        { value: baseCreationFee }
      )
    ).to.be.revertedWithCustomError(rifaChain, "TransferFailed");
  });

  it("Should revert withdrawRefund if transfer fails", async function () {
    const { rifaChain, mockRevertingReceiver, creator, baseCreationFee } = await loadFixture(deployFixture);
    const now = await time.latest();
    const ticketPrice = ethers.parseEther("0.1");

    // Create Raffle with minParticipants = 2 so it fails if only 1 joins
    const tx = await rifaChain.connect(creator).createRaffle(
      "Refund Fail", "Desc", now + 100, now + 200, 2, 10, true, 0, ethers.ZeroAddress, ticketPrice, creator.address, true, 0, [100],
      { value: baseCreationFee }
    );
    const receipt = await tx.wait();
    const raffleId = receipt.logs.find(log => log.fragment && log.fragment.name === 'RaffleCreated').args[0];

    await time.increaseTo(now + 101);

    // Mock joins raffle (1 participant)
    await mockRevertingReceiver.joinRaffle(await rifaChain.getAddress(), raffleId, 1, { value: ticketPrice });

    // Advance past endTime
    await time.increaseTo(now + 201);

    // Cancel Raffle (Failed Raffle condition met)
    await rifaChain.connect(creator).cancelRaffle(raffleId);

    // Mock tries to withdraw refund
    await expect(
        mockRevertingReceiver.withdrawRefund(await rifaChain.getAddress(), raffleId)
    ).to.be.revertedWith("Withdraw call failed");
  });

  // ... (withdrawCreatorEarnings, claimPrize, cancelRaffle tests remain same, skipping for brevity in replacement if possible, but replace_file_content needs contiguous block)
  // I will just replace the failing tests.

  it("Should revert withdrawCreatorEarnings if transfer fails", async function () {
    const { rifaChain, mockRevertingReceiver, creator, user1, mockVRFCoordinator, baseCreationFee } = await loadFixture(deployFixture);
    const now = await time.latest();
    const ticketPrice = ethers.parseEther("1.0");

    // Create Raffle with Mock as Payout Address
    const tx = await rifaChain.connect(creator).createRaffle(
      "Earnings Fail", "Desc", now + 100, now + 200, 1, 10, true, 0, ethers.ZeroAddress, ticketPrice, await mockRevertingReceiver.getAddress(), true, 0, [100],
      { value: baseCreationFee }
    );
    const receipt = await tx.wait();
    const raffleId = receipt.logs.find(log => log.fragment && log.fragment.name === 'RaffleCreated').args[0];

    await time.increaseTo(now + 101);

    // User joins
    await rifaChain.connect(user1).joinRaffle(raffleId, 1, "0x", { value: ticketPrice });

    await time.increaseTo(now + 300);

    // Pick Winner
    const reqTx = await rifaChain.connect(creator).requestRandomWinner(raffleId);
    const reqReceipt = await reqTx.wait();
    const requestId = reqReceipt.logs.find(log => log.fragment && log.fragment.name === 'RandomnessRequested').args[1];
    await mockVRFCoordinator.fulfillRandomWords(await rifaChain.getAddress(), requestId, [0n]);

    // Creator tries to withdraw earnings
    await expect(
      rifaChain.connect(creator).withdrawCreatorEarnings(raffleId)
    ).to.be.revertedWithCustomError(rifaChain, "TransferFailed");
  });

  it("Should revert claimPrize if transfer fails", async function () {
    const { rifaChain, mockRevertingReceiver, creator, mockVRFCoordinator, baseCreationFee } = await loadFixture(deployFixture);
    const now = await time.latest();
    const fundingAmount = ethers.parseEther("1.0");

    // Create Raffle
    const tx = await rifaChain.connect(creator).createRaffle(
      "Prize Fail", "Desc", now + 100, now + 200, 1, 10, true, 0, ethers.ZeroAddress, 0, creator.address, true, fundingAmount, [100],
      { value: baseCreationFee + fundingAmount }
    );
    const receipt = await tx.wait();
    const raffleId = receipt.logs.find(log => log.fragment && log.fragment.name === 'RaffleCreated').args[0];

    await time.increaseTo(now + 101);

    // Mock joins
    await mockRevertingReceiver.joinRaffle(await rifaChain.getAddress(), raffleId, 1, { value: 0 });

    await time.increaseTo(now + 300);

    // Pick Winner
    const reqTx = await rifaChain.connect(creator).requestRandomWinner(raffleId);
    const reqReceipt = await reqTx.wait();
    const requestId = reqReceipt.logs.find(log => log.fragment && log.fragment.name === 'RandomnessRequested').args[1];
    await mockVRFCoordinator.fulfillRandomWords(await rifaChain.getAddress(), requestId, [0n]);

    // Mock claims prize
    await expect(
        mockRevertingReceiver.claimPrize(await rifaChain.getAddress(), raffleId)
    ).to.be.revertedWith("Claim failed");
  });

  it("Should revert cancelRaffle if funding refund fails", async function () {
    const { rifaChain, mockRevertingReceiver, baseCreationFee } = await loadFixture(deployFixture);
    const now = await time.latest();
    const fundingAmount = ethers.parseEther("1.0");

    await expect(
        mockRevertingReceiver.createRaffle(
            await rifaChain.getAddress(),
            "Cancel Fail",
            now + 100,
            now + 200,
            1,
            10,
            0,
            fundingAmount,
            0, // TokenType.NATIVE
            ethers.ZeroAddress,
            { value: baseCreationFee + fundingAmount }
        )
    ).to.not.be.reverted;

    const raffleId = await rifaChain.raffleCount();

    await expect(
        mockRevertingReceiver.cancelRaffle(await rifaChain.getAddress(), raffleId)
    ).to.be.revertedWith("Cancel failed");
  });

  it("Should revert fulfillRandomWords if platform fee transfer fails", async function () {
    const { rifaChain, mockRevertingReceiver, creator, user1, mockVRFCoordinator, baseCreationFee } = await loadFixture(deployFixture);
    const now = await time.latest();
    const ticketPrice = ethers.parseEther("1.0");

    // Create Raffle (Normal fee recipient initially)
    const tx = await rifaChain.connect(creator).createRaffle(
      "Platform Fee Fail", "Desc", now + 100, now + 200, 1, 10, true, 0, ethers.ZeroAddress, ticketPrice, creator.address, true, 0, [100],
      { value: baseCreationFee }
    );
    const receipt = await tx.wait();
    const raffleId = receipt.logs.find(log => log.fragment && log.fragment.name === 'RaffleCreated').args[0];

    await time.increaseTo(now + 101);

    // User joins
    await rifaChain.connect(user1).joinRaffle(raffleId, 1, "0x", { value: ticketPrice });

    await time.increaseTo(now + 300);

    // Request Winner
    const reqTx = await rifaChain.connect(creator).requestRandomWinner(raffleId);
    const reqReceipt = await reqTx.wait();
    const requestId = reqReceipt.logs.find(log => log.fragment && log.fragment.name === 'RandomnessRequested').args[1];

    // Set fee recipient to reverting contract BEFORE fulfillment
    await rifaChain.setFeeRecipient(await mockRevertingReceiver.getAddress());

    // Fulfill Winner -> Should revert because platform fee transfer fails
    await expect(
        mockVRFCoordinator.fulfillRandomWords(await rifaChain.getAddress(), requestId, [0n])
    ).to.be.revertedWithCustomError(rifaChain, "TransferFailed");
  });

  it("Should revert when MockRevertingReceiver tries to withdraw earnings (as it rejects payments)", async function () {
    const { rifaChain, mockRevertingReceiver, baseCreationFee, mockVRFCoordinator } = await loadFixture(deployFixture);
    const now = await time.latest();
    const ticketPrice = ethers.parseEther("0.1");

    const tx = await mockRevertingReceiver.createRaffle(
        await rifaChain.getAddress(),
        "Mock Creator",
        now + 50,
        now + 500,
        1,
        10,
        ticketPrice,
        0,
        0, // TokenType.NATIVE
        ethers.ZeroAddress,
        { value: baseCreationFee }
    );

    const receipt = await tx.wait();
    const log = receipt.logs.find(l => {
        try {
            const parsed = rifaChain.interface.parseLog(l);
            return parsed && parsed.name === 'RaffleCreated';
        } catch (e) { return false; }
    });
    const raffleId = rifaChain.interface.parseLog(log).args[0];
    const raffle = await rifaChain.getRaffle(raffleId);
    // console.log("Raffle Start:", raffle.startTime, "Now:", now);
    expect(raffle.startTime).to.equal(now + 50);
    expect(raffle.isActive).to.be.true;

    await time.increase(200);

    // 2. Someone joins
    const [owner, creator, user1] = await ethers.getSigners();
    await rifaChain.connect(user1).joinRaffle(raffleId, 1, "0x", { value: ticketPrice });

    await time.increaseTo(now + 300);

    // 3. Pick Winner
    // user1 cannot request because grace period not over. Owner can.
    const reqTx = await rifaChain.connect(owner).requestRandomWinner(raffleId);
    const reqReceipt = await reqTx.wait();
    const requestId = reqReceipt.logs.find(log => log.fragment && log.fragment.name === 'RandomnessRequested').args[1];

    await mockVRFCoordinator.fulfillRandomWords(await rifaChain.getAddress(), requestId, [0n]);

    // 4. Mock tries to withdraw earnings
    // This calls MockRevertingReceiver.withdrawCreatorEarnings -> RifaChain.withdrawCreatorEarnings
    // RifaChain tries to send ETH to MockRevertingReceiver.
    // MockRevertingReceiver.receive() reverts.
    // RifaChain reverts with TransferFailed.
    // MockRevertingReceiver.withdrawCreatorEarnings sees failure and reverts with "Withdraw earnings failed".
    await expect(
        mockRevertingReceiver.withdrawCreatorEarnings(await rifaChain.getAddress(), raffleId)
    ).to.be.revertedWith("Withdraw earnings failed");
  });
});
