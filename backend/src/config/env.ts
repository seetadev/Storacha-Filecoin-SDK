import dotenv from "dotenv";

dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || "3000", 10),
  nodeEnv: process.env.NODE_ENV || "development",

  filecoin: {
    privateKey: process.env.FILECOIN_PRIVATE_KEY || "",
    rpcUrl:
      process.env.FILECOIN_RPC_URL ||
      "https://api.calibration.node.glif.io/rpc/v1",
    glifAuthToken: process.env.GLIF_AUTH_TOKEN,
    fileRegistryAddress: process.env.FILE_REGISTRY_ADDRESS || "",
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

  if (!config.filecoin.rpcUrl) {
    throw new Error("FILECOIN_RPC_URL is required");
  }

  if (!config.filecoin.fileRegistryAddress) {
    throw new Error("FILE_REGISTRY_ADDRESS is required in environment variables");
  }

  console.log("Configuration validated");
}
