const { ethers } = require("hardhat");
require("dotenv").config();

async function main() {
  const [deployer] = await ethers.getSigners();

  console.log("Deploying contracts with the account:", deployer.address);

  const chainlinkConfig = require("../config/chainlink_vrf");
  
  // Default to Sepolia if network not specified or is localhost
  const networkName = network.name === "localhost" || network.name === "hardhat" ? "ETHEREUM_SEPOLIA" : network.name.toUpperCase();
  const config = chainlinkConfig[networkName] || chainlinkConfig.ETHEREUM_SEPOLIA;

  const subscriptionId = config.subscriptionId;
  const vrfCoordinator = config.vrfCoordinator;
  const keyHash = config.keyHash;

  if (!subscriptionId) {
    console.warn(`Warning: Subscription ID not found for ${networkName}`);
  }

  console.log("Deploying RifaChain with:");
  console.log("Network:", networkName);
  console.log("VRF Coordinator:", vrfCoordinator);
  console.log("Subscription ID:", subscriptionId);
  console.log("Key Hash:", keyHash);

  const RifaChain = await ethers.getContractFactory("RifaChain");
  const rifaChain = await RifaChain.deploy(
    vrfCoordinator,
    subscriptionId,
    keyHash
  );

  await rifaChain.waitForDeployment();

  console.log("RifaChain deployed to:", await rifaChain.getAddress());
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
