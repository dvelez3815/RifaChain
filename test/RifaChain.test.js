const {
  time,
  loadFixture,
} = require("@nomicfoundation/hardhat-toolbox/network-helpers");
const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");
const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("RifaChain", function () {
  // Fixture to deploy contracts and set up common state
  async function deployRifaChainFixture() {
    const [owner, creator, user1, user2, user3] = await ethers.getSigners();

    // Mock VRF Constants
    const subscriptionId = 1n; // uint256 for VRF v2.5
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

    // Deploy MockERC20
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    const mockToken = await MockERC20.deploy("Mock Token", "MCK");
    await mockToken.waitForDeployment();

    return { rifaChain, mockToken, mockVRFCoordinator, owner, creator, user1, user2, user3, subscriptionId, keyHash };
  }

  describe("Deployment", function () {
    it("Should set the right owner", async function () {
      const { rifaChain, owner } = await loadFixture(deployRifaChainFixture);
      expect(await rifaChain.owner()).to.equal(owner.address);
    });

    it("Should start with 0 raffles", async function () {
      const { rifaChain } = await loadFixture(deployRifaChainFixture);
      expect(await rifaChain.raffleCount()).to.equal(0);
    });
  });

  describe("Raffle Creation", function () {
    it("Should create a public raffle with native token correctly", async function () {
      const { rifaChain, creator } = await loadFixture(deployRifaChainFixture);
      
      const now = await time.latest();
      const startTime = now + 100;
      const endTime = now + 3600;
      const ticketPrice = ethers.parseEther("0.1");

      const duration = endTime - startTime;
      const fee = await rifaChain.getCreationFee(1, duration);

      const tx = await rifaChain.connect(creator).createRaffle(
        "Test Raffle",
        "Description",
        startTime,
        endTime,
        1, // minParticipants
        100, // maxParticipants
        true, // isPublic
        0, // TokenType.NATIVE
        ethers.ZeroAddress, // Native token
        ticketPrice,
        creator.address, // payoutAddress
        true, // allowMultipleEntries
        0, // fundingAmount
        [100], // winnerPercentages
        { value: fee }
      );

      const receipt = await tx.wait();
      const event = receipt.logs.find(log => log.fragment && log.fragment.name === 'RaffleCreated');
      const raffleId = event.args[0];

      expect(event).to.not.be.undefined;
      expect(event.args[1]).to.equal(creator.address);
      expect(event.args[6]).to.equal(startTime);

      const raffle = await rifaChain.getRaffle(raffleId);
      expect(raffle.title).to.equal("Test Raffle");
      expect(raffle.creator).to.equal(creator.address);
    });

    it("Should create a private raffle with ERC20 token correctly", async function () {
      const { rifaChain, mockToken, creator } = await loadFixture(deployRifaChainFixture);
      
      const now = await time.latest();
      const startTime = now + 100;
      const endTime = now + 3600;
      const ticketPrice = ethers.parseUnits("10", 18);
      const inviteCode = "SECRET123";

      const duration = endTime - startTime;
      const fee = await rifaChain.getCreationFee(1, duration);

      const tx = await rifaChain.connect(creator).createRaffle(
        "Private Raffle",
        "Desc",
        startTime,
        endTime,
        1, // minParticipants
        0, // unlimited
        false, // isPublic
        1, // TokenType.ERC20
        await mockToken.getAddress(),
        ticketPrice,
        creator.address,
        true, // allowMultipleEntries
        0, // fundingAmount
        [100],
        { value: fee }
      );

      const receipt = await tx.wait();
      const event = receipt.logs.find(log => log.fragment && log.fragment.name === 'RaffleCreated');
      const raffleId = event.args[0];

      const raffle = await rifaChain.getRaffle(raffleId);
      expect(raffle.isPublic).to.be.false;
      expect(raffle.tokenAddress).to.equal(await mockToken.getAddress());
    });

    it("Should revert if startTime >= endTime", async function () {
      const { rifaChain, creator } = await loadFixture(deployRifaChainFixture);
      const now = await time.latest();
      
      await expect(
        rifaChain.connect(creator).createRaffle(
          "Bad Time", "Desc", now + 200, now + 100, 1, 10, true, 0, ethers.ZeroAddress, 0, creator.address, true, 0, [100]
        )
      ).to.be.revertedWithCustomError(rifaChain, "InvalidTimeRange");
    });

    it("Should revert if payoutAddress is zero address", async function () {
      const { rifaChain, creator } = await loadFixture(deployRifaChainFixture);
      const now = await time.latest();
      
      await expect(
        rifaChain.connect(creator).createRaffle(
          "Bad Address", "Desc", now + 100, now + 200, 1, 10, true, 0, ethers.ZeroAddress, 0, ethers.ZeroAddress, true, 0, [100]
        )
      ).to.be.revertedWithCustomError(rifaChain, "InvalidPayoutAddress");
    });

    it("Should revert if minParticipants > maxParticipants", async function () {
        const { rifaChain, creator } = await loadFixture(deployRifaChainFixture);
        const now = await time.latest();
        
        await expect(
          rifaChain.connect(creator).createRaffle(
            "Bad Limits", "Desc", now + 100, now + 200, 11, 10, true, 0, ethers.ZeroAddress, 0, creator.address, true, 0, [100]
          )
        ).to.be.revertedWithCustomError(rifaChain, "InvalidParticipantLimits");
      });

    it("Should allow maxParticipants = 0 with minParticipants set", async function () {
        const { rifaChain, creator } = await loadFixture(deployRifaChainFixture);
        const now = await time.latest();
        
        const duration = 100; // 200 - 100
        const fee = await rifaChain.getCreationFee(1, duration);

        await expect(
          rifaChain.connect(creator).createRaffle(
            "Unlimited", "Desc", now + 100, now + 200, 10, 0, true, 0, ethers.ZeroAddress, 0, creator.address, true, 0, [100],
            { value: fee }
          )
        ).to.not.be.reverted;
    });
  });

  describe("Participation", function () {
    async function createActiveRaffleFixture() {
      const base = await deployRifaChainFixture();
      const { rifaChain, creator, mockToken } = base;
      
      const now = await time.latest();
      const startTime = now + 100;
      const endTime = now + 3600;
      const ticketPrice = ethers.parseEther("0.1");
      const erc20Price = ethers.parseUnits("10", 18);

      // Raffle 1: Native Token
      const duration = endTime - startTime;
      const fee1 = await rifaChain.getCreationFee(1, duration);
      let tx = await rifaChain.connect(creator).createRaffle(
        "Native Raffle", "Desc", startTime, endTime, 1, 2, true, 0, ethers.ZeroAddress, ticketPrice, creator.address, true, 0, [100],
        { value: fee1 }
      );
      let receipt = await tx.wait();
      let event = receipt.logs.find(log => log.fragment && log.fragment.name === 'RaffleCreated');
      const raffleId1 = event.args[0];

      // Raffle 2: ERC20 Token
      const fee2 = await rifaChain.getCreationFee(1, duration);
      tx = await rifaChain.connect(creator).createRaffle(
        "ERC20 Raffle", "Desc", startTime, endTime, 1, 10, true, 1, await mockToken.getAddress(), erc20Price, creator.address, true, 0, [100],
        { value: fee2 }
      );
      receipt = await tx.wait();
      event = receipt.logs.find(log => log.fragment && log.fragment.name === 'RaffleCreated');
      const raffleId2 = event.args[0];

      // Raffle 3: Free Raffle
      const fee3 = await rifaChain.getCreationFee(1, duration);
      tx = await rifaChain.connect(creator).createRaffle(
        "Free Raffle", "Desc", startTime, endTime, 1, 10, true, 0, ethers.ZeroAddress, 0, creator.address, true, 0, [100],
        { value: fee3 }
      );
      receipt = await tx.wait();
      event = receipt.logs.find(log => log.fragment && log.fragment.name === 'RaffleCreated');
      const raffleId3 = event.args[0];

      // Advance time to start
      await time.increaseTo(startTime + 1);

      return { ...base, ticketPrice, erc20Price, raffleId1, raffleId2, raffleId3 };
    }

    it("Should allow joining a native token raffle with correct payment", async function () {
      const { rifaChain, user1, ticketPrice, creator, raffleId1 } = await loadFixture(createActiveRaffleFixture);

      const initialBalance = await ethers.provider.getBalance(creator.address);

      await expect(
        rifaChain.connect(user1).joinRaffle(raffleId1, 1, "0x", { value: ticketPrice })
      ).to.emit(rifaChain, "UserJoinedRaffle")
      .withArgs(raffleId1, user1.address, ticketPrice, 1);

      // Check contract balance increased
      const contractBalance = await ethers.provider.getBalance(await rifaChain.getAddress());
      expect(contractBalance).to.equal(ticketPrice);

      // Check participant recorded
      const count = (await rifaChain.getParticipants(raffleId1)).length;
      expect(count).to.equal(1);
      const participants = await rifaChain.getParticipants(raffleId1);
      expect(participants[0]).to.equal(user1.address);
    });

    it("Should revert joining native raffle with incorrect payment", async function () {
      const { rifaChain, user1, ticketPrice, raffleId1 } = await loadFixture(createActiveRaffleFixture);

      await expect(
        rifaChain.connect(user1).joinRaffle(raffleId1, 1, "0x", { value: ticketPrice - 1n })
      ).to.be.revertedWithCustomError(rifaChain, "IncorrectPayment");

      await expect(
        rifaChain.connect(user1).joinRaffle(raffleId1, 1, "0x", { value: ticketPrice + 1n })
      ).to.be.revertedWithCustomError(rifaChain, "IncorrectPayment");
    });

    it("Should allow joining ERC20 raffle with approval", async function () {
      const { rifaChain, mockToken, user1, creator, erc20Price, raffleId2 } = await loadFixture(createActiveRaffleFixture);

      // Mint and Approve
      await mockToken.mint(user1.address, erc20Price);
      await mockToken.connect(user1).approve(await rifaChain.getAddress(), erc20Price);

      const initialCreatorBalance = await mockToken.balanceOf(creator.address);

      await expect(
        rifaChain.connect(user1).joinRaffle(raffleId2, 1, "0x")
      ).to.emit(rifaChain, "UserJoinedRaffle");

      const contractBalance = await mockToken.balanceOf(await rifaChain.getAddress());
      expect(contractBalance).to.equal(erc20Price);
    });

    it("Should revert ERC20 join if ETH is sent", async function () {
      const { rifaChain, user1, raffleId2 } = await loadFixture(createActiveRaffleFixture);
      await expect(
        rifaChain.connect(user1).joinRaffle(raffleId2, 1, "0x", { value: 100 })
      ).to.be.revertedWithCustomError(rifaChain, "IncorrectPayment");
    });

    it("Should allow joining a free raffle", async function () {
      const { rifaChain, user1, raffleId3 } = await loadFixture(createActiveRaffleFixture);
      await expect(
        rifaChain.connect(user1).joinRaffle(raffleId3, 1, "0x")
      ).to.emit(rifaChain, "UserJoinedRaffle");
    });

    it("Should revert free raffle join if ETH is sent", async function () {
      const { rifaChain, user1, raffleId3 } = await loadFixture(createActiveRaffleFixture);
      await expect(
        rifaChain.connect(user1).joinRaffle(raffleId3, 1, "0x", { value: 100 })
      ).to.be.revertedWithCustomError(rifaChain, "IncorrectPayment");
    });

    it("Should revert if raffle is not active (before start)", async function () {
      const { rifaChain, creator } = await loadFixture(deployRifaChainFixture);
      const now = await time.latest();
      const duration = 1000;
      const fee = await rifaChain.getCreationFee(1, duration);
      const tx = await rifaChain.connect(creator).createRaffle(
        "Future", "Desc", now + 1000, now + 2000, 1, 0, true, 0, ethers.ZeroAddress, 0, creator.address, true, 0, [100],
        { value: fee }
      );
      const receipt = await tx.wait();
      const event = receipt.logs.find(log => log.fragment && log.fragment.name === 'RaffleCreated');
      const raffleId = event.args[0];
      
      await expect(
        rifaChain.joinRaffle(raffleId, 1, "0x")
      ).to.be.revertedWithCustomError(rifaChain, "RaffleNotActive");
    });

    it("Should revert if raffle is ended", async function () {
      const { rifaChain, creator } = await loadFixture(deployRifaChainFixture);
      const now = await time.latest();
      const duration = 10;
      const fee = await rifaChain.getCreationFee(1, duration);
      const tx = await rifaChain.connect(creator).createRaffle(
        "Past", "Desc", now + 10, now + 20, 1, 0, true, 0, ethers.ZeroAddress, 0, creator.address, true, 0, [100],
        { value: fee }
      );
      const receipt = await tx.wait();
      const event = receipt.logs.find(log => log.fragment && log.fragment.name === 'RaffleCreated');
      const raffleId = event.args[0];
      
      await time.increaseTo(now + 30);

        await expect(
        rifaChain.joinRaffle(raffleId, 1, "0x")
      ).to.be.revertedWithCustomError(rifaChain, "RaffleEnded");
    });

    it("Should revert if winners already selected (early draw)", async function () {
        const { rifaChain, mockVRFCoordinator, creator, user1, user2, user3 } = await loadFixture(deployRifaChainFixture);
        const now = await time.latest();
        const startTime = now + 100;
        const endTime = now + 3600;

        // Create raffle with minParticipants = 2
        const duration = endTime - startTime;
        const fee = await rifaChain.getCreationFee(1, duration);
        const tx = await rifaChain.connect(creator).createRaffle(
          "Early Draw Raffle", "Desc", startTime, endTime, 2, 0, true, 0, ethers.ZeroAddress, 0, creator.address, true, 0, [100],
          { value: fee }
        );
        const receipt = await tx.wait();
        const event = receipt.logs.find(log => log.fragment && log.fragment.name === 'RaffleCreated');
        const raffleId = event.args[0];

        await time.increaseTo(startTime + 1);

        // Add 2 participants
        await rifaChain.connect(user1).joinRaffle(raffleId, 1, "0x");
        await rifaChain.connect(user2).joinRaffle(raffleId, 1, "0x");

        // Request and fulfill winner
        const reqTx = await rifaChain.connect(creator).requestRandomWinner(raffleId);
        const reqReceipt = await reqTx.wait();
        const reqEvent = reqReceipt.logs.find(log => log.fragment && log.fragment.name === 'RandomnessRequested');
        await mockVRFCoordinator.fulfillRandomWords(await rifaChain.getAddress(), reqEvent.args[1], [999n]);

        // Try to join after winner selected
        await expect(
            rifaChain.connect(user3).joinRaffle(raffleId, 1, "0x")
        ).to.be.revertedWithCustomError(rifaChain, "RaffleNotActive");
    });

    it("Should revert if raffle is full", async function () {
      const { rifaChain, user1, user2, user3, ticketPrice, raffleId1 } = await loadFixture(createActiveRaffleFixture);
      // Raffle 1 has maxParticipants = 2
      
      await rifaChain.connect(user1).joinRaffle(raffleId1, 1, "0x", { value: ticketPrice });
      await rifaChain.connect(user2).joinRaffle(raffleId1, 1, "0x", { value: ticketPrice });
      
      await expect(
        rifaChain.connect(user3).joinRaffle(raffleId1, 1, "0x", { value: ticketPrice })
      ).to.be.revertedWithCustomError(rifaChain, "RaffleFull");
    });
    
    it("Should allow multiple joins from same user", async function () {
        const { rifaChain, user1, ticketPrice, raffleId1 } = await loadFixture(createActiveRaffleFixture);
        
        await rifaChain.connect(user1).joinRaffle(raffleId1, 1, "0x", { value: ticketPrice });
        await rifaChain.connect(user1).joinRaffle(raffleId1, 1, "0x", { value: ticketPrice });
        
        const count = (await rifaChain.getParticipants(raffleId1)).length;
        expect(count).to.equal(2);
    });

    describe("Multiple Entries Logic", function () {
        it("Should revert if user joins twice when multiple entries disabled", async function () {
            const { rifaChain, creator, user1 } = await loadFixture(deployRifaChainFixture);
            const now = await time.latest();
            const ticketPrice = ethers.parseEther("0.1");

            // Create raffle with allowMultipleEntries = false
            const duration = 3500;
            const fee = await rifaChain.getCreationFee(1, duration);
            const tx = await rifaChain.connect(creator).createRaffle(
                "Single Entry", "Desc", now + 100, now + 3600, 1, 0, true, 0, ethers.ZeroAddress, ticketPrice, creator.address,
                false, // allowMultipleEntries = false
                0, // fundingAmount
                [100],
                { value: fee }
            );
            const receipt = await tx.wait();
            const event = receipt.logs.find(log => log.fragment && log.fragment.name === 'RaffleCreated');
            const raffleId = event.args[0];

            await time.increaseTo(now + 101);

            // First join success
            await rifaChain.connect(user1).joinRaffle(raffleId, 1, "0x", { value: ticketPrice });

            // Second join fail
            await expect(
                rifaChain.connect(user1).joinRaffle(raffleId, 1, "0x", { value: ticketPrice })
            ).to.be.revertedWithCustomError(rifaChain, "AlreadyJoined");
        });

        it("Should revert if user buys > 1 ticket when multiple entries disabled", async function () {
            const { rifaChain, creator, user1 } = await loadFixture(deployRifaChainFixture);
            const now = await time.latest();
            const ticketPrice = ethers.parseEther("0.1");

            // Create raffle with allowMultipleEntries = false
            const duration = 3500;
            const fee = await rifaChain.getCreationFee(1, duration);
            const tx = await rifaChain.connect(creator).createRaffle(
                "Single Entry", "Desc", now + 100, now + 3600, 1, 0, true, 0, ethers.ZeroAddress, ticketPrice, creator.address,
                false, // allowMultipleEntries = false
                0, // fundingAmount
                [100],
                { value: fee }
            );
            const receipt = await tx.wait();
            const event = receipt.logs.find(log => log.fragment && log.fragment.name === 'RaffleCreated');
            const raffleId = event.args[0];

            await time.increaseTo(now + 101);

            // Try to buy 2 tickets
            await expect(
                rifaChain.connect(user1).joinRaffle(raffleId, 2, "0x", { value: ticketPrice * 2n })
            ).to.be.revertedWithCustomError(rifaChain, "AlreadyJoined");
        });
    });
  });

  describe("Winner Selection", function () {
    async function createEndedRaffleFixture() {
      const base = await deployRifaChainFixture();
      const { rifaChain, creator, user1, user2, user3 } = base;
      
      const now = await time.latest();
      const startTime = now + 100;
      const endTime = now + 200;

      const duration = endTime - startTime;
      const fee = await rifaChain.getCreationFee(1, duration);
      const tx = await rifaChain.connect(creator).createRaffle(
        "Raffle", "Desc", startTime, endTime, 10, 0, true, 0, ethers.ZeroAddress, 0, creator.address, true, 0, [100],
        { value: fee }
      );
      const receipt = await tx.wait();
      const event = receipt.logs.find(log => log.fragment && log.fragment.name === 'RaffleCreated');
      const raffleId = event.args[0];

      await time.increaseTo(startTime + 1);
      
      // Add participants
      await rifaChain.connect(user1).joinRaffle(raffleId, 1, "0x");
      await rifaChain.connect(user2).joinRaffle(raffleId, 1, "0x");
      await rifaChain.connect(user3).joinRaffle(raffleId, 1, "0x");

      return { ...base, raffleId };
    }

    it("Should allow creator to request random winner and fulfill it", async function () {
      const { rifaChain, mockVRFCoordinator, creator, raffleId } = await loadFixture(createEndedRaffleFixture);
      
      // Advance time to end
      const now = await time.latest();
      await time.increaseTo(now + 300); // Ensure ended

      // Request winner
      const tx = await rifaChain.connect(creator).requestRandomWinner(raffleId);
      const receipt = await tx.wait();
      
      // Find Request ID from logs (emitted by MockVRFCoordinator or RifaChain)
      // RifaChain emits RandomnessRequested(raffleId, requestId)
      const event = receipt.logs.find(log => log.fragment && log.fragment.name === 'RandomnessRequested');
      const requestId = event.args[1];

      // Fulfill Randomness via Mock
      const randomWords = [12345n];
      await expect(
          mockVRFCoordinator.fulfillRandomWords(await rifaChain.getAddress(), requestId, randomWords)
      ).to.emit(rifaChain, "RaffleWinnersSelected");

      // Verify winner selected
      const raffle = await rifaChain.getRaffle(raffleId);
      expect(raffle.winnersSelected).to.be.true;
    });

    it("Should allow early draw if minParticipants reached", async function () {
      const { rifaChain, mockVRFCoordinator, creator, user1, user2 } = await loadFixture(deployRifaChainFixture);
      const now = await time.latest();
      const startTime = now + 100;
      const endTime = now + 3600; // Long duration

      // Create raffle with minParticipants = 2
      const duration = endTime - startTime;
      const fee = await rifaChain.getCreationFee(1, duration);
      const tx = await rifaChain.connect(creator).createRaffle(
        "Min Participants Raffle", "Desc", startTime, endTime, 2, 0, true, 0, ethers.ZeroAddress, 0, creator.address, true, 0, [100],
        { value: fee }
      );
      const receipt = await tx.wait();
      const event = receipt.logs.find(log => log.fragment && log.fragment.name === 'RaffleCreated');
      const raffleId = event.args[0];

      await time.increaseTo(startTime + 1);

      // Add 2 participants
      await rifaChain.connect(user1).joinRaffle(raffleId, 1, "0x");
      await rifaChain.connect(user2).joinRaffle(raffleId, 1, "0x");

      // Should succeed even though time hasn't passed
      const reqTx = await rifaChain.connect(creator).requestRandomWinner(raffleId);
      const reqReceipt = await reqTx.wait();
      const reqEvent = reqReceipt.logs.find(log => log.fragment && log.fragment.name === 'RandomnessRequested');
      const requestId = reqEvent.args[1];

      // Fulfill
      await mockVRFCoordinator.fulfillRandomWords(await rifaChain.getAddress(), requestId, [999n]);
      
      const raffle = await rifaChain.getRaffle(raffleId);
      expect(raffle.winnersSelected).to.be.true;
    });

    it("Should revert if unauthorized user tries to request winner", async function () {
      const { rifaChain, user1, raffleId } = await loadFixture(createEndedRaffleFixture);
      const now = await time.latest();
      await time.increaseTo(now + 300);

      await expect(
        rifaChain.connect(user1).requestRandomWinner(raffleId)
      ).to.be.revertedWithCustomError(rifaChain, "Unauthorized");
    });

    it("Should revert if raffle not ended", async function () {
      const { rifaChain, creator, raffleId } = await loadFixture(createEndedRaffleFixture);
      // Do not advance time enough
      
      await expect(
        rifaChain.connect(creator).requestRandomWinner(raffleId)
      ).to.be.revertedWithCustomError(rifaChain, "RaffleNotEnded");
    });

    it("Should ignore duplicate fulfillment", async function () {
        const { rifaChain, mockVRFCoordinator, creator, raffleId } = await loadFixture(createEndedRaffleFixture);
        const now = await time.latest();
        await time.increaseTo(now + 300);
  
        const tx = await rifaChain.connect(creator).requestRandomWinner(raffleId);
        const receipt = await tx.wait();
        const requestId = receipt.logs.find(log => log.fragment && log.fragment.name === 'RandomnessRequested').args[1];
  
        // First fulfillment
        await mockVRFCoordinator.fulfillRandomWords(await rifaChain.getAddress(), requestId, [123n]);
        
        // Second fulfillment (should be ignored, no revert, no event)
        await expect(
            mockVRFCoordinator.fulfillRandomWords(await rifaChain.getAddress(), requestId, [456n])
        ).to.not.emit(rifaChain, "WinnerSelected");
    });

    it("Should ignore fulfillment with invalid request ID", async function () {
        const { rifaChain, mockVRFCoordinator } = await loadFixture(createEndedRaffleFixture);
        
        // Random request ID not associated with any raffle
        const invalidRequestId = 99999n;
        
        await expect(
            mockVRFCoordinator.fulfillRandomWords(await rifaChain.getAddress(), invalidRequestId, [123n])
        ).to.not.emit(rifaChain, "WinnerSelected");
    });

    it("Should revert if winners already selected", async function () {
        const { rifaChain, mockVRFCoordinator, creator, raffleId } = await loadFixture(createEndedRaffleFixture);
        const now = await time.latest();
        await time.increaseTo(now + 300);
  
        // First request and fulfill
        const tx = await rifaChain.connect(creator).requestRandomWinner(raffleId);
        const receipt = await tx.wait();
        const event = receipt.logs.find(log => log.fragment && log.fragment.name === 'RandomnessRequested');
        await mockVRFCoordinator.fulfillRandomWords(await rifaChain.getAddress(), event.args[1], [1n]);
        
        // Try to request again
        await expect(
            rifaChain.connect(creator).requestRandomWinner(raffleId)
        ).to.be.revertedWithCustomError(rifaChain, "WinnersAlreadySelected");
    });

    it("Should revert if no participants", async function () {
        const { rifaChain, creator } = await loadFixture(deployRifaChainFixture);
        const now = await time.latest();
        const startTime = now + 100;
        const endTime = now + 200;
  
        const duration = endTime - startTime;
        const fee = await rifaChain.getCreationFee(1, duration);
        const tx = await rifaChain.connect(creator).createRaffle(
          "Empty Raffle", "Desc", startTime, endTime, 1, 0, true, 0, ethers.ZeroAddress, 0, creator.address, true, 0, [100],
          { value: fee }
        );
        const receipt = await tx.wait();
        const event = receipt.logs.find(log => log.fragment && log.fragment.name === 'RaffleCreated');
        const raffleId = event.args[0];

        await time.increaseTo(endTime + 1);

        await expect(
            rifaChain.connect(creator).requestRandomWinner(raffleId)
        ).to.be.revertedWithCustomError(rifaChain, "RaffleNotActive");
    });
  });

  describe("View Functions", function () {


    it("Should return correct user winnings", async function () {
        const { rifaChain, mockVRFCoordinator, creator, user1 } = await loadFixture(deployRifaChainFixture);
        const now = await time.latest();
        
        // Create raffle
        const duration = 100;
        const fee = await rifaChain.getCreationFee(1, duration);
        const tx = await rifaChain.connect(creator).createRaffle(
          "Winning Raffle", "Desc", now + 100, now + 200, 1, 0, true, 0, ethers.ZeroAddress, 0, creator.address, true, 0, [100],
          { value: fee }
        );
        const receipt = await tx.wait();
        const event = receipt.logs.find(log => log.fragment && log.fragment.name === 'RaffleCreated');
        const raffleId = event.args[0];

        await time.increaseTo(now + 101);
        
        // User1 joins
        await rifaChain.connect(user1).joinRaffle(raffleId, 1, "0x");

        await time.increaseTo(now + 300);

        // Request winner
        const reqTx = await rifaChain.connect(creator).requestRandomWinner(raffleId);
        const reqReceipt = await reqTx.wait();
        const reqEvent = reqReceipt.logs.find(log => log.fragment && log.fragment.name === 'RandomnessRequested');
        
        // Fulfill with user1 as winner (index 0)
        await mockVRFCoordinator.fulfillRandomWords(await rifaChain.getAddress(), reqEvent.args[1], [0n]);

        // Check winnings
        const winnings = await rifaChain.getUserWinnings(user1.address);
        expect(winnings.length).to.equal(1);
        expect(winnings[0]).to.equal(raffleId);
    });

    it("Should select winner and distribute ERC20 prizes correctly", async function () {
        const { rifaChain, mockVRFCoordinator, mockToken, creator, user1 } = await loadFixture(deployRifaChainFixture);
        const now = await time.latest();
        const erc20Price = ethers.parseUnits("10", 18);
        
        // Create ERC20 raffle
        const duration = 100;
        const fee = await rifaChain.getCreationFee(1, duration);

        // Approve funding
        await mockToken.mint(creator.address, erc20Price);
        await mockToken.connect(creator).approve(await rifaChain.getAddress(), erc20Price);

        const tx = await rifaChain.connect(creator).createRaffle(
          "ERC20 Win", "Desc", now + 100, now + 200, 1, 0, true, 1, await mockToken.getAddress(), erc20Price, creator.address, true, erc20Price, [100],
          { value: fee }
        );
        const receipt = await tx.wait();
        const event = receipt.logs.find(log => log.fragment && log.fragment.name === 'RaffleCreated');
        const raffleId = event.args[0];

        await time.increaseTo(now + 101);
        
        // User1 joins
        await mockToken.mint(user1.address, erc20Price);
        await mockToken.connect(user1).approve(await rifaChain.getAddress(), erc20Price);
        await rifaChain.connect(user1).joinRaffle(raffleId, 1, "0x");

        await time.increaseTo(now + 300);

        // Request winner
        const reqTx = await rifaChain.connect(creator).requestRandomWinner(raffleId);
        const reqReceipt = await reqTx.wait();
        const reqEvent = reqReceipt.logs.find(log => log.fragment && log.fragment.name === 'RandomnessRequested');
        
        // Fulfill with user1 as winner
        await expect(
            mockVRFCoordinator.fulfillRandomWords(await rifaChain.getAddress(), reqEvent.args[1], [0n])
        ).to.emit(rifaChain, "WinnerSelected");

        // Check ERC20 transfer
        // Winner must claim
        const pending = await rifaChain.getPendingWinnings(raffleId, user1.address);
        expect(pending).to.equal(erc20Price);

        // Claim
        await rifaChain.connect(user1).claimPrize(raffleId);
        
        const balance = await mockToken.balanceOf(user1.address);
        expect(balance).to.equal(erc20Price);
    });
  });

  describe("Admin Functions", function () {
    it("Should allow owner to set callback gas limit", async function () {
        const { rifaChain, owner } = await loadFixture(deployRifaChainFixture);
        
        await expect(rifaChain.connect(owner).setCallbackGasLimit(500000))
            .to.emit(rifaChain, "GasLimitUpdated")
            .withArgs(500000);
    });

    it("Should allow owner to set creation fees", async function () {
        const { rifaChain, owner } = await loadFixture(deployRifaChainFixture);
        const newBaseFee = ethers.parseEther("0.01");
        const newAdditionalFee = ethers.parseEther("0.005");
        
        await expect(rifaChain.connect(owner).setCreationFees(newBaseFee, newAdditionalFee))
            .to.emit(rifaChain, "CreationFeeUpdated")
            .withArgs(newBaseFee, newAdditionalFee);
    });

    it("Should allow owner to set subscription ID", async function () {
        const { rifaChain, owner } = await loadFixture(deployRifaChainFixture);
        
        await expect(rifaChain.connect(owner).setSubscriptionId(999))
            .to.emit(rifaChain, "SubscriptionIdUpdated")
            .withArgs(999);
    });

    it("Should allow owner to set key hash", async function () {
        const { rifaChain, owner } = await loadFixture(deployRifaChainFixture);
        const newHash = "0x1234567890123456789012345678901234567890123456789012345678901234";
        
        await expect(rifaChain.connect(owner).setKeyHash(newHash))
            .to.emit(rifaChain, "KeyHashUpdated")
            .withArgs(newHash);
    });

    it("Should allow owner to set grace period", async function () {
        const { rifaChain, owner } = await loadFixture(deployRifaChainFixture);
        const newPeriod = 7 * 24 * 60 * 60; // 7 days
        
        await expect(rifaChain.connect(owner).setGracePeriod(newPeriod))
            .to.emit(rifaChain, "GracePeriodUpdated")
            .withArgs(newPeriod);
    });

    it("Should allow owner to set duration fee", async function () {
        const { rifaChain, owner } = await loadFixture(deployRifaChainFixture);
        const newFee = ethers.parseEther("0.02");
        
        await expect(rifaChain.connect(owner).setDurationFee(newFee))
            .to.emit(rifaChain, "DurationFeeUpdated")
            .withArgs(newFee);
    });

    it("Should allow owner to set platform fee", async function () {
        const { rifaChain, owner } = await loadFixture(deployRifaChainFixture);
        const newFee = 500; // 5%
        
        await expect(rifaChain.connect(owner).setPlatformFee(newFee))
            .to.emit(rifaChain, "PlatformFeeUpdated")
            .withArgs(newFee);
    });

    it("Should revert if platform fee is too high", async function () {
        const { rifaChain, owner } = await loadFixture(deployRifaChainFixture);
        await expect(rifaChain.connect(owner).setPlatformFee(2001))
            .to.be.revertedWith("Fee too high");
    });

    it("Should allow owner to set fee recipient", async function () {
        const { rifaChain, owner, user1 } = await loadFixture(deployRifaChainFixture);
        
        await expect(rifaChain.connect(owner).setFeeRecipient(user1.address))
            .to.emit(rifaChain, "FeeRecipientUpdated")
            .withArgs(user1.address);
    });

    it("Should revert if fee recipient is zero address", async function () {
        const { rifaChain, owner } = await loadFixture(deployRifaChainFixture);
        await expect(rifaChain.connect(owner).setFeeRecipient(ethers.ZeroAddress))
            .to.be.revertedWith("Invalid address");
    });

    it("Should revert if non-owner tries to set gas limit", async function () {
        const { rifaChain, user1 } = await loadFixture(deployRifaChainFixture);
        
        await expect(
        rifaChain.connect(user1).setCallbackGasLimit(100000)
      ).to.be.revertedWith("Only callable by owner");
    });
  });

  describe("Funding & Claims", function () {
    it("Should create a raffle with initial funding (Native)", async function () {
        const { rifaChain, creator } = await loadFixture(deployRifaChainFixture);
        const now = await time.latest();
        const fundingAmount = ethers.parseEther("1.0");
        const duration = 100;
        const fee = await rifaChain.getCreationFee(1, duration);
        
        const tx = await rifaChain.connect(creator).createRaffle(
            "Funded Raffle", "Desc", now + 100, now + 200, 1, 0, true, 0, ethers.ZeroAddress, 0, creator.address, true, 
            fundingAmount, 
            [100],
            { value: fundingAmount + fee }
        );
        
        const receipt = await tx.wait();
        const event = receipt.logs.find(log => log.fragment && log.fragment.name === 'RaffleCreated');
        const raffleId = event.args[0];

        const raffle = await rifaChain.getRaffle(raffleId);
        expect(raffle.fundingAmount).to.equal(fundingAmount);
        expect(raffle.prizePool).to.equal(fundingAmount);
        
        // Check contract balance
        const balance = await ethers.provider.getBalance(await rifaChain.getAddress());
        expect(balance).to.equal(fundingAmount);
    });

    it("Should create a raffle with initial funding (ERC20)", async function () {
        const { rifaChain, mockToken, creator } = await loadFixture(deployRifaChainFixture);
        const now = await time.latest();
        const fundingAmount = ethers.parseUnits("100", 18);
        
        // Approve
        await mockToken.mint(creator.address, fundingAmount);
        await mockToken.connect(creator).approve(await rifaChain.getAddress(), fundingAmount);

        const duration = 100;
        const fee = await rifaChain.getCreationFee(1, duration);

        const tx = await rifaChain.connect(creator).createRaffle(
            "Funded ERC20", "Desc", now + 100, now + 200, 1, 0, true, 1, await mockToken.getAddress(), 0, creator.address, true, 
            fundingAmount, 
            [100],
            { value: fee }
        );
        
        const receipt = await tx.wait();
        const event = receipt.logs.find(log => log.fragment && log.fragment.name === 'RaffleCreated');
        const raffleId = event.args[0];

        const raffle = await rifaChain.getRaffle(raffleId);
        expect(raffle.fundingAmount).to.equal(fundingAmount);
        expect(raffle.prizePool).to.equal(fundingAmount);
        
        // Check contract balance
        const balance = await mockToken.balanceOf(await rifaChain.getAddress());
        expect(balance).to.equal(fundingAmount);
    });

    it("Should revert if funding amount is incorrect (Native)", async function () {
        const { rifaChain, creator } = await loadFixture(deployRifaChainFixture);
        const now = await time.latest();
        const fundingAmount = ethers.parseEther("1.0");
        const duration = 100;
        const fee = await rifaChain.getCreationFee(1, duration);
        
        await expect(
            rifaChain.connect(creator).createRaffle(
                "Funded Raffle", "Desc", now + 100, now + 200, 1, 0, true, 0, ethers.ZeroAddress, 0, creator.address, true, 
                fundingAmount, 
                [100],
                { value: ethers.parseEther("0.5") } // Incorrect value (should be fundingAmount + fee)
            )
        ).to.be.revertedWithCustomError(rifaChain, "IncorrectPayment");
    });

    it("Should allow winner to claim prize (Native)", async function () {
        const { rifaChain, mockVRFCoordinator, creator, user1 } = await loadFixture(deployRifaChainFixture);
        const now = await time.latest();
        const fundingAmount = ethers.parseEther("1.0");
        const duration = 100;
        const fee = await rifaChain.getCreationFee(1, duration);
        
        // Create funded raffle
        const tx = await rifaChain.connect(creator).createRaffle(
            "Funded Win", "Desc", now + 100, now + 200, 1, 0, true, 0, ethers.ZeroAddress, 0, creator.address, true, 
            fundingAmount, 
            [100],
            { value: fundingAmount + fee }
        );
        const receipt = await tx.wait();
        const raffleId = receipt.logs.find(log => log.fragment && log.fragment.name === 'RaffleCreated').args[0];

        await time.increaseTo(now + 101);
        await rifaChain.connect(user1).joinRaffle(raffleId, 1, "0x");
        
        await time.increaseTo(now + 300);
        
        // Pick winner
        const reqTx = await rifaChain.connect(creator).requestRandomWinner(raffleId);
        const reqReceipt = await reqTx.wait();
        const requestId = reqReceipt.logs.find(log => log.fragment && log.fragment.name === 'RandomnessRequested').args[1];
        await mockVRFCoordinator.fulfillRandomWords(await rifaChain.getAddress(), requestId, [0n]);

        // Check pending
        const pending = await rifaChain.getPendingWinnings(raffleId, user1.address);
        expect(pending).to.equal(fundingAmount);

        // Claim
        const initialBalance = await ethers.provider.getBalance(user1.address);
        const claimTx = await rifaChain.connect(user1).claimPrize(raffleId);
        const claimReceipt = await claimTx.wait();
        
        // Calculate gas used
        const gasUsed = claimReceipt.gasUsed * claimReceipt.gasPrice;
        const finalBalance = await ethers.provider.getBalance(user1.address);
        
        expect(finalBalance + gasUsed - initialBalance).to.equal(fundingAmount);
        
        // Check pending reset
        const pendingAfter = await rifaChain.getPendingWinnings(raffleId, user1.address);
        expect(pendingAfter).to.equal(0);
    });

    it("Should revert if no pending winnings", async function () {
        const { rifaChain, user1 } = await loadFixture(deployRifaChainFixture);
        // Random raffle ID
        await expect(
            rifaChain.connect(user1).claimPrize(123)
        ).to.be.revertedWithCustomError(rifaChain, "NoPendingWinnings");
    });
  });
});
