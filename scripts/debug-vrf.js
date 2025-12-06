const { ethers } = require("hardhat");

async function main() {
  const contractAddress = "0xd5Ed0F3648Bb04A44D7A2716A2e1e0650c1D3dCb"; // From user's check-raffle.js
  const raffleId = "93068960418219073204286076233498584526657852344583953364632241709862336348203"; // From user's check-raffle.js

  console.log(`Debugging VRF for Raffle ${raffleId} on contract ${contractAddress}...`);

  const RifaChain = await ethers.getContractFactory("RifaChain");
  const rifaChain = RifaChain.attach(contractAddress);

  // 1. Check if raffle exists and is active
  const raffle = await rifaChain.getRaffle(raffleId);
  console.log("Raffle Status:");
  console.log(`- Active: ${raffle.isActive}`);
  console.log(`- Winners Selected: ${raffle.winnersSelected}`);
  console.log(`- End Time: ${raffle.endTime}`);
  console.log(`- Current Time: ${Math.floor(Date.now() / 1000)}`);

  if (Date.now() / 1000 <= raffle.endTime) {
    console.log("⚠️ Raffle has not ended yet! requestRandomWinner will revert.");
  }

  // 2. Check VRF Coordinator
  // s_vrfCoordinator is internal in some versions, but public in others. 
  // If it's not accessible, we might fail here.
  try {
    // Try to access the storage slot if getter is missing, or just try the getter
    // VRFConsumerBaseV2Plus usually has s_vrfCoordinator as public or internal.
    // If it's internal, we can't easily get it without slot reading.
    // But let's assume we can get it or we know it.
    // For Sepolia, it should be 0x9DdfaCa8183c41ad55329BdeeD9F6A8d53168B1B (VRF V2.5)
  } catch (e) {
    console.log("Could not fetch VRF Coordinator address directly.");
  }

  // 3. Estimate Gas
  console.log("Attempting to estimate gas for requestRandomWinner...");
  try {
    const gas = await rifaChain.requestRandomWinner.estimateGas(raffleId);
    console.log(`Gas Estimate: ${gas.toString()}`);
  } catch (error) {
    console.error("❌ Gas Estimation Failed!");
    console.error("Reason:", error.reason);
    console.error("Message:", error.message);
    
    if (error.message.includes("gas limit too high")) {
      console.log("\nPossible Causes:");
      console.log("1. The transaction is reverting.");
      console.log("2. The contract is not a valid consumer in the VRF Subscription.");
      console.log("3. The VRF Subscription is not funded (if paying with LINK).");
      console.log("4. The caller is not the creator or owner.");
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
