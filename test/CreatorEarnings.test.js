const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("RifaChain Creator Earnings (Fixed Prize Model)", function () {
  let RifaChain;
  let rifaChain;
  let owner;
  let creator;
  let participant1;
  let participant2;
  let vrfCoordinator;
  let subId;
  let keyHash;

  // Constants
  const TICKET_PRICE = ethers.parseEther("0.1");
  const FUNDING_AMOUNT = ethers.parseEther("1.0"); // 1 ETH Prize Pool
  const PLATFORM_FEE_BP = 800n; // 8%

  beforeEach(async function () {
    [owner, creator, participant1, participant2] = await ethers.getSigners();

    // Mock VRF Coordinator
    const MockVRFCoordinator = await ethers.getContractFactory("MockVRFCoordinator");
    vrfCoordinator = await MockVRFCoordinator.deploy();
    await vrfCoordinator.waitForDeployment();

    // Mock subscription ID (not used by simple mock but needed for RifaChain constructor)
    subId = 1;
    keyHash = "0x474e34a077df58807dbe9c96d3c009b23b3c6d0cce433e59bbf5b34f823bc56c";

    // Deploy RifaChain
    RifaChain = await ethers.getContractFactory("RifaChain");
    rifaChain = await RifaChain.deploy(await vrfCoordinator.getAddress(), subId, keyHash);
    await rifaChain.waitForDeployment();

    // await vrfCoordinator.addConsumer(subId, await rifaChain.getAddress());
  });

  it("Should separate Prize Pool and Ticket Revenue correctly", async function () {
    const startTime = (await time.latest()) + 3600;
    const endTime = startTime + 3600;

    // Create Raffle with 1 ETH Funding (Prize Pool)
    const duration = endTime - startTime;
    const fee = await rifaChain.getCreationFee(1, duration);
    const receipt = await rifaChain.connect(creator).createRaffle(
      "Test Raffle",
      "Description",
      startTime,
      endTime,
      1, // Min participants
      100, // Max participants
      true, // Public
      0, // Native
      ethers.ZeroAddress,
      TICKET_PRICE,
      creator.address,
      true, // Allow multiple
      FUNDING_AMOUNT,
      [100], // 1 Winner gets 100% of Prize Pool
      { value: fee + FUNDING_AMOUNT }
    ).then(tx => tx.wait());

    const raffleId = receipt.logs.find(log => log.fragment && log.fragment.name === 'RaffleCreated').args[0];

    // Fast forward to start
    await time.increaseTo(startTime + 1);

    // 2 Participants buy tickets
    // Revenue = 0.1 * 2 = 0.2 ETH
    await rifaChain.connect(participant1).joinRaffle(raffleId, 1, "0x", { value: TICKET_PRICE });
    await rifaChain.connect(participant2).joinRaffle(raffleId, 1, "0x", { value: TICKET_PRICE });

    const raffle = await rifaChain.raffles(raffleId);
    
    // Verify Prize Pool is still 1 ETH
    expect(raffle.prizePool).to.equal(FUNDING_AMOUNT);
    
    // Verify Ticket Revenue is 0.2 ETH
    expect(raffle.ticketRevenue).to.equal(ethers.parseEther("0.2"));
  });

  it("Should allow creator to withdraw earnings after winner selection", async function () {
    const startTime = (await time.latest()) + 3600;
    const endTime = startTime + 3600;

    const duration = endTime - startTime;
    const creationFee = await rifaChain.getCreationFee(1, duration);
    
    const receipt = await (await rifaChain.connect(creator).createRaffle(
      "Test Raffle",
      "Description",
      startTime,
      endTime,
      1,
      100,
      true,
      0,
      ethers.ZeroAddress,
      TICKET_PRICE,
      creator.address,
      true,
      FUNDING_AMOUNT,
      [100],
      { value: creationFee + FUNDING_AMOUNT }
    )).wait();

    const raffleId = receipt.logs.find(log => log.fragment && log.fragment.name === 'RaffleCreated').args[0];
    await time.increaseTo(startTime + 1);

    // 10 Tickets sold = 1 ETH Revenue
    for(let i=0; i<10; i++) {
        await rifaChain.connect(participant1).joinRaffle(raffleId, 1, "0x", { value: TICKET_PRICE });
    }

    await time.increaseTo(endTime + 1);

    // Pick Winner
    await rifaChain.connect(creator).requestRandomWinner(raffleId);
    const requestId = (await rifaChain.raffles(raffleId)).requestId;
    await vrfCoordinator.fulfillRandomWords(await rifaChain.getAddress(), requestId, [12345]);

    // Calculate expected earnings
    // Revenue = 1 ETH
    // Fee = 8% = 0.08 ETH
    // Earnings = 0.92 ETH
    const totalRevenue = ethers.parseEther("1.0");
    const fee = (totalRevenue * PLATFORM_FEE_BP) / 10000n;
    const expectedEarnings = totalRevenue - fee;

    // Check initial balance
    const initialBalance = await ethers.provider.getBalance(creator.address);

    // Withdraw Earnings
    const tx = await rifaChain.connect(creator).withdrawCreatorEarnings(raffleId);
    const withdrawReceipt = await tx.wait();
    const gasUsed = withdrawReceipt.gasUsed * withdrawReceipt.gasPrice;

    // Verify Event
    await expect(tx).to.emit(rifaChain, "CreatorEarningsClaimed")
        .withArgs(raffleId, creator.address, expectedEarnings);

    // Verify Balance Change
    const finalBalance = await ethers.provider.getBalance(creator.address);
    expect(finalBalance).to.equal(initialBalance + expectedEarnings - gasUsed);

    // Verify State
    const raffle = await rifaChain.raffles(raffleId);
    expect(raffle.earningsCollected).to.be.true;
  });

  it("Should allow creator to withdraw earnings (ERC20)", async function () {
    const startTime = (await time.latest()) + 3600;
    const endTime = startTime + 3600;

    // Mock Token setup
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    const mockToken = await MockERC20.deploy("Mock", "MCK");
    await mockToken.waitForDeployment();
    const ticketPrice = ethers.parseUnits("10", 18);

    const duration = endTime - startTime;
    const creationFee = await rifaChain.getCreationFee(1, duration);
    
    // Create ERC20 Raffle
    const tx = await rifaChain.connect(creator).createRaffle(
      "ERC20 Raffle", "Desc", startTime, endTime, 1, 100, true, 1, await mockToken.getAddress(), ticketPrice, creator.address, true, 0, [100], 
      { value: creationFee }
    );
    const receipt = await tx.wait();
    const raffleId = receipt.logs.find(log => log.fragment && log.fragment.name === 'RaffleCreated').args[0];

    await time.increaseTo(startTime + 1);

    // 10 Tickets sold
    await mockToken.mint(participant1.address, ticketPrice * 10n);
    await mockToken.connect(participant1).approve(await rifaChain.getAddress(), ticketPrice * 10n);
    
    for(let i=0; i<10; i++) {
        await rifaChain.connect(participant1).joinRaffle(raffleId, 1, "0x");
    }

    await time.increaseTo(endTime + 1);

    // Pick Winner
    await rifaChain.connect(creator).requestRandomWinner(raffleId);
    const requestId = (await rifaChain.raffles(raffleId)).requestId;
    await vrfCoordinator.fulfillRandomWords(await rifaChain.getAddress(), requestId, [12345]);

    // Calculate expected earnings
    const totalRevenue = ticketPrice * 10n;
    const fee = (totalRevenue * PLATFORM_FEE_BP) / 10000n;
    const expectedEarnings = totalRevenue - fee;

    const initialBalance = await mockToken.balanceOf(creator.address);

    // Withdraw Earnings
    await rifaChain.connect(creator).withdrawCreatorEarnings(raffleId);

    const finalBalance = await mockToken.balanceOf(creator.address);
    expect(finalBalance - initialBalance).to.equal(expectedEarnings);
  });

  it("Should revert if trying to collect earnings twice", async function () {
    // ... Setup similar to above ...
    const startTime = (await time.latest()) + 3600;
    const endTime = startTime + 3600;
    const duration = endTime - startTime;
    const fee = await rifaChain.getCreationFee(1, duration);
    const receipt = await rifaChain.connect(creator).createRaffle("Test", "Desc", startTime, endTime, 1, 100, true, 0, ethers.ZeroAddress, TICKET_PRICE, creator.address, true, FUNDING_AMOUNT, [100], { value: fee + FUNDING_AMOUNT }).then(tx => tx.wait());
    const raffleId = receipt.logs.find(log => log.fragment && log.fragment.name === 'RaffleCreated').args[0];
    await time.increaseTo(startTime + 1);
    await rifaChain.connect(participant1).joinRaffle(raffleId, 1, "0x", { value: TICKET_PRICE });
    await time.increaseTo(endTime + 1);
    await rifaChain.connect(creator).requestRandomWinner(raffleId);
    const requestId = (await rifaChain.raffles(raffleId)).requestId;
    await vrfCoordinator.fulfillRandomWords(await rifaChain.getAddress(), requestId, [12345]);

    await rifaChain.connect(creator).withdrawCreatorEarnings(raffleId);

    await expect(
        rifaChain.connect(creator).withdrawCreatorEarnings(raffleId)
    ).to.be.revertedWithCustomError(rifaChain, "EarningsAlreadyCollected");
  });

  it("Should revert if non-creator tries to collect", async function () {
    const startTime = (await time.latest()) + 3600;
    const endTime = startTime + 3600;
    const duration = endTime - startTime;
    const fee = await rifaChain.getCreationFee(1, duration);
    const tx = await rifaChain.connect(creator).createRaffle("Test", "Desc", startTime, endTime, 1, 100, true, 0, ethers.ZeroAddress, TICKET_PRICE, creator.address, true, FUNDING_AMOUNT, [100], { value: fee + FUNDING_AMOUNT });
    const receipt = await tx.wait();
    const raffleId = receipt.logs.find(log => log.fragment && log.fragment.name === 'RaffleCreated').args[0];
    await time.increaseTo(startTime + 1);
    await rifaChain.connect(participant1).joinRaffle(raffleId, 1, "0x", { value: TICKET_PRICE });
    await time.increaseTo(endTime + 1);
    await rifaChain.connect(creator).requestRandomWinner(raffleId);
    const requestId = (await rifaChain.raffles(raffleId)).requestId;
    await vrfCoordinator.fulfillRandomWords(await rifaChain.getAddress(), requestId, [12345]);

    await expect(
        rifaChain.connect(participant1).withdrawCreatorEarnings(raffleId)
    ).to.be.revertedWithCustomError(rifaChain, "Unauthorized");
  });
});
