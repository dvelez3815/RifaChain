module.exports = {
    sepolia: {
        vrfCoordinator: "0x9DdfaCa8183c41ad55329BdeeD9F6A8d53168B1B",
        keyHash: "0x787d74caea10b2b357790d5b5247c2f63d1d91572a9846f780606e4d953677ae",
        subscriptionId: process.env.CHAINLINK_SUBSCRIPTION_ID_SEPOLIA || "0"
    },
    bscTestnet: {
        vrfCoordinator: "0x6A2AAd07396B36Fe02a22b33cf98705883A6132A",
        keyHash: "0xd4bb89654db74673a187bd804519e65e3f71a52bc55f11da7601a13dcf505314",
        subscriptionId: process.env.CHAINLINK_SUBSCRIPTION_ID_BSC || "0"
    },
    amoy: {
        vrfCoordinator: "0x343300b5d84D444B2ADc9116FEF1bED02BE49Cf2", // Polygon Amoy
        keyHash: "0x816bedba8a50b294e5cbd47842baf240c2385f2eaf719edbd4f250a137a8c899",
        subscriptionId: process.env.CHAINLINK_SUBSCRIPTION_ID_AMOY || "0"
    },
    hardhat: {
        vrfCoordinator: "0x0000000000000000000000000000000000000000", // Mock
        keyHash: "0x0000000000000000000000000000000000000000000000000000000000000000",
        subscriptionId: "0"
    }
};
