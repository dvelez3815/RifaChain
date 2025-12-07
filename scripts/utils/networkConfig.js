const { network } = require("hardhat");

const NETWORK_CONFIG = {
  sepolia: process.env.PUBLIC_ETHEREUM_SEPOLIA_CONTRACT_ADDRESS,
  polygonAmoy: process.env.PUBLIC_POLYGON_AMOY_CONTRACT_ADDRESS,
  bscTestnet: process.env.PUBLIC_BSC_TESTNET_CONTRACT_ADDRESS,
  polygon: process.env.PUBLIC_POLYGON_MAINNET_CONTRACT_ADDRESS,
  bsc: process.env.PUBLIC_BSC_MAINNET_CONTRACT_ADDRESS,
  ethereum: process.env.PUBLIC_ETHEREUM_MAINNET_CONTRACT_ADDRESS,
};

function getContractAddress(networkName) {
  const address = NETWORK_CONFIG[networkName];

  if (!address) {
    throw new Error(`Unsupported network or missing configuration for: ${networkName}`);
  }

  return address;
}

  const { ethers } = require("hardhat");

  const GRACE_PERIOD_CONFIG = {
    sepolia: 300,
    polygonAmoy: 604800,
    bscTestnet: 604800,
    polygon: 604800,
    bsc: 604800,
    ethereum: 604800,
  };

  const DURATION_FEE_CONFIG = {
    sepolia: "0.001",
    polygonAmoy: "5",
    bscTestnet: "0.005",
    polygon: "5",
    bsc: "0.005",
    ethereum: "0.001",
  };

  function getGracePeriod(networkName) {
    const period = GRACE_PERIOD_CONFIG[networkName];
    if (!period) throw new Error(`Grace period not configured for: ${networkName}`);
    return period;
  }

  function getDurationFee(networkName) {
    const fee = DURATION_FEE_CONFIG[networkName];
    if (!fee) throw new Error(`Duration fee not configured for: ${networkName}`);
    return ethers.parseEther(fee);
  }

module.exports = {
  getContractAddress,
  getGracePeriod,
  getDurationFee,
  NETWORK_CONFIG
};
