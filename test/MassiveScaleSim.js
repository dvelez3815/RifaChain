const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("Massive Scale Gas Simulation", function () {
  let RifaChain, rifaChain;
  let owner, addr1, addr2;
  let vrfCoordinatorV2PlusMock;

  const SUBSCRIPTION_ID = 1;
  const KEY_HASH = "0x474e34a077df58807dbe9c96d3c009b23b3c6d0cce433e59bbf5b34f823bc56c";

  beforeEach(async function () {
    [owner, addr1, addr2] = await ethers.getSigners();

    const MockVRFCoordinator = await ethers.getContractFactory("MockVRFCoordinator");
    vrfCoordinatorV2PlusMock = await MockVRFCoordinator.deploy();
    await vrfCoordinatorV2PlusMock.waitForDeployment();

    RifaChain = await ethers.getContractFactory("RifaChain");
    rifaChain = await RifaChain.deploy(
      await vrfCoordinatorV2PlusMock.getAddress(),
      SUBSCRIPTION_ID,
      KEY_HASH
    );
    await rifaChain.waitForDeployment();
  });

  it("Should measure gas for all key operations with 5 winners", async function () {
    const startTime = (await time.latest()) + 3600;
    const endTime = startTime + 3600;
    const ticketPrice = ethers.parseEther("0.01");
    const fundingAmount = ethers.parseEther("1");
    const numWinners = 5;

    // 1. Create Raffle
    const txCreate = await rifaChain.createRaffle(
      "Massive Scale Raffle",
      "Testing 1M simulation",
      startTime,
      endTime,
      numWinners, // minParticipants
      0, // Unlimited maxParticipants
      true, // isPublic
      0, // NATIVE
      ethers.ZeroAddress,
      ticketPrice,
      owner.address,
      true, // allowMultipleEntries
      fundingAmount,
      [20, 20, 20, 20, 20], // 5 winners, 20% each
      { value: fundingAmount + ethers.parseEther("0.005") + (ethers.parseEther("0.0025") * 4n) } // Fees: Base (0.005) + 4 extra winners * 0.0025
    );
    const receiptCreate = await txCreate.wait();
    const eventCreate = receiptCreate.logs.find(log => log.fragment && log.fragment.name === 'RaffleCreated');
    const raffleId = eventCreate.args[0];
    console.log(`Gas - Create Raffle (5 winners): ${receiptCreate.gasUsed}`);

    await time.increaseTo(startTime + 1);

    // 2. Join Raffle (Measure Average)
    let totalJoinGas = 0n;
    const sampleSize = 10;
    for (let i = 0; i < sampleSize; i++) {
        const txJoin = await rifaChain.connect(addr1).joinRaffle(raffleId, 1, "0x", { value: ticketPrice });
        const receiptJoin = await txJoin.wait();
        totalJoinGas += receiptJoin.gasUsed;
    }
    console.log(`Gas - Join Raffle (Average): ${totalJoinGas / BigInt(sampleSize)}`);

    // 3. Cancel Raffle (Create a dummy one to cancel)
    // To cancel, it must be ended and (not minParticipants reached OR creator cancels).
    // Let's create one that ends quickly.
    const txCreateCancel = await rifaChain.createRaffle(
        "To Cancel", "Desc", startTime, startTime + 100, 100, 0, true, 0, ethers.ZeroAddress, 0, owner.address, true, 0, [100], { value: ethers.parseEther("0.005") }
    );
    const receiptCreateCancel = await txCreateCancel.wait();
    const cancelRaffleId = receiptCreateCancel.logs.find(log => log.fragment && log.fragment.name === 'RaffleCreated').args[0];
    
    // Advance past end time
    await time.increaseTo(startTime + 101);

    const txCancel = await rifaChain.cancelRaffle(cancelRaffleId);
    const receiptCancel = await txCancel.wait();
    console.log(`Gas - Cancel Raffle: ${receiptCancel.gasUsed}`);

    await time.increaseTo(endTime + 1);

    // 4. Request Random Winner
    const txRequest = await rifaChain.requestRandomWinner(raffleId);
    const receiptRequest = await txRequest.wait();
    console.log(`Gas - Request Winner: ${receiptRequest.gasUsed}`);

    const eventRequest = receiptRequest.logs.find(log => log.fragment && log.fragment.name === 'RandomnessRequested');
    const requestId = eventRequest.args[1];

    // 5. Fulfill Random Words (Pick 5 Winners)
    // We need 5 random words
    const randomWords = [111n, 222n, 333n, 444n, 555n];
    const txFulfill = await vrfCoordinatorV2PlusMock.fulfillRandomWords(
        await rifaChain.getAddress(),
        requestId,
        randomWords
    );
    const receiptFulfill = await txFulfill.wait();
    console.log(`Gas - Fulfill Random Words (Pick 5 Winners): ${receiptFulfill.gasUsed}`);

    // 6. Claim Prize
    // Since addr1 joined 10 times (indices 0-9), and we mocked random words,
    // we need to ensure addr1 is a winner.
    // The contract does: winnerIndex = randomVal % totalParticipants
    // totalParticipants = 10.
    // 111 % 10 = 1 (addr1)
    // 222 % 10 = 2 (addr1)
    // ... all are addr1 because addr1 is the only participant.
    
    const txClaim = await rifaChain.connect(addr1).claimPrize(raffleId);
    const receiptClaim = await txClaim.wait();
    console.log(`Gas - Claim Prize (Native): ${receiptClaim.gasUsed}`);
  });
});
