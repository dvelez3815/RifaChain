const { ethers, network } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Updating duration fee on network:", network.name);
  console.log("Signer:", deployer.address);

  let rifaChainAddress;
  let newDurationFee;

  // Configuration per network
  if (network.name === "sepolia") {
    rifaChainAddress = process.env.ETHEREUM_SEPOLIA_CONTRACT_ADDRESS;
    newDurationFee = ethers.parseEther("0.001"); // ~$3-4 USD
  } else if (network.name === "polygonAmoy") {
    rifaChainAddress = process.env.POLYGON_AMOY_CONTRACT_ADDRESS;
    newDurationFee = ethers.parseEther("5"); // ~$2-3 USD (approx 5 MATIC at $0.40)
  } else if (network.name === "bscTestnet") {
    rifaChainAddress = process.env.BSC_TESTNET_CONTRACT_ADDRESS;
    newDurationFee = ethers.parseEther("0.005"); // ~$3 USD
  } else if (network.name === "polygon") {
    rifaChainAddress = process.env.POLYGON_MAINNET_CONTRACT_ADDRESS;
    newDurationFee = ethers.parseEther("5"); // ~$2-3 USD
  } else if (network.name === "bsc") {
    rifaChainAddress = process.env.BSC_MAINNET_CONTRACT_ADDRESS;
    newDurationFee = ethers.parseEther("0.005"); // ~$3 USD
  } else if (network.name === "ethereum") {
    rifaChainAddress = process.env.ETHEREUM_MAINNET_CONTRACT_ADDRESS;
    newDurationFee = ethers.parseEther("0.001"); // ~$3-4 USD
  } else {
    throw new Error(`Unsupported network for fee update script: ${network.name}`);
  }

  if (!rifaChainAddress) {
    throw new Error(`Contract address not found for network: ${network.name}. Check your .env file.`);
  }

  console.log(`Target Contract: ${rifaChainAddress}`);
  console.log(`New Monthly Duration Fee: ${ethers.formatEther(newDurationFee)}`);

  const RifaChain = await ethers.getContractFactory("RifaChain");
  const rifaChain = RifaChain.attach(rifaChainAddress);

  console.log("Sending transaction...");
  const tx = await rifaChain.setDurationFee(newDurationFee);
  console.log("Transaction sent:", tx.hash);
  
  await tx.wait();
  console.log("Duration fee updated successfully!");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
