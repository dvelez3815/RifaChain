const { ethers, network } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Updating fees on network:", network.name);
  console.log("Signer:", deployer.address);

  let rifaChainAddress;
  let newBaseFee;
  let newAdditionalFee;

  // Configuration per network
  // Configuration per network
  if (network.name === "sepolia") {
    rifaChainAddress = process.env.ETHEREUM_SEPOLIA_CONTRACT_ADDRESS;
    newBaseFee = ethers.parseEther("0.0015"); // ~$5 USD
    newAdditionalFee = ethers.parseEther("0.00075");
  } else if (network.name === "polygonAmoy") {
    rifaChainAddress = process.env.POLYGON_AMOY_CONTRACT_ADDRESS;
    newBaseFee = ethers.parseEther("0.01"); // ~$6 USD (approx 15 MATIC at $0.40)
    newAdditionalFee = ethers.parseEther("0.005");
  } else if (network.name === "bscTestnet") {
    rifaChainAddress = process.env.BSC_TESTNET_CONTRACT_ADDRESS;
    newBaseFee = ethers.parseEther("0.01"); // ~$6 USD
    newAdditionalFee = ethers.parseEther("0.005");
  } else if (network.name === "polygon") {
    rifaChainAddress = process.env.POLYGON_MAINNET_CONTRACT_ADDRESS;
    newBaseFee = ethers.parseEther("15"); // ~$6 USD
    newAdditionalFee = ethers.parseEther("5");
  } else if (network.name === "bsc") {
    rifaChainAddress = process.env.BSC_MAINNET_CONTRACT_ADDRESS;
    newBaseFee = ethers.parseEther("0.01");
    newAdditionalFee = ethers.parseEther("0.005");
  } else if (network.name === "ethereum") {
    rifaChainAddress = process.env.ETHEREUM_MAINNET_CONTRACT_ADDRESS;
    newBaseFee = ethers.parseEther("0.0015");
    newAdditionalFee = ethers.parseEther("0.00075");
  } else {
    throw new Error(`Unsupported network for fee update script: ${network.name}`);
  }

  if (!rifaChainAddress) {
    throw new Error(`Contract address not found for network: ${network.name}. Check your .env file.`);
  }

  console.log(`Target Contract: ${rifaChainAddress}`);
  console.log(`New Base Fee: ${ethers.formatEther(newBaseFee)}`);
  console.log(`New Additional Fee: ${ethers.formatEther(newAdditionalFee)}`);

  const RifaChain = await ethers.getContractFactory("RifaChain");
  const rifaChain = RifaChain.attach(rifaChainAddress);

  console.log("Sending transaction...");
  const tx = await rifaChain.setCreationFees(newBaseFee, newAdditionalFee);
  console.log("Transaction sent:", tx.hash);
  
  await tx.wait();
  console.log("Fees updated successfully!");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
