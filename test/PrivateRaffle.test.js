const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("RifaChain Private Raffles (Digital Signatures)", function () {
  let RifaChain;
  let rifaChain;
  let owner;
  let addr1;
  let addr2;

  beforeEach(async function () {
    [owner, addr1, addr2] = await ethers.getSigners();
    
    const RifaChainFactory = await ethers.getContractFactory("RifaChain");
    rifaChain = await RifaChainFactory.deploy(
        owner.address, 
        0, 
        "0x474e34a077df58807dbe9c96d3c009b23b3c6d0cce433e59bbf5b34f823bc56c"
    );
  });

  async function createPrivateRaffle() {
    const { time } = require("@nomicfoundation/hardhat-network-helpers");
    const now = await time.latest();
    const startTime = now + 100;
    const duration = 3500;
    const fee = await rifaChain.getCreationFee(1, duration);
    await rifaChain.createRaffle(
      "Private Raffle", "Desc", startTime, now + 3600, 1, 100, 
      false, // isPublic = FALSE
      0, ethers.ZeroAddress, 0, owner.address, false, 0, [100],
      { value: fee }
    );
    const filter = rifaChain.filters.RaffleCreated();
    const events = await rifaChain.queryFilter(filter);
    
    // Advance time to make raffle active
    await time.increaseTo(startTime + 1);
    
    return events[0].args.raffleId;
  }

  it("Should allow joining with a valid signature", async function () {
    const raffleId = await createPrivateRaffle();

    // Create signature: keccak256(abi.encodePacked(raffleId, participant))
    const messageHash = ethers.solidityPackedKeccak256(
        ["uint256", "address"], 
        [raffleId, addr1.address]
    );
    const messageBytes = ethers.getBytes(messageHash);
    const signature = await owner.signMessage(messageBytes);

    await expect(rifaChain.connect(addr1).joinRaffle(raffleId, 1, signature, { value: 0 }))
      .to.emit(rifaChain, "UserJoinedRaffle");
  });

  it("Should revert with InvalidSignature if signature is from wrong signer", async function () {
    const raffleId = await createPrivateRaffle();

    const messageHash = ethers.solidityPackedKeccak256(
        ["uint256", "address"], 
        [raffleId, addr1.address]
    );
    const messageBytes = ethers.getBytes(messageHash);
    // Signed by addr2 instead of owner
    const signature = await addr2.signMessage(messageBytes);

    await expect(
      rifaChain.connect(addr1).joinRaffle(raffleId, 1, signature, { value: 0 })
    ).to.be.revertedWithCustomError(rifaChain, "InvalidSignature");
  });

  it("Should revert with InvalidSignature if signature is for wrong participant", async function () {
    const raffleId = await createPrivateRaffle();

    // Signature for addr2
    const messageHash = ethers.solidityPackedKeccak256(
        ["uint256", "address"], 
        [raffleId, addr2.address]
    );
    const messageBytes = ethers.getBytes(messageHash);
    const signature = await owner.signMessage(messageBytes);

    // addr1 tries to use addr2's signature
    await expect(
      rifaChain.connect(addr1).joinRaffle(raffleId, 1, signature, { value: 0 })
    ).to.be.revertedWithCustomError(rifaChain, "InvalidSignature");
  });

  it("Should revert with InvalidSignature if signature is for wrong raffle", async function () {
    const raffleId = await createPrivateRaffle();
    const otherRaffleId = 999; // Fake ID

    // Signature for wrong raffle ID
    const messageHash = ethers.solidityPackedKeccak256(
        ["uint256", "address"], 
        [otherRaffleId, addr1.address]
    );
    const messageBytes = ethers.getBytes(messageHash);
    const signature = await owner.signMessage(messageBytes);

    await expect(
      rifaChain.connect(addr1).joinRaffle(raffleId, 1, signature, { value: 0 })
    ).to.be.revertedWithCustomError(rifaChain, "InvalidSignature");
  });
});
