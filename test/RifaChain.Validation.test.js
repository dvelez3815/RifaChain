const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("RifaChain Validation", function () {
  let RifaChain;
  let rifaChain;
  let owner;
  let addr1;
  let addr2;
  let addrs;

  // Mock VRF Coordinator address (random address for testing)
  const vrfCoordinator = "0x8103B0A8A00be2DDC778e6e7eaa21791Cd364625";
  const subscriptionId = 1;
  const keyHash = "0x474e34a077df58807dbe9c96d3c009b23b3c6d0cce433e59bbf5b34f823bc56c";

  beforeEach(async function () {
    [owner, addr1, addr2, ...addrs] = await ethers.getSigners();
    RifaChain = await ethers.getContractFactory("RifaChain");
    rifaChain = await RifaChain.deploy(vrfCoordinator, subscriptionId, keyHash);
  });

  describe("Create Raffle Validation", function () {
    it("Should revert if minParticipants is 0", async function () {
      const { time } = require("@nomicfoundation/hardhat-network-helpers");
      const now = await time.latest();
      await expect(
        rifaChain.createRaffle(
          "Test Raffle",
          "Description",
          now + 60,
          now + 3600,
          0, // minParticipants = 0
          100,
          true,
          0, // NATIVE
          ethers.ZeroAddress,
          ethers.parseEther("0.01"),
          owner.address,
          false,
          0, // fundingAmount
          [100]
        )
      ).to.be.revertedWithCustomError(rifaChain, "InvalidParticipantLimits");
    });

    it("Should revert if minParticipants < number of winners", async function () {
        const { time } = require("@nomicfoundation/hardhat-network-helpers");
        const now = await time.latest();
        await expect(
          rifaChain.createRaffle(
            "Test Raffle",
            "Description",
            now + 60,
            now + 3600,
            1, // minParticipants = 1
            100,
            true,
            0, // NATIVE
            ethers.ZeroAddress,
            ethers.parseEther("0.01"),
            owner.address,
            false,
            0, // fundingAmount
            [50, 50] // 2 winners
          )
        ).to.be.revertedWithCustomError(rifaChain, "InvalidParticipantLimits");
      });

    it("Should revert if winner percentages do not sum to 100", async function () {
      const { time } = require("@nomicfoundation/hardhat-network-helpers");
      const now = await time.latest();
      await expect(
        rifaChain.createRaffle(
          "Test Raffle",
          "Description",
          now + 60,
          now + 3600,
          10,
          100,
          true,
          0, // NATIVE
          ethers.ZeroAddress,
          ethers.parseEther("0.01"),
          owner.address,
          false,
          0, // fundingAmount
          [50, 40] // Sum = 90
        )
      ).to.be.revertedWithCustomError(rifaChain, "InvalidWinnerPercentages");
    });

    it("Should revert if any winner percentage is 0", async function () {
      const { time } = require("@nomicfoundation/hardhat-network-helpers");
      const now = await time.latest();
      await expect(
        rifaChain.createRaffle(
          "Test Raffle",
          "Description",
          now + 60,
          now + 3600,
          10,
          100,
          true,
          0, // NATIVE
          ethers.ZeroAddress,
          ethers.parseEther("0.01"),
          owner.address,
          false,
          0, // fundingAmount
          [100, 0]
        )
      ).to.be.revertedWithCustomError(rifaChain, "InvalidWinnerPercentages");
    });

    it("Should revert if minParticipants > maxParticipants", async function () {
        const { time } = require("@nomicfoundation/hardhat-network-helpers");
        const now = await time.latest();
        await expect(
          rifaChain.createRaffle(
            "Test Raffle",
            "Description",
            now + 60,
            now + 3600,
            20, // min
            10, // max
            true,
            0, // NATIVE
            ethers.ZeroAddress,
            ethers.parseEther("0.01"),
            owner.address,
            false,
            0, // fundingAmount
            [100]
          )
        ).to.be.revertedWithCustomError(rifaChain, "InvalidParticipantLimits");
      });
  });
});
