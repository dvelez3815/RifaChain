const { ethers } = require("hardhat");

async function main() {
  const contractAddress = "0xd5Ed0F3648Bb04A44D7A2716A2e1e0650c1D3dCb";
  const raffleId = "93068960418219073204286076233498584526657852344583953364632241709862336348203";

  console.log(`Checking Raffle ${raffleId} on contract ${contractAddress}...`);

  const RifaChain = await ethers.getContractFactory("RifaChain");
  const rifaChain = RifaChain.attach(contractAddress);

  try {
    const raffle = await rifaChain.getRaffle(raffleId);
    console.log("Raffle Data:");
    console.log(`- ID: ${raffle.id}`);
    console.log(`- Max Participants: ${raffle.maxParticipants}`);
    console.log(`- Is Active: ${raffle.isActive}`);
    console.log(`- End Time: ${raffle.endTime}`);
    
    const count = await rifaChain.getParticipantCount(raffleId);
    console.log(`- Current Participants: ${count}`);

    const participants = await rifaChain.getParticipants(raffleId);
    console.log("Participant Addresses:");
    participants.forEach((p, i) => console.log(`  ${i + 1}. ${p}`));

    if (raffle.maxParticipants > 0 && count >= raffle.maxParticipants) {
      console.log("⚠️  RAFFLE IS FULL!");
    } else {
      console.log("✅ Raffle is NOT full.");
    }

  } catch (error) {
    console.error("Error fetching raffle data:", error);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
