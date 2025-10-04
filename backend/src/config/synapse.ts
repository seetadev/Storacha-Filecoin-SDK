import { Synapse } from "@filoz/synapse-sdk";

let synapseInstance: Synapse | null = null;

export async function initializeSynapse(): Promise<Synapse> {
  if (synapseInstance) {
    return synapseInstance;
  }

  const privateKey = process.env.FILECOIN_PRIVATE_KEY;
  const rpcURL = process.env.FILECOIN_RPC_URL;

  if (!privateKey) {
    throw new Error("FILECOIN_PRIVATE_KEY not set in environment");
  }

  if (!rpcURL) {
    throw new Error("FILECOIN_RPC_URL not set in environment");
  }

  try {
    console.log(" Initializing Synapse SDK...");
    console.log(`   RPC URL: ${rpcURL}`);

    const config: any = {
      privateKey,
      rpcURL,
    };

    synapseInstance = await Synapse.create(config);

    const address = await synapseInstance.getSigner().getAddress();
    console.log(" Synapse SDK initialized");
    console.log(`   Address: ${address}`);

    return synapseInstance;
  } catch (error) {
    console.error("❌ Failed to initialize Synapse SDK:", error);
    throw error;
  }
}

export function getSynapse(): Synapse {
  if (!synapseInstance) {
    throw new Error("Synapse not initialized. Call initializeSynapse() first.");
  }
  return synapseInstance;
}

export async function cleanupSynapse(): Promise<void> {
  if (synapseInstance) {
    // Clean up any resources if needed
    console.log(" Synapse connection closed");
    synapseInstance = null;
  }
}
