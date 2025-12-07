const { ethers, network } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Checking fees on network:", network.name);

  let rifaChainAddress;

  const { getContractAddress } = require("./utils/networkConfig");
  rifaChainAddress = getContractAddress(network.name);

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
