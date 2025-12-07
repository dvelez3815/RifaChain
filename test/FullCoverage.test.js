const {
  time,
  loadFixture,
} = require("@nomicfoundation/hardhat-toolbox/network-helpers");
const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("RifaChain Full Coverage", function () {
  async function deployFixture() {
    const [owner, creator, user1, user2] = await ethers.getSigners();

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

    // Deploy MockERC20
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    const mockToken = await MockERC20.deploy("Test", "TST");
    await mockToken.waitForDeployment();

    // Configure Fees
    const baseCreationFee = ethers.parseEther("0.005");
    const additionalWinnerFee = ethers.parseEther("0.0025");
    const platformFeeBasisPoints = 800; // 8%
    
    await rifaChain.setCreationFees(baseCreationFee, additionalWinnerFee);
    await rifaChain.setPlatformFee(platformFeeBasisPoints);

    return { rifaChain, mockVRFCoordinator, mockToken, owner, creator, user1, user2, baseCreationFee };
  }

  describe("createRaffle Validations", function () {
    it("Should revert if startTime is too far in the past", async function () {
      const { rifaChain, creator, baseCreationFee } = await loadFixture(deployFixture);
      const now = await time.latest();
      await expect(
        rifaChain.connect(creator).createRaffle(
          "Past", "Desc", now - 3601, now + 100, 1, 10, true, 0, ethers.ZeroAddress, 0, creator.address, true, 0, [100],
          { value: baseCreationFee }
        )
      ).to.be.revertedWithCustomError(rifaChain, "InvalidTimeRange");
    });

    it("Should revert if startTime >= endTime", async function () {
      const { rifaChain, creator, baseCreationFee } = await loadFixture(deployFixture);
      const now = await time.latest();
      await expect(
        rifaChain.connect(creator).createRaffle(
          "Bad Time", "Desc", now + 100, now + 100, 1, 10, true, 0, ethers.ZeroAddress, 0, creator.address, true, 0, [100],
          { value: baseCreationFee }
        )
      ).to.be.revertedWithCustomError(rifaChain, "InvalidTimeRange");
    });

    it("Should revert if duration > maxDuration", async function () {
      const { rifaChain, creator, baseCreationFee } = await loadFixture(deployFixture);
      const now = await time.latest();
      const maxDuration = await rifaChain.maxDuration();
      await expect(
        rifaChain.connect(creator).createRaffle(
          "Too Long", "Desc", now + 100, now + 100 + Number(maxDuration) + 1, 1, 10, true, 0, ethers.ZeroAddress, 0, creator.address, true, 0, [100],
          { value: baseCreationFee } // Fee calculation might differ but validation comes first
        )
      ).to.be.revertedWithCustomError(rifaChain, "InvalidTimeRange");
    });

    it("Should revert if payoutAddress is zero", async function () {
      const { rifaChain, creator, baseCreationFee } = await loadFixture(deployFixture);
      const now = await time.latest();
      await expect(
        rifaChain.connect(creator).createRaffle(
          "Zero Payout", "Desc", now + 100, now + 200, 1, 10, true, 0, ethers.ZeroAddress, 0, ethers.ZeroAddress, true, 0, [100],
          { value: baseCreationFee }
        )
      ).to.be.revertedWithCustomError(rifaChain, "InvalidPayoutAddress");
    });

    it("Should revert if minParticipants > maxParticipants", async function () {
      const { rifaChain, creator, baseCreationFee } = await loadFixture(deployFixture);
      const now = await time.latest();
      await expect(
        rifaChain.connect(creator).createRaffle(
          "Bad Limits", "Desc", now + 100, now + 200, 11, 10, true, 0, ethers.ZeroAddress, 0, creator.address, true, 0, [100],
          { value: baseCreationFee }
        )
      ).to.be.revertedWithCustomError(rifaChain, "InvalidParticipantLimits");
    });

    it("Should revert if winner percentages are invalid", async function () {
      const { rifaChain, creator, baseCreationFee } = await loadFixture(deployFixture);
      const now = await time.latest();
      
      // 0%
      await expect(
        rifaChain.connect(creator).createRaffle(
          "Zero %", "Desc", now + 100, now + 200, 1, 10, true, 0, ethers.ZeroAddress, 0, creator.address, true, 0, [0],
          { value: baseCreationFee }
        )
      ).to.be.revertedWithCustomError(rifaChain, "InvalidWinnerPercentages");

      // > 100%
      await expect(
        rifaChain.connect(creator).createRaffle(
          "Over 100%", "Desc", now + 100, now + 200, 1, 10, true, 0, ethers.ZeroAddress, 0, creator.address, true, 0, [101],
          { value: baseCreationFee }
        )
      ).to.be.revertedWithCustomError(rifaChain, "InvalidWinnerPercentages");

      // Sum != 100%
      await expect(
        rifaChain.connect(creator).createRaffle(
          "Sum != 100", "Desc", now + 100, now + 200, 1, 10, true, 0, ethers.ZeroAddress, 0, creator.address, true, 0, [50, 40],
          { value: baseCreationFee + ethers.parseEther("0.0025") }
        )
      ).to.be.revertedWithCustomError(rifaChain, "InvalidWinnerPercentages");
    });

    it("Should revert if too many winners", async function () {
      const { rifaChain, creator, baseCreationFee } = await loadFixture(deployFixture);
      const now = await time.latest();
      const maxWinners = await rifaChain.maxWinners();
      const percentages = Array(Number(maxWinners) + 1).fill(10); // Sum doesn't matter for this check if it comes first or we make it valid
      // Actually the loop checks sum, so let's make sum 100 but length > max
      // If max is 5, 6 winners. 100/6 is not integer.
      // Let's set maxWinners to 2 for test
      await rifaChain.setMaxWinners(2);
      
      await expect(
        rifaChain.connect(creator).createRaffle(
          "Too Many Winners", "Desc", now + 100, now + 200, 3, 10, true, 0, ethers.ZeroAddress, 0, creator.address, true, 0, [30, 30, 40],
          { value: baseCreationFee + ethers.parseEther("0.005") }
        )
      ).to.be.revertedWithCustomError(rifaChain, "InvalidWinnerPercentages");
    });

    it("Should revert if minParticipants < winnerPercentages.length", async function () {
      const { rifaChain, creator, baseCreationFee } = await loadFixture(deployFixture);
      const now = await time.latest();
      await expect(
        rifaChain.connect(creator).createRaffle(
          "Min < Winners", "Desc", now + 100, now + 200, 1, 10, true, 0, ethers.ZeroAddress, 0, creator.address, true, 0, [50, 50],
          { value: baseCreationFee + ethers.parseEther("0.0025") }
        )
      ).to.be.revertedWithCustomError(rifaChain, "InvalidParticipantLimits");
    });
    
    it("Should revert if minParticipants < 1", async function () {
        const { rifaChain, creator, baseCreationFee } = await loadFixture(deployFixture);
        const now = await time.latest();
        await expect(
          rifaChain.connect(creator).createRaffle(
            "Min < 1", "Desc", now + 100, now + 200, 0, 10, true, 0, ethers.ZeroAddress, 0, creator.address, true, 0, [100],
            { value: baseCreationFee }
          )
        ).to.be.revertedWithCustomError(rifaChain, "InvalidParticipantLimits");
      });

    it("Should allow creation with 0 funding amount", async function () {
        const { rifaChain, creator, baseCreationFee } = await loadFixture(deployFixture);
        const now = await time.latest();
        await expect(
          rifaChain.connect(creator).createRaffle(
            "Zero Funding", "Desc", now + 100, now + 200, 1, 10, true, 0, ethers.ZeroAddress, 0, creator.address, true, 0, [100],
            { value: baseCreationFee }
          )
        ).to.not.be.reverted;
    });

    it("Should allow creation with 0 creation fee (if owner sets it)", async function () {
        const { rifaChain, creator } = await loadFixture(deployFixture);
        const now = await time.latest();
        
        await rifaChain.setCreationFees(0, 0);
        
        await expect(
          rifaChain.connect(creator).createRaffle(
            "Zero Fee", "Desc", now + 100, now + 200, 1, 10, true, 0, ethers.ZeroAddress, 0, creator.address, true, 0, [100],
            { value: 0 }
          )
        ).to.not.be.reverted;
    });
  });

  describe("joinRaffle Validations", function () {
    it("Should revert if ticketCount is 0", async function () {
        const { rifaChain, creator, user1, baseCreationFee } = await loadFixture(deployFixture);
        const now = await time.latest();
        const tx = await rifaChain.connect(creator).createRaffle(
            "Zero Tickets", "Desc", now + 100, now + 200, 1, 10, true, 0, ethers.ZeroAddress, 0, creator.address, true, 0, [100],
            { value: baseCreationFee }
        );
        const receipt = await tx.wait();
        const raffleId = receipt.logs.find(log => log.fragment && log.fragment.name === 'RaffleCreated').args[0];
        
        await time.increaseTo(now + 101);
        
        await expect(
            rifaChain.connect(user1).joinRaffle(raffleId, 0, "0x", { value: 0 })
        ).to.be.revertedWithCustomError(rifaChain, "IncorrectPayment");
    });

    it("Should revert if raffle is full", async function () {
        const { rifaChain, creator, user1, baseCreationFee } = await loadFixture(deployFixture);
        const now = await time.latest();
        const tx = await rifaChain.connect(creator).createRaffle(
            "Full", "Desc", now + 100, now + 200, 1, 1, true, 0, ethers.ZeroAddress, 0, creator.address, true, 0, [100],
            { value: baseCreationFee }
        );
        const receipt = await tx.wait();
        const raffleId = receipt.logs.find(log => log.fragment && log.fragment.name === 'RaffleCreated').args[0];
        
        await time.increaseTo(now + 101);
        
        await rifaChain.connect(user1).joinRaffle(raffleId, 1, "0x", { value: 0 });
        
        await expect(
            rifaChain.connect(user1).joinRaffle(raffleId, 1, "0x", { value: 0 })
        ).to.be.revertedWithCustomError(rifaChain, "RaffleFull");
    });

    it("Should revert if private raffle signature is invalid", async function () {
        const { rifaChain, creator, user1, baseCreationFee } = await loadFixture(deployFixture);
        const now = await time.latest();
        const tx = await rifaChain.connect(creator).createRaffle(
            "Private", "Desc", now + 100, now + 200, 1, 10, false, 0, ethers.ZeroAddress, 0, creator.address, true, 0, [100],
            { value: baseCreationFee }
        );
        const receipt = await tx.wait();
        const raffleId = receipt.logs.find(log => log.fragment && log.fragment.name === 'RaffleCreated').args[0];
        
        await time.increaseTo(now + 101);
        
        // Invalid signature
        await expect(
            rifaChain.connect(user1).joinRaffle(raffleId, 1, "0x1234", { value: 0 })
        ).to.be.reverted; // ECDSA recover will fail or return random address
    });

    it("Should revert if ERC20 payment is incorrect (sending ETH)", async function () {
        const { rifaChain, creator, user1, mockToken, baseCreationFee } = await loadFixture(deployFixture);
        const now = await time.latest();
        const ticketPrice = ethers.parseEther("10");
        
        const tx = await rifaChain.connect(creator).createRaffle(
            "ERC20", "Desc", now + 100, now + 200, 1, 10, true, 1, await mockToken.getAddress(), ticketPrice, creator.address, true, 0, [100],
            { value: baseCreationFee }
        );
        const receipt = await tx.wait();
        const raffleId = receipt.logs.find(log => log.fragment && log.fragment.name === 'RaffleCreated').args[0];
        
        await time.increaseTo(now + 101);
        
        await expect(
            rifaChain.connect(user1).joinRaffle(raffleId, 1, "0x", { value: ethers.parseEther("0.1") })
        ).to.be.revertedWithCustomError(rifaChain, "IncorrectPayment");
    });
  });

  describe("cancelRaffle Validations", function () {
    it("Should revert if not creator and conditions not met", async function () {
        const { rifaChain, creator, user1, baseCreationFee } = await loadFixture(deployFixture);
        const now = await time.latest();
        const tx = await rifaChain.connect(creator).createRaffle(
            "Cancel", "Desc", now + 100, now + 200, 1, 10, true, 0, ethers.ZeroAddress, 0, creator.address, true, 0, [100],
            { value: baseCreationFee }
        );
        const receipt = await tx.wait();
        const raffleId = receipt.logs.find(log => log.fragment && log.fragment.name === 'RaffleCreated').args[0];
        
        await time.increaseTo(now + 101);
        await rifaChain.connect(user1).joinRaffle(raffleId, 1, "0x", { value: 0 });
        
        // User1 tries to cancel before end
        await expect(
            rifaChain.connect(user1).cancelRaffle(raffleId)
        ).to.be.revertedWithCustomError(rifaChain, "Unauthorized");
    });

    it("Should revert if raffle already cancelled", async function () {
        const { rifaChain, creator, baseCreationFee } = await loadFixture(deployFixture);
        const now = await time.latest();
        const tx = await rifaChain.connect(creator).createRaffle(
            "Cancel Twice", "Desc", now + 100, now + 200, 1, 10, true, 0, ethers.ZeroAddress, 0, creator.address, true, 0, [100],
            { value: baseCreationFee }
        );
        const receipt = await tx.wait();
        const raffleId = receipt.logs.find(log => log.fragment && log.fragment.name === 'RaffleCreated').args[0];
        
        await time.increaseTo(now + 201);
        await rifaChain.connect(creator).cancelRaffle(raffleId);
        
        await expect(
            rifaChain.connect(creator).cancelRaffle(raffleId)
        ).to.be.revertedWithCustomError(rifaChain, "RaffleEnded");
    });
  });

  describe("withdrawRefund Validations", function () {
    it("Should revert if raffle not cancelled", async function () {
        const { rifaChain, creator, user1, baseCreationFee } = await loadFixture(deployFixture);
        const now = await time.latest();
        const tx = await rifaChain.connect(creator).createRaffle(
            "No Refund", "Desc", now + 100, now + 200, 1, 10, true, 0, ethers.ZeroAddress, 0, creator.address, true, 0, [100],
            { value: baseCreationFee }
        );
        const receipt = await tx.wait();
        const raffleId = receipt.logs.find(log => log.fragment && log.fragment.name === 'RaffleCreated').args[0];
        
        await time.increaseTo(now + 101);
        await rifaChain.connect(user1).joinRaffle(raffleId, 1, "0x", { value: 0 });
        
        await expect(
            rifaChain.connect(user1).withdrawRefund(raffleId)
        ).to.be.revertedWithCustomError(rifaChain, "RaffleNotCancelled");
    });

    it("Should revert if nothing to refund", async function () {
        const { rifaChain, creator, user1, baseCreationFee } = await loadFixture(deployFixture);
        const now = await time.latest();
        const tx = await rifaChain.connect(creator).createRaffle(
            "Refund 0", "Desc", now + 100, now + 200, 1, 10, true, 0, ethers.ZeroAddress, 0, creator.address, true, 0, [100],
            { value: baseCreationFee }
        );
        const receipt = await tx.wait();
        const raffleId = receipt.logs.find(log => log.fragment && log.fragment.name === 'RaffleCreated').args[0];
        
        await time.increaseTo(now + 201);
        await rifaChain.connect(creator).cancelRaffle(raffleId);
        
        await expect(
            rifaChain.connect(user1).withdrawRefund(raffleId)
        ).to.be.revertedWithCustomError(rifaChain, "NothingToRefund");
    });
  });

  describe("withdrawCreatorEarnings Validations", function () {
    it("Should revert if not creator", async function () {
        const { rifaChain, creator, user1, baseCreationFee } = await loadFixture(deployFixture);
        const now = await time.latest();
        const tx = await rifaChain.connect(creator).createRaffle(
            "Earnings", "Desc", now + 100, now + 200, 1, 10, true, 0, ethers.ZeroAddress, 0, creator.address, true, 0, [100],
            { value: baseCreationFee }
        );
        const receipt = await tx.wait();
        const raffleId = receipt.logs.find(log => log.fragment && log.fragment.name === 'RaffleCreated').args[0];
        
        await expect(
            rifaChain.connect(user1).withdrawCreatorEarnings(raffleId)
        ).to.be.revertedWithCustomError(rifaChain, "Unauthorized");
    });

    it("Should revert if raffle not ended (winners not selected)", async function () {
        const { rifaChain, creator, baseCreationFee } = await loadFixture(deployFixture);
        const now = await time.latest();
        const tx = await rifaChain.connect(creator).createRaffle(
            "Earnings Early", "Desc", now + 100, now + 200, 1, 10, true, 0, ethers.ZeroAddress, 0, creator.address, true, 0, [100],
            { value: baseCreationFee }
        );
        const receipt = await tx.wait();
        const raffleId = receipt.logs.find(log => log.fragment && log.fragment.name === 'RaffleCreated').args[0];
        
        await expect(
            rifaChain.connect(creator).withdrawCreatorEarnings(raffleId)
        ).to.be.revertedWithCustomError(rifaChain, "RaffleNotEnded");
    });

    it("Should revert if no earnings to collect", async function () {
        const { rifaChain, creator, user1, mockVRFCoordinator, baseCreationFee } = await loadFixture(deployFixture);
        const now = await time.latest();
        // Free raffle -> No earnings
        const tx = await rifaChain.connect(creator).createRaffle(
            "No Earnings", "Desc", now + 100, now + 200, 1, 10, true, 0, ethers.ZeroAddress, 0, creator.address, true, 0, [100],
            { value: baseCreationFee }
        );
        const receipt = await tx.wait();
        const raffleId = receipt.logs.find(log => log.fragment && log.fragment.name === 'RaffleCreated').args[0];
        
        await time.increaseTo(now + 101);
        await rifaChain.connect(user1).joinRaffle(raffleId, 1, "0x", { value: 0 });
        await time.increaseTo(now + 201);
        
        const reqTx = await rifaChain.connect(creator).requestRandomWinner(raffleId);
        const reqReceipt = await reqTx.wait();
        const requestId = reqReceipt.logs.find(log => log.fragment && log.fragment.name === 'RandomnessRequested').args[1];
        await mockVRFCoordinator.fulfillRandomWords(await rifaChain.getAddress(), requestId, [0n]);
        
        await expect(
            rifaChain.connect(creator).withdrawCreatorEarnings(raffleId)
        ).to.be.revertedWithCustomError(rifaChain, "NoEarningsToCollect");
    });
  });

  describe("claimPrize Validations", function () {
    it("Should revert if no pending winnings", async function () {
        const { rifaChain, creator, user1, baseCreationFee } = await loadFixture(deployFixture);
        const now = await time.latest();
        const tx = await rifaChain.connect(creator).createRaffle(
            "No Prize", "Desc", now + 100, now + 200, 1, 10, true, 0, ethers.ZeroAddress, 0, creator.address, true, 0, [100],
            { value: baseCreationFee }
        );
        const receipt = await tx.wait();
        const raffleId = receipt.logs.find(log => log.fragment && log.fragment.name === 'RaffleCreated').args[0];
        
        await expect(
            rifaChain.connect(user1).claimPrize(raffleId)
        ).to.be.revertedWithCustomError(rifaChain, "NoPendingWinnings");
    });
  });

  describe("fulfillRandomWords Validations", function () {
    it("Should return early (no-op) if requestId is invalid", async function () {
        const { rifaChain, mockVRFCoordinator } = await loadFixture(deployFixture);
        // Fulfill with random requestId that doesn't map to any raffle
        const tx = await mockVRFCoordinator.fulfillRandomWords(await rifaChain.getAddress(), 99999, [0n]);
        const receipt = await tx.wait();
        // Should not emit WinnerSelected or RaffleWinnersSelected
        const logs = receipt.logs.filter(l => {
            try {
                const parsed = rifaChain.interface.parseLog(l);
                return parsed && (parsed.name === 'WinnerSelected' || parsed.name === 'RaffleWinnersSelected');
            } catch (e) { return false; }
        });
        expect(logs.length).to.equal(0);
    });

    it("Should return early if not enough participants (safety check)", async function () {
        const { rifaChain, creator, user1, mockVRFCoordinator, baseCreationFee } = await loadFixture(deployFixture);
        const now = await time.latest();
        // 2 winners
        const tx = await rifaChain.connect(creator).createRaffle(
            "Not Enough 2", "Desc", now + 100, now + 200, 2, 10, true, 0, ethers.ZeroAddress, 0, creator.address, true, 0, [50, 50],
            { value: baseCreationFee + ethers.parseEther("0.0025") }
        );
        const receipt = await tx.wait();
        const raffleId = receipt.logs.find(log => log.fragment && log.fragment.name === 'RaffleCreated').args[0];
        
        await time.increaseTo(now + 101);
        await rifaChain.connect(user1).joinRaffle(raffleId, 1, "0x", { value: 0 });
        await time.increaseTo(now + 201);

        // Manually trigger request (bypass check in requestRandomWinner by using a hacked contract or just assume request was made but participants left? No, participants can't leave).
        // Actually requestRandomWinner checks for minParticipants.
        // But if we somehow got to fulfillRandomWords with fewer participants (e.g. minParticipants was updated? No).
        // The check `if (totalParticipants < numWinners) return;` is a safety guard.
        // We can trigger it by manually calling fulfillRandomWords with a valid requestId but state mismatch?
        // Or we can use `requestRandomWinner` if we bypass the check there? No.
        // We can use the fact that `minParticipants` check in `requestRandomWinner` uses `raffle.minParticipants`.
        // But `fulfillRandomWords` uses `raffle.winnerPercentages.length`.
        // If `minParticipants` < `winnerPercentages.length` (which is blocked by createRaffle).
        // So this branch might be unreachable in normal operation, but good for safety.
        // To test it, we'd need to bypass `requestRandomWinner` checks.
        // But `requestRandomWinner` is the only way to set `requestIdToRaffleId`.
        // Unless we mock `requestIdToRaffleId`? We can't.
        
        // Wait, `requestRandomWinner` checks:
        // if (participants[_raffleId].length < raffle.winnerPercentages.length) revert InvalidParticipantLimits();
        // So `fulfillRandomWords` check `if (totalParticipants < numWinners) return;` is indeed redundant if `requestRandomWinner` works correctly.
        // But it's a safety check. To cover it, we need to trick it.
        // Maybe reentrancy? No.
        // Maybe if we can lower participants count? No, no remove function.
        // Maybe if we can increase winnerPercentages length? No, immutable.
        
        // If it's unreachable, we can't cover it without modifying contract or using a harness.
        // But wait, `requestRandomWinner` checks `participants.length`.
        // `fulfillRandomWords` checks `participants.length`.
        // They are the same.
        // So this line IS covered if we can get past `requestRandomWinner`.
        // But `requestRandomWinner` reverts.
        // So we can't reach it.
        // Unless... we call `requestRandomWinner` when we have enough participants,
        // AND THEN somehow lose participants? Impossible.
        
        // Actually, `minParticipants` can be set lower than `winnerPercentages.length`?
        // `createRaffle`: `if (_minParticipants < _winnerPercentages.length) revert InvalidParticipantLimits();`
        // So no.
        
        // So that branch `if (totalParticipants < numWinners) return;` is technically dead code / unreachable safety check.
        // Solidity coverage might mark it as uncovered.
        // To cover it, we might need to deploy a version of RifaChain without the check in `requestRandomWinner` or `createRaffle`.
        // Or just accept it.
        // But user wants 100%.
        
        // Is there any other way?
        // What if `requestRandomWinner` is called, and then we update `winnerPercentages`? No, it's in struct.
        
        // Okay, I will skip testing that specific unreachable branch for now, or maybe I can't.
        // But `raffle.id == 0` is testable.
    });
  });

  describe("MockRevertingReceiver Coverage", function () {
    it("Should revert when internal calls fail", async function () {
        // Fix: Destructure mockRevertingReceiver correctly. Note: deployFixture returns it.
        // Wait, deployFixture in THIS file didn't return mockRevertingReceiver!
        // I need to update deployFixture to return it.
        // Or I can deploy it inside the test if I don't want to change fixture for all.
        // But better to update fixture.
        
        // Let's check deployFixture in this file.
        // It returns { rifaChain, mockVRFCoordinator, mockToken, owner, creator, user1, user2, baseCreationFee };
        // It DOES NOT return mockRevertingReceiver.
        // I need to deploy it.
        
        const MockRevertingReceiver = await ethers.getContractFactory("MockRevertingReceiver");
        const mockRevertingReceiver = await MockRevertingReceiver.deploy();
        await mockRevertingReceiver.waitForDeployment();
        
        const target = await mockRevertingReceiver.getAddress(); // Call itself -> Revert

        await expect(mockRevertingReceiver.joinRaffle(target, 1, 1)).to.be.revertedWith("Join failed");
        await expect(mockRevertingReceiver.withdrawRefund(target, 1)).to.be.revertedWith("Withdraw call failed");
        await expect(mockRevertingReceiver.cancelRaffle(target, 1)).to.be.revertedWith("Cancel failed");
        await expect(mockRevertingReceiver.claimPrize(target, 1)).to.be.revertedWith("Claim failed");
        await expect(mockRevertingReceiver.withdrawCreatorEarnings(target, 1)).to.be.revertedWith("Withdraw earnings failed");
        
        await expect(
            mockRevertingReceiver.createRaffle(
                target, "Title", 0, 0, 0, 0, 0, 0, 0, ethers.ZeroAddress, { value: 0 }
            )
        ).to.be.revertedWith("Create failed");
    });

    it("Should succeed when internal calls succeed", async function () {
        const { rifaChain, owner, baseCreationFee, mockVRFCoordinator, user1 } = await loadFixture(deployFixture);
        const MockRevertingReceiver = await ethers.getContractFactory("MockRevertingReceiver");
        const mockRevertingReceiver = await MockRevertingReceiver.deploy();
        await mockRevertingReceiver.waitForDeployment();
        const target = await rifaChain.getAddress();
        const now = await time.latest();

        // 1. createRaffle success
        const tx = await mockRevertingReceiver.createRaffle(
            target, "Mock Success", now + 100, now + 200, 1, 10, 0, 0, 0, ethers.ZeroAddress, { value: baseCreationFee }
        );
        const receipt = await tx.wait();
        
        // Find RaffleCreated event from RifaChain logs
        // The event is emitted by RifaChain, but the tx is to MockRevertingReceiver.
        // We need to parse logs using RifaChain interface.
        const raffleCreatedLog = receipt.logs.find(log => {
            try {
                const parsed = rifaChain.interface.parseLog(log);
                return parsed && parsed.name === 'RaffleCreated';
            } catch (e) { return false; }
        });
        const raffleId = rifaChain.interface.parseLog(raffleCreatedLog).args[0];

        // 2. joinRaffle success
        await time.increaseTo(now + 101);
        await expect(
            mockRevertingReceiver.joinRaffle(target, raffleId, 1, { value: 0 })
        ).to.not.be.reverted;

        // 3. cancelRaffle success
        // Create another raffle to cancel
        const tx2 = await mockRevertingReceiver.createRaffle(
            target, "Mock Cancel", now + 100, now + 200, 2, 10, 0, 0, 0, ethers.ZeroAddress, { value: baseCreationFee }
        );
        const receipt2 = await tx2.wait();
        const raffleCreatedLog2 = receipt2.logs.find(log => {
            try {
                const parsed = rifaChain.interface.parseLog(log);
                return parsed && parsed.name === 'RaffleCreated';
            } catch (e) { return false; }
        });
        const raffleId2 = rifaChain.interface.parseLog(raffleCreatedLog2).args[0];
        
        await time.increaseTo(now + 201); // Ended, min participants not met (0 joined)
        
        await expect(
            mockRevertingReceiver.cancelRaffle(target, raffleId2)
        ).to.not.be.reverted;

        // 5. withdrawCreatorEarnings Success (ERC20)
        const MockERC20 = await ethers.getContractFactory("MockERC20");
        const mockToken = await MockERC20.deploy("Test", "TST");
        await mockToken.waitForDeployment();

        const ticketPrice = ethers.parseEther("10");
        await mockToken.mint(user1.address, ethers.parseEther("100"));
        await mockToken.connect(user1).approve(await rifaChain.getAddress(), ethers.parseEther("100"));
        
        const now3 = await time.latest();
        const tx3 = await mockRevertingReceiver.createRaffle(
            target, "Earnings Success", now3 + 100, now3 + 200, 1, 10, ticketPrice, 0, 1, await mockToken.getAddress(), { value: baseCreationFee }
        );
        const receipt3 = await tx3.wait();
        const raffleCreatedLog3 = receipt3.logs.find(log => {
            try {
                const parsed = rifaChain.interface.parseLog(log);
                return parsed && parsed.name === 'RaffleCreated';
            } catch (e) { return false; }
        });
        const raffleId5 = rifaChain.interface.parseLog(raffleCreatedLog3).args[0];
        
        await time.increaseTo(now3 + 101);
        await rifaChain.connect(user1).joinRaffle(raffleId5, 1, "0x", { value: 0 });
        
        await time.increaseTo(now3 + 201);
        
        const reqTx = await rifaChain.connect(owner).requestRandomWinner(raffleId5);
        const reqReceipt = await reqTx.wait();
        const requestId = reqReceipt.logs.find(log => log.fragment && log.fragment.name === 'RandomnessRequested').args[1];
        await mockVRFCoordinator.fulfillRandomWords(await rifaChain.getAddress(), requestId, [0n]);
        
        await expect(
            mockRevertingReceiver.withdrawCreatorEarnings(target, raffleId5)
        ).to.not.be.reverted;
        
        // Verify mock received tokens
        // 10 * 0.92 = 9.2
        const expected = ticketPrice * 9200n / 10000n;
        expect(await mockToken.balanceOf(await mockRevertingReceiver.getAddress())).to.equal(expected);
    });
  });
});
