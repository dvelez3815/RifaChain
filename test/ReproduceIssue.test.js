const {
  time,
  loadFixture,
} = require("@nomicfoundation/hardhat-toolbox/network-helpers");
const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Reproduce User Issue", function () {
  async function deployRifaChainFixture() {
    const [owner, creator, userA, userB] = await ethers.getSigners();

    const subscriptionId = 1n;
    const keyHash = "0x787d74caea10b2b357790d5b5247c2f63d1d91572a9846f780606e4d953677ae";
    
    const MockVRFCoordinator = await ethers.getContractFactory("MockVRFCoordinator");
    const mockVRFCoordinator = await MockVRFCoordinator.deploy();
    await mockVRFCoordinator.waitForDeployment();
    const vrfCoordinatorAddress = await mockVRFCoordinator.getAddress();

    const RifaChain = await ethers.getContractFactory("RifaChain");
    const rifaChain = await RifaChain.deploy(vrfCoordinatorAddress, subscriptionId, keyHash);
    await rifaChain.waitForDeployment();

    return { rifaChain, mockVRFCoordinator, owner, creator, userA, userB };
  }

  it("Should demonstrate deterministic winner selection when tickets == winners", async function () {
    const { rifaChain, mockVRFCoordinator, creator, userA, userB } = await loadFixture(deployRifaChainFixture);
    const now = await time.latest();
    const ticketPrice = ethers.parseEther("1");
    // User's config: 70, 15, 1, 1, 13
    const winnerPercentages = [70, 15, 1, 1, 13]; 

    // Create Raffle
    // Min participants = 5
    const tx = await rifaChain.connect(creator).createRaffle(
      "User Issue Raffle", "Desc", now + 100, now + 3600, 5, 100, true, 0, ethers.ZeroAddress, ticketPrice, creator.address, true,
      0, // fundingAmount
      winnerPercentages
    );
    const receipt = await tx.wait();
    const raffleId = receipt.logs.find(log => log.fragment && log.fragment.name === 'RaffleCreated').args[0];

    await time.increaseTo(now + 101);

    // User A buys 4 tickets
    await rifaChain.connect(userA).joinRaffle(raffleId, 4, "0x", { value: ethers.parseEther("4") });
    
    // User B buys 1 ticket
    await rifaChain.connect(userB).joinRaffle(raffleId, 1, "0x", { value: ethers.parseEther("1") });

    // Total tickets = 5. Total winners = 5.
    
    await time.increaseTo(now + 3601);

    // Request Winner
    const reqTx = await rifaChain.connect(creator).requestRandomWinner(raffleId);
    const reqReceipt = await reqTx.wait();
    const requestId = reqReceipt.logs.find(log => log.fragment && log.fragment.name === 'RandomnessRequested').args[1];

    // Fulfill with ANY random words
    // Even if we try to bias it, the contract forces uniqueness
    await mockVRFCoordinator.fulfillRandomWords(await rifaChain.getAddress(), requestId, [111n, 222n, 333n, 444n, 555n]);

    // Verify Winners
    const winners = await rifaChain.getRaffleWinners(raffleId);
    expect(winners.length).to.equal(5);

    // Count wins
    let winsA = 0;
    let winsB = 0;
    for (const winner of winners) {
        if (winner === userA.address) winsA++;
        if (winner === userB.address) winsB++;
    }

    console.log(`User A (4 tickets) wins: ${winsA}`);
    console.log(`User B (1 ticket) wins: ${winsB}`);

    // With "No Replacement" logic, since there are 5 tickets and 5 winners,
    // EVERY ticket must win exactly once.
    // Therefore, User A (4 tickets) MUST win 4 times.
    // User B (1 ticket) MUST win 1 time.
    expect(winsA).to.equal(4);
    expect(winsB).to.equal(1);
  });
});
