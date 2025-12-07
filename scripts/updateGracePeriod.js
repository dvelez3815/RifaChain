const { ethers, network } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Updating grace period on network:", network.name);
  console.log("Signer:", deployer.address);

  let rifaChainAddress;
  let newGracePeriod;

  // Configuration per network
  const { getContractAddress, getGracePeriod } = require("./utils/networkConfig");
  rifaChainAddress = getContractAddress(network.name);
  newGracePeriod = getGracePeriod(network.name);

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
