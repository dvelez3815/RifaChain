const {
  time,
  loadFixture,
} = require("@nomicfoundation/hardhat-toolbox/network-helpers");
const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Gas Estimation: 10 Winners", function () {
  async function deployRifaChainFixture() {
    const [owner, creator, ...users] = await ethers.getSigners();

    const subscriptionId = 1n;
    const keyHash = "0x787d74caea10b2b357790d5b5247c2f63d1d91572a9846f780606e4d953677ae";
    
    const MockVRFCoordinator = await ethers.getContractFactory("MockVRFCoordinator");
    const mockVRFCoordinator = await MockVRFCoordinator.deploy();
    await mockVRFCoordinator.waitForDeployment();
    const vrfCoordinatorAddress = await mockVRFCoordinator.getAddress();

    const RifaChain = await ethers.getContractFactory("RifaChain");
    const rifaChain = await RifaChain.deploy(vrfCoordinatorAddress, subscriptionId, keyHash);
    await rifaChain.waitForDeployment();

    return { rifaChain, mockVRFCoordinator, owner, creator, users };
  }

  it("Should estimate gas for selecting 10 winners", async function () {
    const { rifaChain, mockVRFCoordinator, creator, users } = await loadFixture(deployRifaChainFixture);
    const now = await time.latest();
    const ticketPrice = ethers.parseEther("0.01");
    
    // 10 Winners, each gets 10%
    const winnerPercentages = Array(10).fill(10); 

    // Create Raffle
    const tx = await rifaChain.connect(creator).createRaffle(
      "Gas Test 10 Winners", "Desc", now + 100, now + 3600, 20, 100, true, 0, ethers.ZeroAddress, ticketPrice, creator.address, false,
      0, // fundingAmount
      winnerPercentages
    );
    const receipt = await tx.wait();
    const event = receipt.logs.find(log => log.fragment && log.fragment.name === 'RaffleCreated');
    const raffleId = event.args[0];

    await time.increaseTo(now + 101);

    // 15 Users join to ensure enough candidates
    // We reuse signers if we run out, or just generate random wallets if needed. 
    // Hardhat usually gives 20 signers.
    const participants = users.slice(0, 15);
    for (const user of participants) {
        await rifaChain.connect(user).joinRaffle(raffleId, 1, "0x", { value: ticketPrice });
    }

    await time.increaseTo(now + 3601);

    // Request Winner
    const reqTx = await rifaChain.connect(creator).requestRandomWinner(raffleId);
    const reqReceipt = await reqTx.wait();
    const reqEvent = reqReceipt.logs.find(log => log.fragment && log.fragment.name === 'RandomnessRequested');
    const requestId = reqEvent.args[1];

    // Fulfill with random words
    // We need 10 random words
    const randomWords = Array(10).fill(0).map((_, i) => BigInt(123456 + i));

    const fulfillTx = await mockVRFCoordinator.fulfillRandomWords(await rifaChain.getAddress(), requestId, randomWords);
    const fulfillReceipt = await fulfillTx.wait();

    console.log(`\n\n[GAS REPORT] 10 Winners Selection`);
    console.log(`Gas Used: ${fulfillReceipt.gasUsed.toString()}`);
    console.log(`----------------------------------------\n`);

    const winners = await rifaChain.getRaffleWinners(raffleId);
    expect(winners.length).to.equal(10);
  });
});
