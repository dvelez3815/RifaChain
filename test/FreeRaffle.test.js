const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("RifaChain Free Raffles", function () {
  let RifaChain;
  let rifaChain;
  let owner;
  let addr1;
  let addr2;
  let mockVRFCoordinator;

  beforeEach(async function () {
    [owner, addr1, addr2] = await ethers.getSigners();

    [owner, addr1, addr2] = await ethers.getSigners();
    
    const RifaChainFactory = await ethers.getContractFactory("RifaChain");
    // Constructor args: _vrfCoordinator, _subscriptionId, _keyHash
    rifaChain = await RifaChainFactory.deploy(
        owner.address, // Dummy VRF Coordinator address (we don't use it in these tests)
        0, // Sub ID
        "0x474e34a077df58807dbe9c96d3c009b23b3c6d0cce433e59bbf5b34f823bc56c" // Dummy Key Hash
    );
  });

  it("Should allow creating a free raffle (price 0)", async function () {
    const { time } = require("@nomicfoundation/hardhat-network-helpers");
    const now = await time.latest();
    await rifaChain.createRaffle(
      "Free Raffle",
      "Description",
      now + 100, // start
      now + 3600, // end
      1, // min
      100, // max
      true, // public
      // invite code removed
      0, // NATIVE
      ethers.ZeroAddress,
      0, // Price 0
      owner.address,
      false, // allowMultipleEntries (should be false for free, but contract allows true currently)
      0, // fundingAmount
      [100] // winner percentages
    );

    const raffle = await rifaChain.raffles(1); // ID might be random, need to fetch differently or check event
    // Actually ID is random.
    // Let's get the ID from the event.
    const filter = rifaChain.filters.RaffleCreated();
    const events = await rifaChain.queryFilter(filter);
    const raffleId = events[0].args.raffleId;

    expect(raffleId).to.not.equal(0);
    const r = await rifaChain.raffles(raffleId);
    expect(r.ticketPrice).to.equal(0);
  });

  it("Should allow joining a free raffle with 0 payment", async function () {
    const { time } = require("@nomicfoundation/hardhat-network-helpers");
    const now = await time.latest();
    const startTime = now + 100;
    await rifaChain.createRaffle(
      "Free Raffle", "Desc", startTime, now + 3600, 1, 100, true, 0, ethers.ZeroAddress, 
      0, // Price 0
      owner.address, false, 0, [100]
    );
    const filter = rifaChain.filters.RaffleCreated();
    const events = await rifaChain.queryFilter(filter);
    const raffleId = events[0].args.raffleId;

    await time.increaseTo(startTime + 1);

    await expect(rifaChain.connect(addr1).joinRaffle(raffleId, 1, "0x", { value: 0 }))
      .to.emit(rifaChain, "UserJoinedRaffle");
  });

  it("Should revert if sending value to a free raffle", async function () {
    const { time } = require("@nomicfoundation/hardhat-network-helpers");
    const now = await time.latest();
    const startTime = now + 100;
    await rifaChain.createRaffle(
      "Free Raffle", "Desc", startTime, now + 3600, 1, 100, true, 0, ethers.ZeroAddress, 
      0, // Price 0
      owner.address, false, 0, [100]
    );
    const filter = rifaChain.filters.RaffleCreated();
    const events = await rifaChain.queryFilter(filter);
    const raffleId = events[0].args.raffleId;

    await time.increaseTo(startTime + 1);

    await expect(
      rifaChain.connect(addr1).joinRaffle(raffleId, 1, "0x", { value: ethers.parseEther("0.001") })
    ).to.be.revertedWithCustomError(rifaChain, "IncorrectPayment");
  });

  it("Should enforce single entry for free raffles (even if allowMultipleEntries is true)", async function () {
    // This is the requirement: "Valida... que no existe mas de un mismo participante en las rifas de tipo free"
    // Currently the contract MIGHT allow it if allowMultipleEntries is true. We need to fix this.
    
    const { time } = require("@nomicfoundation/hardhat-network-helpers");
    const now = await time.latest();
    const startTime = now + 100;
    await rifaChain.createRaffle(
      "Free Raffle", "Desc", startTime, now + 3600, 1, 100, true, 0, ethers.ZeroAddress, 
      0, // Price 0
      owner.address, 
      true, // allowMultipleEntries SET TO TRUE to test enforcement override
      0, // fundingAmount
      [100]
    );
    const filter = rifaChain.filters.RaffleCreated();
    const events = await rifaChain.queryFilter(filter);
    const raffleId = events[0].args.raffleId;

    await time.increaseTo(startTime + 1);

    // First join should succeed
    await rifaChain.connect(addr1).joinRaffle(raffleId, 1, "0x", { value: 0 });

    // Second join should fail
    await expect(
      rifaChain.connect(addr1).joinRaffle(raffleId, 1, "0x", { value: 0 })
    ).to.be.revertedWithCustomError(rifaChain, "AlreadyJoined");
  });
});
