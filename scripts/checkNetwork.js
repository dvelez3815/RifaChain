const hre = require("hardhat");

async function main() {
  const network = await hre.ethers.provider.getNetwork();
  console.log("Connected to network:");
  console.log("  Name:", network.name);
  console.log("  ChainId:", network.chainId);
  
  const configChainId = hre.config.networks[hre.network.name].chainId;
  console.log("Configured ChainId:", configChainId);
  
  if (BigInt(configChainId) !== network.chainId) {
      console.error("MISMATCH DETECTED!");
  } else {
      console.log("ChainId match confirmed.");
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
