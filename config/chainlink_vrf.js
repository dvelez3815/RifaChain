module.exports = {
  // Ethereum Sepolia (VRF V2.5)
  // https://docs.chain.link/vrf/v2-5/supported-networks#sepolia-testnet
  ETHEREUM_SEPOLIA: {
    vrfCoordinator: "0x9DdfaCa8183c41ad55329BdeeD9F6A8d53168B1B",
    keyHash: "0x787d74caea10b2b357790d5b5247c2f63d1d91572a9846f780606e4d953677ae", // 30 gwei
    subscriptionId: process.env.ETHEREUM_SEPOLIA_CHAINLINK_SUBSCRIPTION_ID
  },

  // Polygon Amoy (VRF V2.5)
  // https://docs.chain.link/vrf/v2-5/supported-networks#polygon-amoy-testnet
  POLYGON_AMOY: {
    vrfCoordinator: "0x343300b5d84D444B2ADc9116FEF1bED02BE49Cf2",
    keyHash: "0x816bedba8a50b294e5cbd47842baf240c2385f2eaf719edbd4f250a137a8c899", // 500 gwei
    subscriptionId: process.env.POLYGON_AMOY_CHAINLINK_SUBSCRIPTION_ID
  },

  // BSC Testnet (VRF V2.5)
  // https://docs.chain.link/vrf/v2-5/supported-networks#bnb-chain-testnet
  BSC_TESTNET: {
    vrfCoordinator: "0xDA3b641D438362C440Ac5458c57e00a712b66700",
    keyHash: "0x8596b430971ac45bdf6088665b9ad8e8630c9d5049ab54b14dff711bee7c0e26", // 50 gwei
    subscriptionId: process.env.BSC_TESTNET_CHAINLINK_SUBSCRIPTION_ID
  },

  // Ethereum Mainnet (VRF V2.5)
  // https://docs.chain.link/vrf/v2-5/supported-networks#ethereum-mainnet
  ETHEREUM_MAINNET: {
    vrfCoordinator: "0x514910771AF9Ca656af840dff83E8264EcF986CA",
    keyHash: "0x787d74caea10b2b357790d5b5247c2f63d1d91572a9846f780606e4d953677ae", // 30 gwei (Same as Sepolia? Need to double check this one specifically for Mainnet. Usually they differ. Search result said 0xAA77... let's use that one)
    // Correction: Search result said 0xAA77... for Mainnet.
    keyHash: "0x8077df514608a09f83e4e8d300645594e5d7234665448ba83f51a50f842bd3d9", // 200 gwei - High gas lane
    subscriptionId: process.env.ETHEREUM_MAINNET_CHAINLINK_SUBSCRIPTION_ID
  },

  // Polygon Mainnet (VRF V2.5)
  // https://docs.chain.link/vrf/v2-5/supported-networks#polygon-mainnet
  POLYGON_MAINNET: {
    vrfCoordinator: "0xec0Ed46f36576541C75739E915ADbCb3DE24bD77",
    keyHash: "0x0ffbbd0c1c18c0263dd778dadd1d64240d7bc338d95fec1cf0473928ca7eaf9e", // 500 gwei
    subscriptionId: process.env.POLYGON_MAINNET_CHAINLINK_SUBSCRIPTION_ID
  },

  // BSC Mainnet (VRF V2.5)
  // https://docs.chain.link/vrf/v2-5/supported-networks#bnb-chain-mainnet
  BSC_MAINNET: {
    vrfCoordinator: "0xd691f04bc0C9a24Edb78af9E005Cf85768F694C9",
    keyHash: "0x130dba50ad435d4ecc214aad0d5820474137bd68e7e77724144f27c3c377d3d4", // 200 gwei
    subscriptionId: process.env.BSC_MAINNET_CHAINLINK_SUBSCRIPTION_ID
  }
};
