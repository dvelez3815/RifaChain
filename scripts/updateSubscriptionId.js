const { ethers, network } = require("hardhat");
const chainlinkConfig = require("../config/chainlink_vrf");

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Updating VRF Subscription ID on network:", network.name);
  console.log("Signer:", deployer.address);

  let rifaChainAddress;
  let config;

    // Configuration per network
    console.log("network.name :", network.name);
    
  const { getContractAddress } = require("./utils/networkConfig");
  rifaChainAddress = getContractAddress(network.name);

  if (network.name === "sepolia") {
    config = chainlinkConfig.ETHEREUM_SEPOLIA;
  } else if (network.name === "polygonAmoy") {
    config = chainlinkConfig.POLYGON_AMOY;
  } else if (network.name === "bscTestnet") {
    config = chainlinkConfig.BSC_TESTNET;
  } else if (network.name === "polygon") {
    config = chainlinkConfig.POLYGON_MAINNET;
  } else if (network.name === "bsc") {
    config = chainlinkConfig.BSC_MAINNET;
  } else if (network.name === "ethereum") {
    config = chainlinkConfig.ETHEREUM_MAINNET;
  } else {
    throw new Error(`Unsupported network for update script: ${network.name}`);
  }

  if (!rifaChainAddress) {
    throw new Error(`Contract address not found for network: ${network.name}. Check your .env file.`);
  }

  console.log(`Target Contract: ${rifaChainAddress}`);
  console.log(`Target Subscription ID: ${config.subscriptionId}`);

  const RifaChain = await ethers.getContractFactory("RifaChain");
  const rifaChain = RifaChain.attach(rifaChainAddress);

  // Update Subscription ID
  if (config.subscriptionId) {
      console.log("Updating VRF Subscription ID.. :", config.subscriptionId);
      try {
        const tx0 = await rifaChain.setSubscriptionId(config.subscriptionId);
        await tx0.wait();
        console.log("VRF Subscription ID updated successfully!");
      } catch (error) {
        console.error("Failed to update VRF Subscription ID.");
        console.error(error.message);
      }
  } else {
      console.log("No VRF Subscription ID configured for this network.");
  }
  
  console.log("VRF Subscription ID update complete.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
