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
  const { getContractAddress } = require("./utils/networkConfig");
  rifaChainAddress = getContractAddress(network.name);

  if (network.name === "sepolia" || network.name === "ethereum") {
    newBaseFee = ethers.parseEther("0.0015");
    newAdditionalFee = ethers.parseEther("0.00075");
  } else if (network.name === "polygonAmoy" || network.name === "bscTestnet" || network.name === "bsc") {
    newBaseFee = ethers.parseEther("0.01");
    newAdditionalFee = ethers.parseEther("0.005");
  } else if (network.name === "polygon") {
    newBaseFee = ethers.parseEther("15");
    newAdditionalFee = ethers.parseEther("5");
  } else {
     // Fallback or specific error if needed, though getContractAddress handles unsupported networks generally, 
     // we still need fee config.
     throw new Error(`Fee configuration not found for network: ${network.name}`);
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
