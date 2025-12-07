const { ethers } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Estimating gas for RifaChain deployment...");

  // Mock VRF values for estimation (doesn't affect deployment gas significantly)
  const vrfCoordinator = "0x271682DEB8C4E0901D1a1550aD2e64D568E69909"; // Example address
  const subscriptionId = 1;
  const keyHash = "0x8af398995b04c28e9951adb9721ef74c74f93e6a478f39e7e0777be13527e7ef";

  const RifaChain = await ethers.getContractFactory("RifaChain");
  const deploymentTx = await RifaChain.getDeployTransaction(
    vrfCoordinator,
    subscriptionId,
    keyHash
  );

  const estimatedGas = await ethers.provider.estimateGas(deploymentTx);
  console.log(`Estimated Gas: ${estimatedGas.toString()}`);
  
  // Also deploy to get exact usage in local env
  const rifaChain = await RifaChain.deploy(vrfCoordinator, subscriptionId, keyHash);
  const receipt = await rifaChain.deploymentTransaction().wait();
  console.log(`Actual Gas Used (Local): ${receipt.gasUsed.toString()}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
