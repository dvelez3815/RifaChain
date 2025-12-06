const { ethers } = require("hardhat");
require("dotenv").config();

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying RifaChain to Ethereum/Sepolia with account:", deployer.address);

  const chainlinkConfig = require("../config/chainlink_vrf");

  // Determine if Mainnet or Sepolia
  const isMainnet = network.name === "ethereum";
  const config = isMainnet ? chainlinkConfig.ETHEREUM_MAINNET : chainlinkConfig.ETHEREUM_SEPOLIA;

  const subscriptionId = config.subscriptionId;
  const vrfCoordinator = config.vrfCoordinator;
  const keyHash = config.keyHash;

  if (!subscriptionId) {
    throw new Error(`Please set Subscription ID in .env for ${network.name}`);
  }

  console.log("Configuration:");
  console.log("VRF Coordinator:", vrfCoordinator);
  console.log("Key Hash:", keyHash);

  const RifaChain = await ethers.getContractFactory("RifaChain");
  const rifaChain = await RifaChain.deploy(
    vrfCoordinator,
    subscriptionId,
    keyHash
  );
  await rifaChain.waitForDeployment();

  console.log("RifaChain deployed to:", await rifaChain.getAddress());
  
  // Verification instructions
  console.log("\nTo verify on Etherscan:");
  console.log(`npx hardhat verify --network <network> ${await rifaChain.getAddress()} ${vrfCoordinator} ${subscriptionId} ${keyHash}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
