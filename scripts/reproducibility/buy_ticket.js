const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  // 1. Get Raffle ID
  const raffleIdPath = path.join(__dirname, "last_raffle_id.txt");
  if (!fs.existsSync(raffleIdPath)) {
      console.error("No raffle ID found. Run create_raffle.js first.");
      process.exit(1);
  }
  const raffleId = fs.readFileSync(raffleIdPath, "utf8").trim();
  console.log("Buying ticket for Raffle ID:", raffleId);

  // 2. Setup Signer (User 2)
  // We need to create a wallet from PRIVATE_KEY_2
  const privateKey2 = process.env.PRIVATE_KEY_2;
  if (!privateKey2) {
      console.error("PRIVATE_KEY_2 not found in environment variables.");
      process.exit(1);
  }
  
  const provider = hre.ethers.provider;
  const signer = new hre.ethers.Wallet(privateKey2, provider);
  console.log("Buying with account:", signer.address);

  // 3. Get Contract
  const contractAddress = process.env.CONTRACT_ADDRESS || "0x1b0a16f62d07123dfC95Fc368Fc3DAF84f045E33";
  const RifaChain = await hre.ethers.getContractFactory("RifaChain");
  const rifaChain = RifaChain.attach(contractAddress).connect(signer);

  // 4. Get Ticket Price
  const raffle = await rifaChain.getRaffle(raffleId);
  const ticketPrice = raffle.ticketPrice;
  console.log("Ticket Price:", hre.ethers.formatEther(ticketPrice), "ETH");

  // 5. Buy Ticket
  // We need to pass a signature if it's a private raffle, but config said isPublic: true.
  // If public, signature can be empty bytes.
  const signature = "0x";
  const ticketCount = 1;
  const totalCost = BigInt(ticketPrice) * BigInt(ticketCount);

  console.log(`Buying ${ticketCount} ticket(s) for total: ${hre.ethers.formatEther(totalCost)} ETH`);

  const tx = await rifaChain.joinRaffle(raffleId, ticketCount, signature, { value: totalCost });
  console.log("Transaction sent:", tx.hash);
  await tx.wait();
  console.log("Ticket bought successfully!");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
