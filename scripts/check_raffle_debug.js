const hre = require("hardhat");

async function main() {
  const contractAddress = "0xd5Ed0F3648Bb04A44D7A2716A2e1e0650c1D3dCb";
  const raffleId = "20483235760465326613146274997877453652893115596552242604599908492422429566127";

  const RifaChain = await hre.ethers.getContractFactory("RifaChain");
  const rifaChain = RifaChain.attach(contractAddress);

  console.log(`Checking raffle ${raffleId} on contract ${contractAddress}...`);

  const raffle = await rifaChain.getRaffle(raffleId);
  console.log("Raffle Struct:");
  console.log(`- ID: ${raffle.id}`);
  console.log(`- Winners Selected: ${raffle.winnersSelected}`);
  console.log(`- Request ID: ${raffle.requestId}`);
  console.log(`- Is Active: ${raffle.isActive}`);

  const winners = await rifaChain.getRaffleWinners(raffleId);
  console.log(`Winners: ${winners}`);

  if (raffle.requestId > 0) {
      console.log(`VRF Request ID found: ${raffle.requestId}`);
  } else {
      console.log("No VRF Request ID found (Request not made?)");
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
