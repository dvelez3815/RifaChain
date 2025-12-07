const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  // 1. Load Config
  const configPath = path.join(__dirname, "configs", "raffle_config.json");
  const config = JSON.parse(fs.readFileSync(configPath, "utf8"));

  // 2. Setup Signer
  const [signer] = await hre.ethers.getSigners();
  console.log("Creating raffle with account:", signer.address);

  // 3. Get Contract
  // Assuming RifaChain is already deployed and we have the address.
  // We can get it from the deployment or env.
  // For reproducibility, let's assume we need to attach to an existing deployment.
  // We'll check if CONTRACT_ADDRESS is in env, otherwise look for deployment file?
  // Or just use the one we know from previous context: 0x1b0a16f62d07123dfC95Fc368Fc3DAF84f045E33 (Sepolia)
  
  let contractAddress;
  const { getContractAddress } = require("../utils/networkConfig");
  contractAddress = getContractAddress(hre.network.name) || process.env.CONTRACT_ADDRESS || "0x1b0a16f62d07123dfC95Fc368Fc3DAF84f045E33";
  const RifaChain = await hre.ethers.getContractFactory("RifaChain");
  const rifaChain = RifaChain.attach(contractAddress);

  // 4. Prepare Parameters
  const now = Math.floor(Date.now() / 1000);
  const startTime = config.startTime === "NOW" ? now : config.startTime;
  const endTime = config.endTime === "NOW_PLUS_3_MIN" ? now + 180 : (config.endTime === "NOW" ? now : config.endTime);
  
  const payoutAddress = config.payoutAddress === "signer" ? signer.address : config.payoutAddress;

  // Creation Fee (fetch from contract)
  const creationFee = await rifaChain.getCreationFee(config.winnerPercentages.length);
  const fundingAmount = BigInt(config.fundingAmount);
  const totalValue = config.tokenType === 0 ? fundingAmount + creationFee : creationFee;

  console.log("Parameters:");
  console.log(`Title: ${config.title}`);
  console.log(`Start Time: ${startTime} (${new Date(startTime * 1000).toISOString()})`);
  console.log(`End Time: ${endTime} (${new Date(endTime * 1000).toISOString()})`);
  console.log(`Creation Fee: ${hre.ethers.formatEther(creationFee)} ETH`);
  console.log(`Funding Amount: ${hre.ethers.formatEther(fundingAmount)} ETH`);
  console.log(`Total Value to Send: ${hre.ethers.formatEther(totalValue)} ETH`);

  // 5. Execute Transaction
  const tx = await rifaChain.createRaffle(
    config.title,
    config.description,
    startTime,
    endTime,
    config.minParticipants,
    config.maxParticipants,
    config.isPublic,
    config.tokenType,
    config.tokenAddress,
    config.ticketPrice,
    payoutAddress,
    config.allowMultipleEntries,
    fundingAmount,
    config.winnerPercentages,
    { value: totalValue }
  );

  console.log("Transaction sent:", tx.hash);
  await tx.wait();
  console.log("Raffle created successfully!");
  
  // Get the Raffle ID from events
  const receipt = await tx.wait();
  const event = receipt.logs.find(log => {
    try {
        const parsed = rifaChain.interface.parseLog(log);
        return parsed.name === "RaffleCreated";
    } catch (e) {
        return false;
    }
  });
  
  if (event) {
      const parsed = rifaChain.interface.parseLog(event);
      console.log("Raffle ID:", parsed.args.raffleId.toString());
      
      // Save Raffle ID for next steps
      fs.writeFileSync(path.join(__dirname, "last_raffle_id.txt"), parsed.args.raffleId.toString());
  } else {
      console.log("Could not find RaffleCreated event.");
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
