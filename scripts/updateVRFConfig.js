const { ethers, network } = require("hardhat");
const chainlinkConfig = require("../config/chainlink_vrf");

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Updating VRF Configuration on network:", network.name);
  console.log("Signer:", deployer.address);

  let rifaChainAddress;
  let config;

  // Configuration per network
  const { getContractAddress } = require("./utils/networkConfig");
  rifaChainAddress = getContractAddress(network.name);

  // Configuration per network (for chainlink config)
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
  console.log(`Target KeyHash: ${config.keyHash}`);
  console.log(`Target SubscriptionId: ${config.subscriptionId}`);

  const RifaChain = await ethers.getContractFactory("RifaChain");
  const rifaChain = RifaChain.attach(rifaChainAddress);

  // Update KeyHash
  console.log("Updating KeyHash...");
  const tx1 = await rifaChain.setKeyHash(config.keyHash);
  await tx1.wait();
  console.log("KeyHash updated successfully!");



  // Update SubscriptionId
  if (config.subscriptionId) {
      console.log("Updating SubscriptionId...");
      const tx2 = await rifaChain.setSubscriptionId(config.subscriptionId);
      await tx2.wait();
      console.log("SubscriptionId updated successfully!");
  } else {
      console.log("Skipping SubscriptionId update (not set in config).");
  }
  
  console.log("VRF Configuration update complete.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
