const { ethers, network } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Updating duration fee on network:", network.name);
  console.log("Signer:", deployer.address);

  let rifaChainAddress;
  let newDurationFee;

  // Configuration per network
  const { getContractAddress, getDurationFee } = require("./utils/networkConfig");
  rifaChainAddress = getContractAddress(network.name);
  newDurationFee = getDurationFee(network.name);

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
