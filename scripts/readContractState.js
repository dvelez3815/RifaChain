const { ethers } = require("hardhat");

async function main() {
  const contractAddress = "0x1b0a16f62d07123dfC95Fc368Fc3DAF84f045E33";
  const RifaChain = await ethers.getContractFactory("RifaChain");
  const rifaChain = RifaChain.attach(contractAddress);

  console.log("Reading state for contract:", contractAddress);

  const raffleId = "65895674655311390504464403921103385853071650271980015566017734487657716097651";
  
  try {
      const winner = await rifaChain.raffleWinners(raffleId, 0);
      console.log("Winner #0:", winner);
  } catch (e) {
      console.log("Error reading winner #0:", e.message);
  }
  
  try {
      const raffle = await rifaChain.raffles(raffleId);
      console.log("Raffle Struct:", raffle);
  } catch (e) {
      console.log("Error reading raffle struct:", e.message);
  }

  const errors = [
      "InvalidRequestConfirmations(uint16,uint16,uint16)",
      "GasLimitTooSmall(uint32,uint32)",
      "LinkTransferError(address,uint256)",
      "InvalidCalldata()",
      "OnlyCoordinatorCanFulfill(address,address)",
      "NativePayment()",
      "InvalidExtraArgsTag()",
      "NoCorrespondingRequest()",
      "IncorrectCommitment()",
      "BlockhashNotInStore(uint256)",
      "PaymentTooLarge()",
      "InvalidConsumer(uint256,address)",
      "InvalidConsumer(uint64,address)",
      "InvalidSubscription()",
      "InsufficientBalance()"
  ];
  
  errors.forEach(err => {
      const selector = ethers.id(err).slice(0, 10);
      if (selector === "0x79bfd401") {
          console.log("FOUND ERROR:", err);
      } else {
          // console.log(selector, err);
      }
  });

}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
