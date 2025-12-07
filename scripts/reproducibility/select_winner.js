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
  console.log("Selecting winner for Raffle ID:", raffleId);

  // 2. Setup Signer (Creator)
  const [signer] = await hre.ethers.getSigners();
  console.log("Requesting winner with account:", signer.address);

  // 3. Get Contract
  // 3. Get Contract
  let contractAddress;
    const { getContractAddress } = require("../utils/networkConfig");
    contractAddress = getContractAddress(hre.network.name) || process.env.CONTRACT_ADDRESS || "0x1b0a16f62d07123dfC95Fc368Fc3DAF84f045E33";
  const RifaChain = await hre.ethers.getContractFactory("RifaChain");
  const rifaChain = RifaChain.attach(contractAddress);

  // 4. Check status
  const raffle = await rifaChain.getRaffle(raffleId);
  console.log("Raffle End Time:", new Date(Number(raffle.endTime) * 1000).toISOString());
  console.log("Current Time:", new Date().toISOString());

  // If raffle hasn't ended, we can't pick a winner.
  // But for testing, maybe we wait? Or we assume the user runs this after 3 mins.
  // We can add a check.
  if (Date.now() / 1000 < Number(raffle.endTime)) {
      console.log("Raffle has not ended yet. Waiting...");
      // We could wait here, or just exit.
      // Let's exit and tell user to wait.
      console.error("Please wait until the raffle end time passed.");
      process.exit(1);
  }

  // 5. Request Random Winner
  // This calls Chainlink VRF.
  const tx = await rifaChain.requestRandomWinner(raffleId);
  console.log("Transaction sent:", tx.hash);
  await tx.wait();
  console.log("Random winner requested successfully!");
  console.log("Wait for Chainlink VRF fulfillment (usually a few blocks).");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
