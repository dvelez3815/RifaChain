const {
  time,
  loadFixture,
} = require("@nomicfoundation/hardhat-toolbox/network-helpers");
const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("RifaChain Load & Gas Tests", function () {
  // Increase timeout for load tests
  this.timeout(120000);

  async function deployRifaChainFixture() {
    const [owner, creator, ...users] = await ethers.getSigners();

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

    return { rifaChain, mockVRFCoordinator, owner, creator, users };
  }

  it("Should handle 50 concurrent participants and report gas usage", async function () {
    const { rifaChain, mockVRFCoordinator, creator, users } = await loadFixture(deployRifaChainFixture);
    const now = await time.latest();
    const startTime = now + 100;
    const endTime = now + 3600;
    const ticketPrice = ethers.parseEther("0.01");

    console.log("\n--- Gas Report: High Concurrency Raffle ---");

    // 1. Create Raffle
    const duration = 3500;
    const fee = await rifaChain.getCreationFee(1, duration);
    const createTx = await rifaChain.connect(creator).createRaffle(
      "Load Test Raffle", "Desc", startTime, endTime, 1, 100, true, 0, ethers.ZeroAddress, ticketPrice, creator.address, true, 0, [100],
      { value: fee }
    );
    const createReceipt = await createTx.wait();
    console.log(`Gas used for createRaffle: ${createReceipt.gasUsed.toString()}`);
    
    const event = createReceipt.logs.find(log => log.fragment && log.fragment.name === 'RaffleCreated');
    const raffleId = event.args[0];

    await time.increaseTo(startTime + 1);

    // 2. 50 Users Join
    let totalJoinGas = 0n;
    const participants = users.slice(0, 50);
    
    // Process in batches of 10 to avoid nonce issues if running against real node, 
    // but here we just await sequentially for simplicity and accurate gas tracking
    for (let i = 0; i < participants.length; i++) {
        const user = participants[i];
        const joinTx = await rifaChain.connect(user).joinRaffle(raffleId, 1, "0x", { value: ticketPrice });
        const joinReceipt = await joinTx.wait();
        totalJoinGas += joinReceipt.gasUsed;
    }
    
    console.log(`Total Gas used for 50 joins: ${totalJoinGas.toString()}`);
    console.log(`Average Gas per join: ${totalJoinGas / 50n}`);

    await time.increaseTo(endTime + 1);

    // 3. Request Winner
    const reqTx = await rifaChain.connect(creator).requestRandomWinner(raffleId);
    const reqReceipt = await reqTx.wait();
    console.log(`Gas used for requestRandomWinner: ${reqReceipt.gasUsed.toString()}`);

    const reqEvent = reqReceipt.logs.find(log => log.fragment && log.fragment.name === 'RandomnessRequested');
    const requestId = reqEvent.args[1];

    // 4. Fulfill Randomness (Winner Selection)
    // This is the critical part for gas limits
    const fulfillTx = await mockVRFCoordinator.fulfillRandomWords(await rifaChain.getAddress(), requestId, [123456789n]);
    const fulfillReceipt = await fulfillTx.wait();
    console.log(`Gas used for fulfillRandomWords (Winner Selection): ${fulfillReceipt.gasUsed.toString()}`);

    // Verify
    const raffle = await rifaChain.getRaffle(raffleId);
    expect(raffle.winnersSelected).to.be.true;
    
    const winners = await rifaChain.getRaffleWinners(raffleId);
    expect(winners.length).to.equal(1);
  });
});
