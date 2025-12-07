require("dotenv").config({ path: "../../.env" });

module.exports = {
  networks: {
    ethereum: {
      url: process.env.ETHEREUM_MAINNET_RPC_URL || "https://mainnet.infura.io/v3/YOUR-PROJECT-ID",
      chainId: 1,
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
    },
    sepolia: {
      url: process.env.POLYGON_MAINNET_RPC_URL || "https://sepolia.infura.io/v3/YOUR-PROJECT-ID",
      chainId: 11155111,
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
    },
    polygon: {
      url: process.env.POLYGON_MAINNET_RPC_URL || "https://polygon-rpc.com",
      chainId: 137,
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
    },
    polygonAmoy: {
      url: process.env.PUBLIC_POLYGON_MAINNET_RPC_URL || "https://rpc-amoy.polygon.technology",
      chainId: 80002,
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
    },
    bsc: {
      url: process.env.BSC_MAINNET_RPC_URL || "https://bsc-dataseed.binance.org/",
      chainId: 56,
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
    },
    bscTestnet: {
      url: process.env.POLYGON_MAINNET_RPC_URL || "https://data-seed-prebsc-1-s2.bnbchain.org:8545/",
      chainId: 97,
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
    },
  },
  // Common addresses or config per network can be added here
  config: {
    ethereum: {
        usdc: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
        usdt: "0xdAC17F958D2ee523a2206206994597C13D831ec7"
    },
    polygon: {
        usdc: "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174",
        usdt: "0xc2132D05D31c914a87C6611C10748AEb04B58e8F"
    },
    bsc: {
        usdc: "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d",
        usdt: "0x55d398326f99059fF775485246999027B3197955"
    }
  }
};
