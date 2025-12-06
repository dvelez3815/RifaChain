const { ethers, network } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Updating grace period on network:", network.name);
  console.log("Signer:", deployer.address);

  let rifaChainAddress;
  let newGracePeriod;

  // Configuration per network
  if (network.name === "sepolia") {
    rifaChainAddress = process.env.ETHEREUM_SEPOLIA_CONTRACT_ADDRESS;
    newGracePeriod = 300; // 5 minutes in seconds
  } else if (network.name === "polygonAmoy") {
    rifaChainAddress = process.env.POLYGON_AMOY_CONTRACT_ADDRESS;
    newGracePeriod = 604800; // 7 days in seconds
  } else if (network.name === "bscTestnet") {
    rifaChainAddress = process.env.BSC_TESTNET_CONTRACT_ADDRESS;
    newGracePeriod = 604800; // 7 days in seconds
  } else if (network.name === "polygon") {
    rifaChainAddress = process.env.POLYGON_MAINNET_CONTRACT_ADDRESS;
    newGracePeriod = 604800;
  } else if (network.name === "bsc") {
    rifaChainAddress = process.env.BSC_MAINNET_CONTRACT_ADDRESS;
    newGracePeriod = 604800;
  } else if (network.name === "ethereum") {
    rifaChainAddress = process.env.ETHEREUM_MAINNET_CONTRACT_ADDRESS;
    newGracePeriod = 604800;
  } else {
    throw new Error(`Unsupported network for grace period update script: ${network.name}`);
  }

  if (!rifaChainAddress) {
    throw new Error(`Contract address not found for network: ${network.name}. Check your .env file.`);
  }

  console.log(`Target Contract: ${rifaChainAddress}`);
  console.log(`New Grace Period: ${newGracePeriod} seconds`);

  const RifaChain = await ethers.getContractFactory("RifaChain");
  const rifaChain = RifaChain.attach(rifaChainAddress);

  console.log("Sending transaction...");
  const tx = await rifaChain.setGracePeriod(newGracePeriod);
  console.log("Transaction sent:", tx.hash);
  
  await tx.wait();
  console.log("Grace period updated successfully!");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
