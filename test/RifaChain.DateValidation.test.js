const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("RifaChain Date Validation", function () {
  let RifaChain;
  let rifaChain;
  let owner;
  let addr1;
  let addr2;
  let vrfCoordinatorMock;

  beforeEach(async function () {
    [owner, addr1, addr2] = await ethers.getSigners();

    // Mock VRF Coordinator
    const MockVRFCoordinator = await ethers.getContractFactory("MockVRFCoordinator");
    vrfCoordinatorMock = await MockVRFCoordinator.deploy();

    RifaChain = await ethers.getContractFactory("RifaChain");
    rifaChain = await RifaChain.deploy(
      await vrfCoordinatorMock.getAddress(),
      1, // subscriptionId
      "0x474e34a077df58807dbe9c96d3cabb68bd187df35600e47a51229942075bdf7a" // keyHash
    );
  });

  it("Should revert if start time is in the past", async function () {
    const now = await time.latest();
    const startTime = now - 3600; // 1 hour ago
    const endTime = now + 3600;

    await expect(
      rifaChain.createRaffle(
        "Test Raffle",
        "Description",
        startTime,
        endTime,
        1, // minParticipants
        100, // maxParticipants
        true, // isPublic
        0, // NATIVE
        ethers.ZeroAddress,
        ethers.parseEther("0.1"),
        owner.address,
        false,
        0, // fundingAmount
        [100]
      )
    ).to.be.revertedWithCustomError(rifaChain, "InvalidTimeRange");
  });

  it("Should revert if end time is before start time", async function () {
    const now = await time.latest();
    const startTime = now + 3600;
    const endTime = now + 1800; // 30 mins after now, but before start

    await expect(
      rifaChain.createRaffle(
        "Test Raffle",
        "Description",
        startTime,
        endTime,
        1,
        100,
        true,
        0,
        ethers.ZeroAddress,
        ethers.parseEther("0.1"),
        owner.address,
        false,
        0, // fundingAmount
        [100]
      )
    ).to.be.revertedWithCustomError(rifaChain, "InvalidTimeRange");
  });

  it("Should revert if duration is > 365 days", async function () {
    const now = await time.latest();
    const startTime = now + 60; // 1 min from now
    const endTime = now + (366 * 24 * 3600); // 366 days from now

    await expect(
      rifaChain.createRaffle(
        "Test Raffle",
        "Description",
        startTime,
        endTime,
        1,
        100,
        true,
        0,
        ethers.ZeroAddress,
        ethers.parseEther("0.1"),
        owner.address,
        false,
        0, // fundingAmount
        [100]
      )
    ).to.be.revertedWithCustomError(rifaChain, "InvalidTimeRange");
  });

  it("Should create raffle with valid dates", async function () {
    const now = await time.latest();
    const startTime = now + 60; // 1 min from now
    const endTime = now + (13 * 24 * 3600); // 13 days from now
    const duration = endTime - startTime;
    const fee = await rifaChain.getCreationFee(1, duration);

    await expect(
      rifaChain.createRaffle(
        "Test Raffle",
        "Description",
        startTime,
        endTime,
        1,
        100,
        true,
        0,
        ethers.ZeroAddress,
        ethers.parseEther("0.1"),
        owner.address,
        false,
        0, // fundingAmount
        [100],
        { value: fee }
      )
    ).to.emit(rifaChain, "RaffleCreated");
  });
});
