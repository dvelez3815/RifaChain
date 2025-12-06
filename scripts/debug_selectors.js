const ethers = require("ethers");

const errors = [
    "InvalidTimeRange()",
    "InvalidPayoutAddress()",
    "RaffleNotActive()",
    "RaffleEnded()",
    "RaffleFull()",
    "IncorrectPayment()",
    "Unauthorized()",
    "WinnersAlreadySelected()",
    "InvalidWinnerIndex()"
];

console.log("Error Selectors:");
errors.forEach(err => {
    const selector = ethers.id(err).slice(0, 10);
    console.log(`${selector} : ${err}`);
});
