const {
  time,
  loadFixture,
} = require("@nomicfoundation/hardhat-toolbox/network-helpers");
const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("RifaChain Automation", function () {
  async function deployRifaChainFixture() {
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

    return { rifaChain, mockVRFCoordinator, owner, creator, user1 };
  }

  it("Should correctly track active raffles and perform upkeep", async function () {
    const { rifaChain, mockVRFCoordinator, creator, user1 } = await loadFixture(deployRifaChainFixture);
    const now = await time.latest();

    // Create Raffle 1 (Ends in 1 hour)
    const tx1 = await rifaChain.connect(creator).createRaffle(
      "Raffle 1", "Desc", now + 100, now + 3600, 1, 0, true, 0, ethers.ZeroAddress, 0, creator.address, true, 0, [100]
    );
    const receipt1 = await tx1.wait();
    const raffleId1 = receipt1.logs.find(log => log.fragment && log.fragment.name === 'RaffleCreated').args[0];

    // Create Raffle 2 (Ends in 2 hours)
    const tx2 = await rifaChain.connect(creator).createRaffle(
      "Raffle 2", "Desc", now + 100, now + 7200, 1, 0, true, 0, ethers.ZeroAddress, 0, creator.address, true, 0, [100]
    );
    const receipt2 = await tx2.wait();
    const raffleId2 = receipt2.logs.find(log => log.fragment && log.fragment.name === 'RaffleCreated').args[0];

    // Verify both are active
    expect(await rifaChain.activeRaffles(0)).to.equal(raffleId1);
    expect(await rifaChain.activeRaffles(1)).to.equal(raffleId2);

    // Add participants
    await time.increaseTo(now + 101);
    await rifaChain.connect(user1).joinRaffle(raffleId1, 1, "0x");
    await rifaChain.connect(user1).joinRaffle(raffleId2, 1, "0x");

    // Fast forward to end of Raffle 1 (but before Raffle 2)
    await time.increaseTo(now + 3601);

    // Check Upkeep
    const checkData = "0x";
    const { upkeepNeeded, performData } = await rifaChain.checkUpkeep(checkData);
    
    expect(upkeepNeeded).to.be.true;
    
    const decodedIds = ethers.AbiCoder.defaultAbiCoder().decode(["uint256[]"], performData)[0];
    expect(decodedIds.length).to.equal(1);
    expect(decodedIds[0]).to.equal(raffleId1);

    // Perform Upkeep
    await expect(rifaChain.performUpkeep(performData))
      .to.emit(rifaChain, "RandomnessRequested");

    // Verify Raffle 1 has request ID
    const raffle1 = await rifaChain.getRaffle(raffleId1);
    expect(raffle1.requestId).to.not.equal(0);

    // Fulfill Randomness for Raffle 1
    await mockVRFCoordinator.fulfillRandomWords(await rifaChain.getAddress(), raffle1.requestId, [123n]);

    // Verify Raffle 1 is removed from activeRaffles
    // Note: Swap and pop might change order.
    // activeRaffles was [id1, id2]. Removed id1 (index 0).
    // Last element (id2) moved to index 0. Pop last.
    // Result: [id2]
    expect(await rifaChain.activeRaffles(0)).to.equal(raffleId2);
    
    // Try accessing index 1, should revert
    await expect(rifaChain.activeRaffles(1)).to.be.reverted;

    // Fast forward to end of Raffle 2
    await time.increaseTo(now + 7201);

    // Check Upkeep again
    const check2 = await rifaChain.checkUpkeep(checkData);
    expect(check2.upkeepNeeded).to.be.true;
    const decodedIds2 = ethers.AbiCoder.defaultAbiCoder().decode(["uint256[]"], check2.performData)[0];
    expect(decodedIds2[0]).to.equal(raffleId2);

    // Perform Upkeep for Raffle 2
    await expect(rifaChain.performUpkeep(check2.performData))
      .to.emit(rifaChain, "RandomnessRequested");
      
    // Fulfill
    const raffle2 = await rifaChain.getRaffle(raffleId2);
    await mockVRFCoordinator.fulfillRandomWords(await rifaChain.getAddress(), raffle2.requestId, [456n]);

    // Verify activeRaffles is empty
    await expect(rifaChain.activeRaffles(0)).to.be.reverted;
  });

  it("Should not perform upkeep if conditions not met", async function () {
    const { rifaChain, creator } = await loadFixture(deployRifaChainFixture);
    const now = await time.latest();

    // Create Raffle
    await rifaChain.connect(creator).createRaffle(
      "Raffle", "Desc", now + 100, now + 3600, 1, 0, true, 0, ethers.ZeroAddress, 0, creator.address, true, 0, [100]
    );

    // Check Upkeep (Time not passed)
    const { upkeepNeeded } = await rifaChain.checkUpkeep("0x");
    expect(upkeepNeeded).to.be.false;
  });
});
