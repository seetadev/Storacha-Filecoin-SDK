require("@nomicfoundation/hardhat-toolbox");
require("dotenv/config");

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.28",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  networks: {
    hardhat: {
      chainId: 31337,
    },
    calibration: {
      url: process.env.FILECOIN_RPC_URL || "https://api.calibration.node.glif.io/rpc/v1",
      accounts: process.env.FILECOIN_PRIVATE_KEY ? [process.env.FILECOIN_PRIVATE_KEY] : [],
      chainId: 314159,
    },
  },
  gasReporter: {
    enabled: process.env.REPORT_GAS !== undefined,
    currency: "USD",
  },
  etherscan: {
    apiKey: process.env.ETHERSCAN_API_KEY,
  },
};
