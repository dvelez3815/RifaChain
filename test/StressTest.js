const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("RifaChain Stress Test", function () {
  let RifaChain, rifaChain;
  let owner, addr1, addr2, addrs;
  let vrfCoordinatorV2PlusMock;

  const SUBSCRIPTION_ID = 1;
  const KEY_HASH = "0x474e34a077df58807dbe9c96d3c009b23b3c6d0cce433e59bbf5b34f823bc56c"; // Sepolia Gas Lane

  beforeEach(async function () {
    [owner, addr1, addr2, ...addrs] = await ethers.getSigners();

    // Deploy VRF Coordinator Mock
    const MockVRFCoordinator = await ethers.getContractFactory("MockVRFCoordinator");
    vrfCoordinatorV2PlusMock = await MockVRFCoordinator.deploy();
    await vrfCoordinatorV2PlusMock.waitForDeployment();

    // Deploy RifaChain
    RifaChain = await ethers.getContractFactory("RifaChain");
    rifaChain = await RifaChain.deploy(
      await vrfCoordinatorV2PlusMock.getAddress(),
      SUBSCRIPTION_ID,
      KEY_HASH
    );
    await rifaChain.waitForDeployment();
  });

  it("Should handle 100 participants and measure gas", async function () {
    const startTime = (await time.latest()) + 3600;
    const endTime = startTime + 3600;
    const ticketPrice = ethers.parseEther("0.01");
    const fundingAmount = ethers.parseEther("1");

    // Create Raffle


    const receiptCreation = await (await rifaChain.connect(owner).createRaffle(
      "Stress Test Raffle",
      "Testing limits",
      startTime,
      endTime,
      3, // minParticipants
      100000, // maxParticipants
      true, // isPublic
      0, // NATIVE
      ethers.ZeroAddress,
      ticketPrice,
      owner.address,
      true, // allowMultipleEntries
      fundingAmount,
      [50, 30, 20], // 3 winners
      { value: fundingAmount + await rifaChain.getCreationFee(3, 3600) } // Fees
    )).wait();

    const eventCreation = receiptCreation.logs.find(log => log.fragment && log.fragment.name === 'RaffleCreated');
    const raffleId = eventCreation.args[0];

    await time.increaseTo(startTime + 1);
    
    const currentBlock = await ethers.provider.getBlock("latest");
    console.log("Debug: StartTime", startTime);
    console.log("Debug: CurrentTime", currentBlock.timestamp);
    console.log("Debug: EndTime", endTime);

    // Add 50 participants
    const participantsCount = 50;
    let totalGas = 0n;

    for (let i = 0; i < participantsCount; i++) {
        const tx = await rifaChain.connect(addr1).joinRaffle(raffleId, 1, "0x", { value: ticketPrice });
        const receipt = await tx.wait();
        totalGas += receipt.gasUsed;
    }

    console.log(`Average Gas per Join (1 ticket): ${totalGas / BigInt(participantsCount)}`);

    await time.increaseTo(endTime + 1);

    // Request Random Winner
    const txRequest = await rifaChain.requestRandomWinner(raffleId);
    const receiptRequest = await txRequest.wait();
    console.log(`Gas used for requestRandomWinner: ${receiptRequest.gasUsed}`);

    // Fulfill Random Words
    const filter = rifaChain.filters.RandomnessRequested();
    const events = await rifaChain.queryFilter(filter);
    const requestId = events[0].args[1];

    const txFulfill = await vrfCoordinatorV2PlusMock.fulfillRandomWords(
      await rifaChain.getAddress(),
      requestId,
      [12345n, 67890n, 54321n] // 3 random words for 3 winners
    );
    const receiptFulfill = await txFulfill.wait();
    console.log(`Gas used for fulfillRandomWords (3 winners, ${participantsCount} participants): ${receiptFulfill.gasUsed}`);
  });

  it("Should measure gas for processing multiple raffles", async function () {
    const numRaffles = 10; 
    const startTime = (await time.latest()) + 3600;
    const endTime = startTime + 3600;
    const ticketPrice = ethers.parseEther("0.01");
    const fundingAmount = ethers.parseEther("0.1");

    // 1. Batch create raffles
    const raffleIds = [];
    const fee = await rifaChain.getCreationFee(1, 3600);
    
    for (let i = 0; i < numRaffles; i++) {
        const tx = await rifaChain.createRaffle(
            `Raffle ${i}`,
            "Desc",
            startTime,
            endTime,
            1,
            100,
            true,
            0,
            ethers.ZeroAddress,
            ticketPrice,
            owner.address,
            true,
            fundingAmount,
            [100],
            { value: fundingAmount + fee }
        );
        const receipt = await tx.wait();
        const event = receipt.logs.find(log => log.fragment && log.fragment.name === 'RaffleCreated');
        raffleIds.push(event.args[0]);
    }

    // 2. Advance time to start
    await time.increaseTo(startTime + 1);

    // 3. Join all raffles
    for (let i = 0; i < numRaffles; i++) {
        await rifaChain.connect(addr1).joinRaffle(raffleIds[i], 1, "0x", { value: ticketPrice });
    }

    // 4. Advance time to end
    await time.increaseTo(endTime + 1);

    // 5. Request Winners for all
    let totalRequestGas = 0n;
    for (let i = 0; i < numRaffles; i++) {
        const tx = await rifaChain.requestRandomWinner(raffleIds[i]);
        const receipt = await tx.wait();
        totalRequestGas += receipt.gasUsed;
    }
    
    console.log(`Average Gas used for requestRandomWinner (over ${numRaffles} raffles): ${totalRequestGas / BigInt(numRaffles)}`);
  });
});
