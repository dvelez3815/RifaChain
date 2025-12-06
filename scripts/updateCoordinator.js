const { ethers, network } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Updating VRF Coordinator on network:", network.name);
  console.log("Signer:", deployer.address);

  const chainlinkConfig = require("../config/chainlink_vrf");

  let rifaChainAddress;
  let newCoordinatorAddress;

  // Configuration per network
  if (network.name === "sepolia") {
    rifaChainAddress = process.env.ETHEREUM_SEPOLIA_CONTRACT_ADDRESS;
    newCoordinatorAddress = chainlinkConfig.ETHEREUM_SEPOLIA.vrfCoordinator;
  } else if (network.name === "polygonAmoy") {
    rifaChainAddress = process.env.POLYGON_AMOY_CONTRACT_ADDRESS;
    newCoordinatorAddress = chainlinkConfig.POLYGON_AMOY.vrfCoordinator;
  } else if (network.name === "bscTestnet") {
    rifaChainAddress = process.env.BSC_TESTNET_CONTRACT_ADDRESS;
    newCoordinatorAddress = chainlinkConfig.BSC_TESTNET.vrfCoordinator;
  } else if (network.name === "polygon") {
    rifaChainAddress = process.env.POLYGON_MAINNET_CONTRACT_ADDRESS;
    newCoordinatorAddress = chainlinkConfig.POLYGON_MAINNET.vrfCoordinator;
  } else if (network.name === "bsc") {
    rifaChainAddress = process.env.BSC_MAINNET_CONTRACT_ADDRESS;
    newCoordinatorAddress = chainlinkConfig.BSC_MAINNET.vrfCoordinator;
  } else if (network.name === "ethereum") {
    rifaChainAddress = process.env.ETHEREUM_MAINNET_CONTRACT_ADDRESS;
    newCoordinatorAddress = chainlinkConfig.ETHEREUM_MAINNET.vrfCoordinator;
  } else {
    throw new Error(`Unsupported network for coordinator update script: ${network.name}`);
  }

  if (!rifaChainAddress) {
    throw new Error(`Contract address not found for network: ${network.name}. Check your .env file.`);
  }

  console.log(`Target Contract: ${rifaChainAddress}`);
  console.log(`New Coordinator: ${newCoordinatorAddress}`);

  const RifaChain = await ethers.getContractFactory("RifaChain");
  const rifaChain = RifaChain.attach(rifaChainAddress);

  // Check current coordinator
  try {
      const currentCoordinator = await rifaChain.s_vrfCoordinator();
      console.log(`Current Coordinator: ${currentCoordinator}`);
      
      if (currentCoordinator.toLowerCase() === newCoordinatorAddress.toLowerCase()) {
          console.log("Coordinator is already set correctly. No action needed.");
          return;
      }
  } catch (e) {
      console.log("Could not fetch current coordinator (might be different ABI or access issue). Proceeding with update...");
  }

  console.log("Sending transaction to setCoordinator...");
  const tx = await rifaChain.setCoordinator(newCoordinatorAddress);
  console.log("Transaction sent:", tx.hash);
  
  await tx.wait();
  console.log("VRF Coordinator updated successfully!");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
