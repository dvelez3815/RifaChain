const {
  time,
  loadFixture,
} = require("@nomicfoundation/hardhat-toolbox/network-helpers");
const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("RifaChain Multiple Winners", function () {
  async function deployRifaChainFixture() {
    const [owner, creator, user1, user2, user3, user4, user5] = await ethers.getSigners();

    const subscriptionId = 1n;
    const keyHash = "0x787d74caea10b2b357790d5b5247c2f63d1d91572a9846f780606e4d953677ae";
    
    const MockVRFCoordinator = await ethers.getContractFactory("MockVRFCoordinator");
    const mockVRFCoordinator = await MockVRFCoordinator.deploy();
    await mockVRFCoordinator.waitForDeployment();
    const vrfCoordinatorAddress = await mockVRFCoordinator.getAddress();

    const RifaChain = await ethers.getContractFactory("RifaChain");
    const rifaChain = await RifaChain.deploy(vrfCoordinatorAddress, subscriptionId, keyHash);
    await rifaChain.waitForDeployment();

    return { rifaChain, mockVRFCoordinator, owner, creator, user1, user2, user3, user4, user5 };
  }

  describe("Validation", function () {
    it("Should revert if winner percentages do not sum to 100", async function () {
      const { rifaChain, creator } = await loadFixture(deployRifaChainFixture);
      const now = await time.latest();

      await expect(
        rifaChain.connect(creator).createRaffle(
          "Invalid %", "Desc", now + 100, now + 3600, 2, 100, true, 0, ethers.ZeroAddress, 0, creator.address, false,
          0, // fundingAmount
          [50, 40] // Sums to 90
        )
      ).to.be.revertedWithCustomError(rifaChain, "InvalidWinnerPercentages");
    });

    it("Should revert if min participants is less than number of winners", async function () {
      const { rifaChain, creator } = await loadFixture(deployRifaChainFixture);
      const now = await time.latest();

      await expect(
        rifaChain.connect(creator).createRaffle(
          "Invalid Participants", "Desc", now + 100, now + 3600, 1, 100, true, 0, ethers.ZeroAddress, 0, creator.address, false,
          0, // fundingAmount
          [50, 50] // 2 winners, but minParticipants is 1
        )
      ).to.be.revertedWithCustomError(rifaChain, "InvalidParticipantLimits");
    });
  });

  describe("Winner Selection and Distribution", function () {
    it("Should select multiple unique winners and distribute prizes correctly", async function () {
      const { rifaChain, mockVRFCoordinator, creator, user1, user2, user3, user4, user5 } = await loadFixture(deployRifaChainFixture);
      const now = await time.latest();
      const ticketPrice = ethers.parseEther("1");
      const winnerPercentages = [50, 30, 20]; // 1st: 50%, 2nd: 30%, 3rd: 20%

      // Create Raffle
      const tx = await rifaChain.connect(creator).createRaffle(
        "Multi Winner", "Desc", now + 100, now + 3600, 3, 100, true, 0, ethers.ZeroAddress, ticketPrice, creator.address, false,
        0, // fundingAmount
        winnerPercentages
      );
      const receipt = await tx.wait();
      const event = receipt.logs.find(log => log.fragment && log.fragment.name === 'RaffleCreated');
      const raffleId = event.args[0];

      await time.increaseTo(now + 101);

      // 5 Users join (Total Pot = 5 ETH)
      await rifaChain.connect(user1).joinRaffle(raffleId, 1, "0x", { value: ticketPrice });
      await rifaChain.connect(user2).joinRaffle(raffleId, 1, "0x", { value: ticketPrice });
      await rifaChain.connect(user3).joinRaffle(raffleId, 1, "0x", { value: ticketPrice });
      await rifaChain.connect(user4).joinRaffle(raffleId, 1, "0x", { value: ticketPrice });
      await rifaChain.connect(user5).joinRaffle(raffleId, 1, "0x", { value: ticketPrice });

      await time.increaseTo(now + 3601);

      // Request Winner
      const reqTx = await rifaChain.connect(creator).requestRandomWinner(raffleId);
      const reqReceipt = await reqTx.wait();
      const reqEvent = reqReceipt.logs.find(log => log.fragment && log.fragment.name === 'RandomnessRequested');
      const requestId = reqEvent.args[1];

      // Fulfill with random words (mocking VRF)
      // We provide enough random words for 3 winners. 
      // The contract requests `winnerPercentages.length` words.
      await expect(
        mockVRFCoordinator.fulfillRandomWords(await rifaChain.getAddress(), requestId, [123n, 456n, 789n])
      ).to.emit(rifaChain, "WinnerSelected");

      // Verify Winners
      const winners = await rifaChain.getRaffleWinners(raffleId);
      expect(winners.length).to.equal(3);
      
      // Ensure uniqueness (with 5 participants and 3 winners, collision is possible but handled by contract)
      const uniqueWinners = new Set(winners);
      expect(uniqueWinners.size).to.equal(3);

      // Verify Prize Distribution Events
      // We need to fetch the WinnerSelected events to check amounts
      const winnerEvents = (await rifaChain.queryFilter("WinnerSelected", reqReceipt.blockNumber))
          .filter(e => e.args.raffleId == raffleId);
      
      expect(winnerEvents.length).to.equal(3);

      const totalPot = ethers.parseEther("5");
      
      // 1st Winner: 50% of 5 ETH = 2.5 ETH
      expect(winnerEvents[0].args.percentage).to.equal(50);
      expect(winnerEvents[0].args.amount).to.equal(totalPot * 50n / 100n);

      // 2nd Winner: 30% of 5 ETH = 1.5 ETH
      expect(winnerEvents[1].args.percentage).to.equal(30);
      expect(winnerEvents[1].args.amount).to.equal(totalPot * 30n / 100n);

      // 3rd Winner: 20% of 5 ETH = 1.0 ETH
      expect(winnerEvents[2].args.percentage).to.equal(20);
      expect(winnerEvents[2].args.amount).to.equal(totalPot * 20n / 100n);
    });

    it("Should ensure 2nd place winner is not 1st place winner", async function () {
        const { rifaChain, mockVRFCoordinator, creator, user1, user2, user3 } = await loadFixture(deployRifaChainFixture);
        const now = await time.latest();
        const winnerPercentages = [70, 30];
  
        // Create Raffle
        const tx = await rifaChain.connect(creator).createRaffle(
          "Rank Check", "Desc", now + 100, now + 3600, 2, 100, true, 0, ethers.ZeroAddress, 0, creator.address, false,
          0, // fundingAmount
          winnerPercentages
        );
        const receipt = await tx.wait();
        const raffleId = receipt.logs.find(log => log.fragment && log.fragment.name === 'RaffleCreated').args[0];
  
        await time.increaseTo(now + 101);
  
        // 3 Users join
        await rifaChain.connect(user1).joinRaffle(raffleId, 1, "0x");
        await rifaChain.connect(user2).joinRaffle(raffleId, 1, "0x");
        await rifaChain.connect(user3).joinRaffle(raffleId, 1, "0x");
  
        await time.increaseTo(now + 3601);
  
        const reqTx = await rifaChain.connect(creator).requestRandomWinner(raffleId);
        const reqReceipt = await reqTx.wait();
        const requestId = reqReceipt.logs.find(log => log.fragment && log.fragment.name === 'RandomnessRequested').args[1];
  
        await mockVRFCoordinator.fulfillRandomWords(await rifaChain.getAddress(), requestId, [1n, 2n]);
  
        const winners = await rifaChain.getRaffleWinners(raffleId);
        expect(winners.length).to.equal(2);
        expect(winners[0]).to.not.equal(winners[1]); // 1st and 2nd must be different
    });
  });
});
