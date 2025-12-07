const {
  time,
  loadFixture,
} = require("@nomicfoundation/hardhat-toolbox/network-helpers");
const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("RifaChain Collision", function () {
  async function deployFixture() {
    const [owner, creator] = await ethers.getSigners();
    
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

    return { rifaChain, creator };
  }

  it("Should handle raffle ID collision", async function () {
    const { rifaChain, creator } = await loadFixture(deployFixture);
    const baseFee = ethers.parseEther("0.005");
    
    // Set next block timestamp to ensure determinism
    const nextTimestamp = (await time.latest()) + 100;
    await time.setNextBlockTimestamp(nextTimestamp);

    // Take snapshot
    const snapshotId = await ethers.provider.send("evm_snapshot", []);

    // 1. Create Raffle to get the ID
    const tx1 = await rifaChain.connect(creator).createRaffle(
      "Collision", "Desc", nextTimestamp + 100, nextTimestamp + 200, 1, 10, true, 0, ethers.ZeroAddress, 0, creator.address, true, 0, [100],
      { value: baseFee }
    );
    const receipt1 = await tx1.wait();
    const originalId = receipt1.logs.find(log => log.fragment && log.fragment.name === 'RaffleCreated').args[0];

    // Find the slot for 'raffles' BEFORE reverting
    let rafflesSlotIndex = -1;
    for (let i = 0; i < 20; i++) {
        const structStart = ethers.solidityPackedKeccak256(["uint256", "uint256"], [originalId, i]);
        // creator is at structStart + 1 (since id is uint256)
        const creatorSlot = BigInt(structStart) + 1n;
        const val = await ethers.provider.getStorage(await rifaChain.getAddress(), creatorSlot);
        
        if (ethers.getAddress(ethers.dataSlice(val, 12)) === creator.address) {
            rafflesSlotIndex = i;
            break;
        }
    }
    
    expect(rafflesSlotIndex).to.not.equal(-1, "Could not find raffles storage slot");
    const mappingSlot = rafflesSlotIndex;

    // 2. Revert to snapshot
    await ethers.provider.send("evm_revert", [snapshotId]);

    // 3. Occupy the ID in storage
    const storageSlot = ethers.solidityPackedKeccak256(
        ["uint256", "uint256"],
        [originalId, mappingSlot]
    );

    // Set raffles[originalId].id = 1 (non-zero)
    await ethers.provider.send("hardhat_setStorageAt", [
        await rifaChain.getAddress(),
        storageSlot,
        ethers.toBeHex(1, 32)
    ]);

    // 4. Create Raffle again (same timestamp, same params)
    await time.setNextBlockTimestamp(nextTimestamp);

    const tx2 = await rifaChain.connect(creator).createRaffle(
      "Collision", "Desc", nextTimestamp + 100, nextTimestamp + 200, 1, 10, true, 0, ethers.ZeroAddress, 0, creator.address, true, 0, [100],
      { value: baseFee }
    );
    const receipt2 = await tx2.wait();
    const newId = receipt2.logs.find(log => log.fragment && log.fragment.name === 'RaffleCreated').args[0];

    // 5. Verify IDs are different
    expect(newId).to.not.equal(originalId);
    
    // Verify the new ID matches the collision logic
    const expectedNewId = ethers.solidityPackedKeccak256(
        ["uint256", "uint256"],
        [originalId, nextTimestamp]
    );
    expect(newId).to.equal(expectedNewId);
  });
});
