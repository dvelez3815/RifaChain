const {
  time,
  loadFixture,
} = require("@nomicfoundation/hardhat-toolbox/network-helpers");
const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Mutable Variables Verification", function () {
  async function deployRifaChainFixture() {
    const [owner, creator, user1] = await ethers.getSigners();

    const subscriptionId = 1n;
    const keyHash = "0x787d74caea10b2b357790d5b5247c2f63d1d91572a9846f780606e4d953677ae";
    
    const MockVRFCoordinator = await ethers.getContractFactory("MockVRFCoordinator");
    const mockVRFCoordinator = await MockVRFCoordinator.deploy();
    await mockVRFCoordinator.waitForDeployment();
    const vrfCoordinatorAddress = await mockVRFCoordinator.getAddress();

    const RifaChain = await ethers.getContractFactory("RifaChain");
    const rifaChain = await RifaChain.deploy(vrfCoordinatorAddress, subscriptionId, keyHash);
    await rifaChain.waitForDeployment();

    return { rifaChain, creator, owner, user1 };
  }

  describe("Request Confirmations", function () {
    it("Should start with default 3 confirmations", async function () {
        const { rifaChain } = await loadFixture(deployRifaChainFixture);
        expect(await rifaChain.requestConfirmations()).to.equal(3);
    });

    it("Should allow owner to update confirmations", async function () {
        const { rifaChain, owner } = await loadFixture(deployRifaChainFixture);
        await expect(rifaChain.connect(owner).setRequestConfirmations(10))
            .to.emit(rifaChain, "RequestConfirmationsUpdated")
            .withArgs(10);
        expect(await rifaChain.requestConfirmations()).to.equal(10);
    });

    it("Should revert if setting confirmations < 3", async function () {
        const { rifaChain, owner } = await loadFixture(deployRifaChainFixture);
        await expect(rifaChain.connect(owner).setRequestConfirmations(2))
            .to.be.revertedWith("Min 3 confirmations");
    });

    it("Should revert if non-owner tries to update", async function () {
        const { rifaChain, user1 } = await loadFixture(deployRifaChainFixture);
        await expect(rifaChain.connect(user1).setRequestConfirmations(10))
            .to.be.revertedWith("Only callable by owner");
    });
  });

  describe("Max Duration", function () {
    it("Should start with default 365 days", async function () {
        const { rifaChain } = await loadFixture(deployRifaChainFixture);
        const days365 = 365n * 24n * 60n * 60n;
        expect(await rifaChain.maxDuration()).to.equal(days365);
    });

    it("Should allow owner to update max duration", async function () {
        const { rifaChain, owner } = await loadFixture(deployRifaChainFixture);
        const newDuration = 30n * 24n * 60n * 60n; // 30 days
        await expect(rifaChain.connect(owner).setMaxDuration(newDuration))
            .to.emit(rifaChain, "MaxDurationUpdated")
            .withArgs(newDuration);
        expect(await rifaChain.maxDuration()).to.equal(newDuration);
    });

    it("Should revert if setting duration < 1 day", async function () {
        const { rifaChain, owner } = await loadFixture(deployRifaChainFixture);
        const tooShort = 12n * 60n * 60n; // 12 hours
        await expect(rifaChain.connect(owner).setMaxDuration(tooShort))
            .to.be.revertedWith("Min 1 day");
    });

    it("Should enforce new max duration on raffle creation", async function () {
        const { rifaChain, owner, creator } = await loadFixture(deployRifaChainFixture);
        const now = await time.latest();
        
        // Set max duration to 10 days
        const maxDuration = 10n * 24n * 60n * 60n;
        await rifaChain.connect(owner).setMaxDuration(maxDuration);

        // Try to create raffle with 11 days duration
        const startTime = now + 100;
        const endTime = startTime + Number(maxDuration) + 100; // 10 days + 100 seconds
        
        const ticketPrice = ethers.parseEther("0.01");
        const winnerPercentages = [100];
        
        await expect(
            rifaChain.connect(creator).createRaffle(
                "Long Raffle", "Desc", startTime, endTime, 1, 10, true, 0, ethers.ZeroAddress, ticketPrice, creator.address, true, 0, winnerPercentages,
                { value: await rifaChain.getCreationFee(1, endTime - startTime) }
            )
        ).to.be.revertedWithCustomError(rifaChain, "InvalidTimeRange");

        // Should succeed with 9 days
        const validEndTime = startTime + Number(maxDuration) - 100;
        await expect(
            rifaChain.connect(creator).createRaffle(
                "Valid Raffle", "Desc", startTime, validEndTime, 1, 10, true, 0, ethers.ZeroAddress, ticketPrice, creator.address, true, 0, winnerPercentages,
                { value: await rifaChain.getCreationFee(1, validEndTime - startTime) }
            )
        ).to.emit(rifaChain, "RaffleCreated");
    });
  });
});
