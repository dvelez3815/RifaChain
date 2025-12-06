const { ethers } = require("ethers");

const errors = [
    "InvalidTimeRange()",
    "InvalidPayoutAddress()",
    "InvalidParticipantLimits()",
    "RaffleNotActive()",
    "RaffleEnded()",
    "RaffleFull()",
    "IncorrectPayment()",
    "Unauthorized()",
    "WinnersAlreadySelected()",
    "InvalidWinnerIndex()",
    "RaffleNotEnded()",
    "InvalidConsumer(uint64,address)",
    "InvalidSubscription()",
    "InsufficientBalance()",
    "MustBeSubOwner(address)",
    "PendingRequestExists()",
    "InvalidConsumer()",
    "InvalidConsumer(uint256)",
    "InvalidConsumer(address)",
    "GasLimitTooHigh()",
    "InvalidRequestConfirmations(uint16,uint16,uint16)",
    "NumWordsTooHigh(uint32,uint32)",
    "InvalidRandomWords(uint256,uint256[])",
    "BlockhashNotInStore(uint256)",
    "PaymentTooLow()",
    "Reentrant()",
    "SubscriptionNotFound(uint256)",
    "InvalidConsumer(uint256,address)"
];

errors.forEach(err => {
    const hash = ethers.id(err);
    const selector = hash.slice(0, 10);
    console.log(`${selector} : ${err}`);
});
