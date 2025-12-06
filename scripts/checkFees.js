const { ethers, network } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Checking fees on network:", network.name);

  let rifaChainAddress;

  if (network.name === "sepolia") {
    rifaChainAddress = process.env.ETHEREUM_SEPOLIA_CONTRACT_ADDRESS;
  } else if (network.name === "polygonAmoy") {
    rifaChainAddress = process.env.POLYGON_AMOY_CONTRACT_ADDRESS;
  } else if (network.name === "bscTestnet") {
    rifaChainAddress = process.env.BSC_TESTNET_CONTRACT_ADDRESS;
  } else if (network.name === "polygon") {
    rifaChainAddress = process.env.POLYGON_MAINNET_CONTRACT_ADDRESS;
  } else if (network.name === "bsc") {
    rifaChainAddress = process.env.BSC_MAINNET_CONTRACT_ADDRESS;
  } else if (network.name === "ethereum") {
    rifaChainAddress = process.env.ETHEREUM_MAINNET_CONTRACT_ADDRESS;
  } else {
    throw new Error(`Unsupported network: ${network.name}`);
  }

  if (!rifaChainAddress) {
    throw new Error(`Contract address not found for network: ${network.name}. Check your .env file.`);
  }

  console.log(`Contract: ${rifaChainAddress}`);

  const RifaChain = await ethers.getContractFactory("RifaChain");
  const rifaChain = RifaChain.attach(rifaChainAddress);

  const baseFee = await rifaChain.baseCreationFee();
  const additionalFee = await rifaChain.additionalWinnerFee();

  console.log(`Base Fee: ${ethers.formatEther(baseFee)}`);
  console.log(`Additional Fee: ${ethers.formatEther(additionalFee)}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
