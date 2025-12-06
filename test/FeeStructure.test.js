const {
  time,
  loadFixture,
} = require("@nomicfoundation/hardhat-toolbox/network-helpers");
const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");
const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("RifaChain Fee Structure", function () {
  // Fixture to deploy contracts and set up common state
  async function deployRifaChainFixture() {
    const [owner, creator, user1, user2, feeRecipient] = await ethers.getSigners();

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

    // Configure Fees
    const baseCreationFee = ethers.parseEther("0.005");
    const additionalWinnerFee = ethers.parseEther("0.0025");
    const platformFeeBasisPoints = 800; // 8%
    
    await rifaChain.setFeeRecipient(feeRecipient.address);
    await rifaChain.setCreationFees(baseCreationFee, additionalWinnerFee);
    await rifaChain.setPlatformFee(platformFeeBasisPoints);

    // Deploy MockERC20
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    const mockToken = await MockERC20.deploy("Mock Token", "MCK");
    await mockToken.waitForDeployment();

    return { rifaChain, mockToken, mockVRFCoordinator, owner, creator, user1, user2, feeRecipient, baseCreationFee, additionalWinnerFee, platformFeeBasisPoints };
  }

  describe("Creation Fee", function () {
    it("Should return correct fee from getCreationFee", async function () {
        const { rifaChain, baseCreationFee, additionalWinnerFee } = await loadFixture(deployRifaChainFixture);
        
        // 1 Winner
        expect(await rifaChain.getCreationFee(1)).to.equal(baseCreationFee);
        
        // 2 Winners
        expect(await rifaChain.getCreationFee(2)).to.equal(baseCreationFee + additionalWinnerFee);
        
        // 5 Winners
        expect(await rifaChain.getCreationFee(5)).to.equal(baseCreationFee + (additionalWinnerFee * 4n));
    });

    it("Should revert if creation fee is not paid (Native)", async function () {
      const { rifaChain, creator } = await loadFixture(deployRifaChainFixture);
      const now = await time.latest();
      
      await expect(
        rifaChain.connect(creator).createRaffle(
          "No Fee", "Desc", now + 100, now + 200, 1, 10, true, 0, ethers.ZeroAddress, 0, creator.address, true, 0, [100],
          { value: 0 } // No fee sent
        )
      ).to.be.revertedWithCustomError(rifaChain, "IncorrectPayment");
    });

    it("Should revert if insufficient creation fee is paid for multiple winners", async function () {
        const { rifaChain, creator, baseCreationFee } = await loadFixture(deployRifaChainFixture);
        const now = await time.latest();
        
        // 2 Winners requires base + additional
        // Sending only base should fail
        await expect(
          rifaChain.connect(creator).createRaffle(
            "Low Fee", "Desc", now + 100, now + 200, 2, 10, true, 0, ethers.ZeroAddress, 0, creator.address, true, 0, [50, 50],
            { value: baseCreationFee } 
          )
        ).to.be.revertedWithCustomError(rifaChain, "IncorrectPayment");
      });

    it("Should transfer correct creation fee to fee recipient (Multiple Winners)", async function () {
      const { rifaChain, creator, feeRecipient, baseCreationFee, additionalWinnerFee } = await loadFixture(deployRifaChainFixture);
      const now = await time.latest();
      
      const initialBalance = await ethers.provider.getBalance(feeRecipient.address);
      const expectedFee = baseCreationFee + additionalWinnerFee; // 2 Winners

      await rifaChain.connect(creator).createRaffle(
        "Paid Fee", "Desc", now + 100, now + 200, 2, 10, true, 0, ethers.ZeroAddress, 0, creator.address, true, 0, [50, 50],
        { value: expectedFee }
      );

      const finalBalance = await ethers.provider.getBalance(feeRecipient.address);
      expect(finalBalance - initialBalance).to.equal(expectedFee);
    });

    it("Should require creation fee + funding amount for funded native raffles", async function () {
        const { rifaChain, creator, feeRecipient, baseCreationFee } = await loadFixture(deployRifaChainFixture);
        const now = await time.latest();
        const fundingAmount = ethers.parseEther("1.0");
        
        const initialFeeRecipientBalance = await ethers.provider.getBalance(feeRecipient.address);
        const initialContractBalance = await ethers.provider.getBalance(await rifaChain.getAddress());
  
        await rifaChain.connect(creator).createRaffle(
          "Funded Fee", "Desc", now + 100, now + 200, 1, 10, true, 0, ethers.ZeroAddress, 0, creator.address, true, 
          fundingAmount, 
          [100],
          { value: fundingAmount + baseCreationFee }
        );
  
        const finalFeeRecipientBalance = await ethers.provider.getBalance(feeRecipient.address);
        const finalContractBalance = await ethers.provider.getBalance(await rifaChain.getAddress());

        expect(finalFeeRecipientBalance - initialFeeRecipientBalance).to.equal(baseCreationFee);
        expect(finalContractBalance - initialContractBalance).to.equal(fundingAmount);
      });
  });

  describe("Platform Fee (Pot Commission)", function () {
    it("Should deduct platform fee from total pot and transfer to fee recipient", async function () {
        const { rifaChain, mockVRFCoordinator, creator, user1, feeRecipient, baseCreationFee } = await loadFixture(deployRifaChainFixture);
        const now = await time.latest();
        const ticketPrice = ethers.parseEther("1.0");
        
        // Create Raffle
        const tx = await rifaChain.connect(creator).createRaffle(
            "Raffle", "Desc", now + 100, now + 200, 1, 0, true, 0, ethers.ZeroAddress, ticketPrice, creator.address, true, 0, [100],
            { value: baseCreationFee }
        );
        const receipt = await tx.wait();
        const raffleId = receipt.logs.find(log => log.fragment && log.fragment.name === 'RaffleCreated').args[0];

        await time.increaseTo(now + 101);

        // User1 joins (Pot = 1.0 ETH)
        await rifaChain.connect(user1).joinRaffle(raffleId, 1, "0x", { value: ticketPrice });

        await time.increaseTo(now + 300);

        // Request Winner
        const reqTx = await rifaChain.connect(creator).requestRandomWinner(raffleId);
        const reqReceipt = await reqTx.wait();
        const requestId = reqReceipt.logs.find(log => log.fragment && log.fragment.name === 'RandomnessRequested').args[1];

        // Capture balances before fulfillment
        const initialFeeRecipientBalance = await ethers.provider.getBalance(feeRecipient.address);

        // Fulfill Winner
        await mockVRFCoordinator.fulfillRandomWords(await rifaChain.getAddress(), requestId, [0n]);

        // Calculate expected fee (8% of 1.0 ETH = 0.08 ETH)
        const expectedFee = (ticketPrice * 800n) / 10000n;
        const expectedPrize = ticketPrice - expectedFee;

        // Verify Fee Recipient received fee
        const finalFeeRecipientBalance = await ethers.provider.getBalance(feeRecipient.address);
        expect(finalFeeRecipientBalance - initialFeeRecipientBalance).to.equal(expectedFee);

        // Verify User1 (Winner) Pending Winnings
        const pending = await rifaChain.getPendingWinnings(raffleId, user1.address);
        expect(pending).to.equal(expectedPrize);
    });

    it("Should handle platform fee for ERC20 raffles", async function () {
        const { rifaChain, mockVRFCoordinator, mockToken, creator, user1, feeRecipient, baseCreationFee } = await loadFixture(deployRifaChainFixture);
        const now = await time.latest();
        const ticketPrice = ethers.parseUnits("100", 18);
        
        // Create ERC20 Raffle
        const tx = await rifaChain.connect(creator).createRaffle(
            "ERC20 Raffle", "Desc", now + 100, now + 200, 1, 0, true, 1, await mockToken.getAddress(), ticketPrice, creator.address, true, 0, [100],
            { value: baseCreationFee }
        );
        const receipt = await tx.wait();
        const raffleId = receipt.logs.find(log => log.fragment && log.fragment.name === 'RaffleCreated').args[0];

        await time.increaseTo(now + 101);

        // User1 joins
        await mockToken.mint(user1.address, ticketPrice);
        await mockToken.connect(user1).approve(await rifaChain.getAddress(), ticketPrice);
        await rifaChain.connect(user1).joinRaffle(raffleId, 1, "0x");

        await time.increaseTo(now + 300);

        // Request Winner
        const reqTx = await rifaChain.connect(creator).requestRandomWinner(raffleId);
        const reqReceipt = await reqTx.wait();
        const requestId = reqReceipt.logs.find(log => log.fragment && log.fragment.name === 'RandomnessRequested').args[1];

        // Capture balances before fulfillment
        const initialFeeRecipientBalance = await mockToken.balanceOf(feeRecipient.address);

        // Fulfill Winner
        await mockVRFCoordinator.fulfillRandomWords(await rifaChain.getAddress(), requestId, [0n]);

        // Calculate expected fee
        const expectedFee = (ticketPrice * 800n) / 10000n;
        const expectedPrize = ticketPrice - expectedFee;

        // Verify Fee Recipient received fee (ERC20)
        const finalFeeRecipientBalance = await mockToken.balanceOf(feeRecipient.address);
        expect(finalFeeRecipientBalance - initialFeeRecipientBalance).to.equal(expectedFee);

        // Verify User1 (Winner) Pending Winnings
        const pending = await rifaChain.getPendingWinnings(raffleId, user1.address);
        expect(pending).to.equal(expectedPrize);
    });
  });
});
