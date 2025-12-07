const { ethers, network } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("===================================================");
  console.log("🔍 VRF Subscription Inspector");
  console.log("===================================================");
  console.log("Network:", network.name);
  console.log("Account:", deployer.address);

  let vrfCoordinatorAddress;
  let rifaChainAddress;

  // Configuration per network
  const config = getNetworkConfig(network.name);
  if (config) {
    vrfCoordinatorAddress = config.vrfCoordinatorAddress;
    rifaChainAddress = config.rifaChainAddress;
  } else {
    console.warn(`⚠️  Network '${network.name}' not explicitly configured. Using placeholders or failing.`);
    // You can add more networks here
  }

  if (!vrfCoordinatorAddress) {
    throw new Error(`VRF Coordinator not configured for network: ${network.name}`);
  }

  console.log("Coordinator:", vrfCoordinatorAddress);
  console.log("---------------------------------------------------");

  // 1. Get Subscriptions for the Wallet
  console.log("📡 Fetching subscriptions...");
  
  // VRF v2.5 ABI
  const coordinatorAbi = [
    "function getActiveSubscriptionIds(uint256 startIndex, uint256 maxCount) external view returns (uint256[])",
    "function getSubscription(uint256 subId) external view returns (uint96 balance, uint96 nativeBalance, uint64 reqCount, address owner, address[] consumers)"
  ];

  const coordinator = await ethers.getContractAt(coordinatorAbi, vrfCoordinatorAddress);

  try {
    // Fetch a batch of active subscriptions (e.g., first 100)
    // Note: This might be slow if there are many subscriptions on the network.
    // Ideally, we should paginate, but for a script, checking the first batch is a good start.
    const subIds = await coordinator.getActiveSubscriptionIds(0, 100);
    
    let foundCount = 0;
    console.log(`Scanning ${subIds.length} active subscriptions on the network...`);

    for (const id of subIds) {
        try {
            const sub = await coordinator.getSubscription(id);
            if (sub.owner.toLowerCase() === deployer.address.toLowerCase()) {
                foundCount++;
                console.log(`\n✅ FOUND Subscription owned by you:`);
                console.log(`   🆔 ID: ${id.toString()}`);
                console.log(`      Balance: ${ethers.formatEther(sub.balance)} LINK`);
                console.log(`      Native Balance: ${ethers.formatEther(sub.nativeBalance)} Native Token`);
                console.log(`      Consumers: ${sub.consumers.length} address(es)`);
                sub.consumers.forEach(c => console.log(`        - ${c}`));
                
                if (rifaChainAddress && sub.consumers.map(c => c.toLowerCase()).includes(rifaChainAddress.toLowerCase())) {
                    console.log("      🎉 MATCH: Your deployed contract is a consumer of this subscription!");
                }
            }
        } catch (e) {
            // Ignore errors for individual subscriptions
        }
    }

    if (foundCount === 0) {
        console.log("\n❌ No subscriptions found owned by this wallet in the first 100 active IDs.");
        console.log("👉 Ensure you have created one at https://vrf.chain.link/ and that it is active.");
    }

  } catch (error) {
    console.error("❌ Error fetching subscriptions:", error.message);
  }

  console.log("---------------------------------------------------");

  // 2. Check Deployed Contract Storage (if available)
  if (rifaChainAddress) {
      console.log(`🕵️  Inspecting deployed contract: ${rifaChainAddress}`);
      try {
          // Attempt to find the subscription ID in storage
          // This is a heuristic scan of the first 20 slots
          let found = false;
          for (let i = 0; i < 20; i++) {
              const data = await ethers.provider.getStorage(rifaChainAddress, i);
              const value = BigInt(data);
              // Subscription IDs are typically very large integers
              if (value > 1000000000n) { 
                  console.log(`   Found potential Subscription ID at slot ${i}: ${value.toString()}`);
                  found = true;
              }
          }
          if (!found) {
              console.log("   ⚠️  Could not definitively identify Subscription ID in first 20 slots.");
          }
      } catch (e) {
          console.error("   ❌ Error reading contract storage:", e.message);
      }
  } else {
      console.log("⚠️  Contract address not found in .env. Skipping storage check.");
  }
  console.log("===================================================");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
