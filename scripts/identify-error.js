const { ethers } = require("hardhat");

async function main() {
  const errors = [
    "InvalidTimeRange()",
    "InvalidPayoutAddress()",
    "RaffleNotActive()",
    "RaffleEnded()",
    "RaffleFull()",
    "IncorrectPayment()",
    "Unauthorized()",
    "WinnersAlreadySelected()",
    "InvalidWinnerIndex()",
    "RaffleNotEnded()"
  ];

  console.log("Error Selectors:");
  for (const err of errors) {
    const selector = ethers.id(err).slice(0, 10);
    console.log(`${selector} : ${err}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
