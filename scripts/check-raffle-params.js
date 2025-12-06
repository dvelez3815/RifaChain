const { ethers } = require("hardhat");

async function main() {
  const contractAddress = "0xd5Ed0F3648Bb04A44D7A2716A2e1e0650c1D3dCb";
  const raffleId = "11827691536639629745744959765076131404882498084740025687776409972651924974283";

  console.log(`Checking Raffle ${raffleId} on ${contractAddress}`);

  // We need the ABI. Since we might not have the exact artifact for the old contract, 
  // we'll try to use the current RifaChain artifact, but be aware of struct changes.
  // The old contract likely doesn't have 'requestId' or 'raffleWinners' if it was deployed before my recent changes.
  // But it SHOULD have 'minParticipants' if it was deployed after the user's previous session.
  
  // Let's try to read the struct. If the struct layout changed, reading 'raffles(id)' might return garbage or fail.
  // The 'raffles' mapping returns a tuple.
  
  // Current struct:
  // id, creator, title, desc, start, end, minP, maxP, public, codeHash, tokenType, tokenAddr, price, payout, active, winnersSelected, requestId
  
  // Previous struct (likely on 0x333...):
  // id, creator, title, desc, start, end, minP, maxP, public, codeHash, tokenType, tokenAddr, price, payout, active, winnersSelected
  
  // Let's try to fetch it using a raw call or a partial ABI to be safe.
  
  // const provider = new ethers.JsonRpcProvider("https://rpc.sepolia.org");
  const provider = ethers.provider;
  
  // Try with the ABI that includes minParticipants but NOT requestId (assuming 0x333... is from before step 327)
  const abi = [
    "function raffles(uint256) view returns (uint256, address, string, string, uint256, uint256, uint256, uint256, bool, bytes32, uint8, address, uint256, address, bool, bool, uint256)",
    "function getParticipantCount(uint256) view returns (uint256)"
  ];
  
  const contract = new ethers.Contract(contractAddress, abi, provider);

  try {
    const data = await contract.raffles(raffleId);
    console.log("Raffle Data:");
    console.log("- ID:", data[0].toString());
    console.log("- Creator:", data[1]);
    console.log("- Start Time:", new Date(Number(data[4]) * 1000).toISOString());
    console.log("- End Time:", new Date(Number(data[5]) * 1000).toISOString());
    console.log("- Min Participants:", data[6].toString());
    console.log("- Max Participants:", data[7].toString());
    console.log("- Is Active:", data[14]);
    console.log("- Winners Selected:", data[15]);
    console.log("- Request ID:", data[16].toString());
    
    const count = await contract.getParticipantCount(raffleId);
    console.log("- Participant Count:", count.toString());

    const now = Math.floor(Date.now() / 1000);
    console.log("- Current Time:", new Date(now * 1000).toISOString());
    
    if (now <= Number(data[5])) {
        console.log("Status: Time NOT ended.");
    } else {
        console.log("Status: Time ended.");
    }
    
    if (Number(data[6]) > 0 && Number(count) >= Number(data[6])) {
        console.log("Status: Min participants reached.");
    } else {
        console.log("Status: Min participants NOT reached.");
    }

  } catch (e) {
    console.error("Error fetching raffle data:", e);
    // If it failed, maybe the ABI is different (e.g. it HAS requestId?)
    console.log("Retrying with ABI including requestId...");
    const abi2 = [
        "function raffles(uint256) view returns (uint256, address, string, string, uint256, uint256, uint256, uint256, bool, bytes32, uint8, address, uint256, address, bool, bool, uint256)"
    ];
    const contract2 = new ethers.Contract(contractAddress, abi2, provider);
    try {
        const data = await contract2.raffles(raffleId);
        console.log("Raffle Data (with requestId):");
        console.log("- Min Participants:", data[6].toString());
    } catch (e2) {
        console.error("Failed with second ABI too.");
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
