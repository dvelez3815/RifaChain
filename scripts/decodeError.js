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
    "AlreadyJoined()",
    "InvalidWinnerPercentages()",
    "InvalidSignature()",
    "NoPendingWinnings()",
    "TransferFailed()",
    "RaffleNotCancelled()",
    "NothingToRefund()",
    "EarningsAlreadyCollected()",
    "NoEarningsToCollect()",
    // VRF Errors
    "InvalidSubscription()",
    "InsufficientBalance()",
    "MustBeSubOwner(address owner)",
    "PendingRequestExists()",
    "InvalidConsumer()",
    "BalanceInvariantViolated(uint256 internalBalance, uint256 externalBalance)",
    "GasLimitTooBig(uint32 have, uint32 want)",
    "NumWordsTooBig(uint32 have, uint32 want)",
    "ProvingKeyAlreadyRegistered(bytes32 keyHash)",
    "NoSuchProvingKey(bytes32 keyHash)",
    "InvalidRandomWords(uint256 requestId, uint256[] randomWords)",
    "NoCorrespondingRequest()",
    "IncorrectCommitment()",
    "BlockhashNotInStore(uint256 blockNum)",
    "PaymentTooLarge()",
    "Reentrant()"
];

console.log("Error Selectors:");
errors.forEach(err => {
    const selector = ethers.id(err).slice(0, 10);
    console.log(`${selector} : ${err}`);
});
