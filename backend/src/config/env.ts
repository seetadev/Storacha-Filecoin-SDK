import dotenv from "dotenv";

dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || "3000", 10),
  nodeEnv: process.env.NODE_ENV || "development",

  contracts: {
    fileRegistryAddress: process.env.FILE_REGISTRY_ADDRESS || "",
    paymentEscrowAddress: process.env.PAYMENT_ESCROW_ADDRESS || "",
  },

  filecoin: {
    privateKey: process.env.FILECOIN_PRIVATE_KEY || "",
    rpcUrl:
      process.env.FILECOIN_RPC_URL ||
      "https://api.calibration.node.glif.io/rpc/v1",
    glifAuthToken: process.env.GLIF_AUTH_TOKEN,
  },

  upload: {
    maxFileSize: parseInt(process.env.MAX_FILE_SIZE || "200000000", 10), // 200MB default
    tempDir: process.env.UPLOAD_TEMP_DIR || "./temp/uploads",
  },
};

export function validateConfig(): void {
  if (!config.filecoin.privateKey) {
    throw new Error("FILECOIN_PRIVATE_KEY is required");
  }

  if (!config.contracts.fileRegistryAddress || !config.contracts.paymentEscrowAddress) {
    console.warn("⚠️ Contract addresses (FILE_REGISTRY_ADDRESS, PAYMENT_ESCROW_ADDRESS) not set. Payment verification will fail.");
  }

  if (!config.filecoin.rpcUrl) {
    throw new Error("FILECOIN_RPC_URL is required");
  }

  console.log("Configuration validated");
}
