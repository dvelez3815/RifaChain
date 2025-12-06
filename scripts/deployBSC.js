const { ethers } = require("hardhat");
require("dotenv").config();

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying RifaChain to BSC with account:", deployer.address);

  const chainlinkConfig = require("../config/chainlink_vrf");
  
  // Determine if Mainnet or Testnet
  const isMainnet = network.name === "bsc";
  const config = isMainnet ? chainlinkConfig.BSC_MAINNET : chainlinkConfig.BSC_TESTNET;

  const subscriptionId = config.subscriptionId;
  const vrfCoordinator = config.vrfCoordinator;
  const keyHash = config.keyHash;

  if (!subscriptionId) {
    console.warn("Warning: Subscription ID not set. Deploying with dummy values (will fail VRF calls).");
  }

  console.log("Configuration:");
  console.log("VRF Coordinator:", vrfCoordinator);
  console.log("Key Hash:", keyHash);

  const RifaChain = await ethers.getContractFactory("RifaChain");
  const rifaChain = await RifaChain.deploy(
    vrfCoordinator,
    subscriptionId || 0,
    keyHash
  );
  await rifaChain.waitForDeployment();

  console.log("RifaChain deployed to:", await rifaChain.getAddress());
  
  // Verification instructions
  console.log("\nTo verify on BscScan:");
  console.log(`npx hardhat verify --network <network> ${await rifaChain.getAddress()} ${vrfCoordinator} ${subscriptionId || 0} ${keyHash}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
