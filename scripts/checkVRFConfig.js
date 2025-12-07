const { ethers, network } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Checking VRF Config on network:", network.name);

  let rifaChainAddress;

  // Configuration per network
  const { getContractAddress } = require("./utils/networkConfig");
  rifaChainAddress = getContractAddress(network.name);

  if (!rifaChainAddress) {
    throw new Error(`Contract address not found for network: ${network.name}`);
  }

  console.log(`Target Contract: ${rifaChainAddress}`);

  const RifaChain = await ethers.getContractFactory("RifaChain");
  const rifaChain = RifaChain.attach(rifaChainAddress);

  // 1. Try to read public variables
  try {
    const confirmations = await rifaChain.requestConfirmations();
    console.log(`Request Confirmations: ${confirmations}`);
  } catch (e) {
    console.log("Could not read requestConfirmations (might be internal or renamed).");
  }

  try {
    // s_vrfCoordinator is often public in VRFConsumerBaseV2Plus
    const coordinator = await rifaChain.s_vrfCoordinator();
    console.log(`VRF Coordinator: ${coordinator}`);
  } catch (e) {
    console.log("Could not read s_vrfCoordinator via getter.");
  }

  // 2. Read Internal Variables via Storage Slots
  // WARNING: This depends on the storage layout. 
  // Based on RifaChain.sol:
  // Slot 0: ReentrancyGuard _status
  // Slot 1: VRFConsumerBaseV2Plus s_vrfCoordinator (typically)
  // Slot 2: gracePeriod
  // Slot 3: raffleCount
  // Slot 4: raffles (mapping)
  // Slot 5: participants (mapping)
  // Slot 6: ticketCounts (mapping)
  // Slot 7: s_subscriptionId
  // Slot 8: keyHash
  
  console.log("\n--- Reading Internal Storage Slots ---");
  const provider = ethers.provider;

  try {
      // Slot 3: s_vrfCoordinator
      const coordSlot = await provider.getStorage(rifaChainAddress, 3);
      const coordAddr = "0x" + coordSlot.slice(-40);
      console.log(`VRF Coordinator (Slot 3): ${coordAddr}`);
  } catch (e) {
      console.error("Failed to read Slot 3:", e.message);
  }

  try {
      // Slot 9: s_subscriptionId
      const subIdSlot = await provider.getStorage(rifaChainAddress, 9);
      const subId = BigInt(subIdSlot).toString();
      console.log(`Subscription ID (Slot 9): ${subId}`);
  } catch (e) {
      console.error("Failed to read Slot 9:", e.message);
  }

  try {
      // Slot 10: keyHash
      const keyHashSlot = await provider.getStorage(rifaChainAddress, 10);
      console.log(`Key Hash (Slot 10): ${keyHashSlot}`);
  } catch (e) {
      console.error("Failed to read Slot 10:", e.message);
  }

}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
