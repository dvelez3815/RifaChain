const {
  time,
  loadFixture,
} = require("@nomicfoundation/hardhat-toolbox/network-helpers");
const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Winners Limit Verification", function () {
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

  it("Should revert when creating a raffle with 6 winners (Default Limit)", async function () {
    const { rifaChain, creator } = await loadFixture(deployRifaChainFixture);
    const now = await time.latest();
    const ticketPrice = ethers.parseEther("0.01");
    
    // 6 Winners
    const winnerPercentages = [20, 20, 20, 20, 10, 10]; 

    await expect(
      rifaChain.connect(creator).createRaffle(
        "Limit Test", "Desc", now + 100, now + 3600, 10, 100, true, 0, ethers.ZeroAddress, ticketPrice, creator.address, false,
        0, // fundingAmount
        winnerPercentages,
        { value: await rifaChain.getCreationFee(6, 3500) }
      )
    ).to.be.revertedWithCustomError(rifaChain, "InvalidWinnerPercentages");
  });

  it("Should allow creating a raffle with 5 winners (Default Limit)", async function () {
    const { rifaChain, creator } = await loadFixture(deployRifaChainFixture);
    const now = await time.latest();
    const ticketPrice = ethers.parseEther("0.01");
    
    // 5 Winners
    const winnerPercentages = [20, 20, 20, 20, 20]; 

    await expect(
      rifaChain.connect(creator).createRaffle(
        "Limit Test 5", "Desc", now + 100, now + 3600, 10, 100, true, 0, ethers.ZeroAddress, ticketPrice, creator.address, false,
        0, // fundingAmount
        winnerPercentages,
        { value: await rifaChain.getCreationFee(5, 3500) }
      )
    ).to.emit(rifaChain, "RaffleCreated");
  });

  it("Should allow owner to increase max winners", async function () {
    const { rifaChain, owner } = await loadFixture(deployRifaChainFixture);
    
    await expect(rifaChain.connect(owner).setMaxWinners(10))
        .to.emit(rifaChain, "MaxWinnersUpdated")
        .withArgs(10);
        
    expect(await rifaChain.maxWinners()).to.equal(10);
  });

  it("Should allow creating a raffle with 6 winners after increasing limit", async function () {
    const { rifaChain, owner, creator } = await loadFixture(deployRifaChainFixture);
    const now = await time.latest();
    const ticketPrice = ethers.parseEther("0.01");
    
    // Increase limit
    await rifaChain.connect(owner).setMaxWinners(10);

    // 6 Winners
    const winnerPercentages = [20, 20, 20, 20, 10, 10]; 

    await expect(
      rifaChain.connect(creator).createRaffle(
        "Limit Test 6", "Desc", now + 100, now + 3600, 10, 100, true, 0, ethers.ZeroAddress, ticketPrice, creator.address, false,
        0, // fundingAmount
        winnerPercentages,
        { value: await rifaChain.getCreationFee(6, 3500) }
      )
    ).to.emit(rifaChain, "RaffleCreated");
  });

  it("Should revert if non-owner tries to set max winners", async function () {
    const { rifaChain, user1 } = await loadFixture(deployRifaChainFixture);
    
    await expect(
        rifaChain.connect(user1).setMaxWinners(10)
    ).to.be.revertedWith("Only callable by owner");
  });

  it("Should revert if setting max winners to 0", async function () {
    const { rifaChain, owner } = await loadFixture(deployRifaChainFixture);
    
    await expect(
        rifaChain.connect(owner).setMaxWinners(0)
    ).to.be.revertedWith("Must be at least 1");
  });
});
