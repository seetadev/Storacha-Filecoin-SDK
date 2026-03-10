import { createHash, randomBytes } from "crypto";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { ethers } from "ethers";
import dotenv from "dotenv";

type UploadResponse = {
  success: boolean;
  data: {
    fileId: number;
    pieceCid: string;
    storagePrice: string;
    contractTxHash?: string;
  };
};

type PreflightResponse = {
  success: boolean;
  data: {
    canUpload: boolean;
    allowance: {
      sufficient: boolean;
      message?: string | null;
    };
    selectedProvider?: {
      id: number;
      name: string;
      serviceProvider: string;
    } | null;
    dataSetId?: number | null;
  };
};

type PayResponse = {
  success: boolean;
  data: {
    fileId: number;
    pieceCid: string;
    amount: string;
    paymentTxHash: string;
    status: string;
  };
};

type StatusResponse = {
  success: boolean;
  data: {
    fileId: number;
    pieceCid: string;
    status: number;
    payment: {
      hasPayment: boolean;
      amount: string;
      isReleased: boolean;
    };
  };
};

type TokenResponse = {
  success: boolean;
  data: {
    token: string;
  };
};

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config();

function getEnv(name: string, required = true): string {
  const value = process.env[name];
  if (!value && required) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value || "";
}

function resolveContractsDir(): string {
  const candidates = [
    resolve(process.cwd(), "dist/contracts"),
    resolve(process.cwd(), "src/contracts"),
    resolve(__dirname, "../contracts"),
  ];

  for (const dir of candidates) {
    try {
      readFileSync(resolve(dir, "deployments.json"), "utf8");
      return dir;
    } catch {
      // Keep trying candidates
    }
  }

  throw new Error("Could not locate contracts directory with deployments/ABIs");
}

function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

async function httpJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const body = (await res.json().catch(() => ({}))) as any;
  if (!res.ok) {
    const message =
      (body && (body.error || body.message)) || `HTTP ${res.status}`;
    throw new Error(`Request failed for ${url}: ${message}`);
  }
  return body as T;
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

async function main() {
  const backendUrl = process.env.BACKEND_URL || "http://localhost:3000";
  const rpcUrl = process.env.FILECOIN_RPC_URL;
  if (!rpcUrl) {
    throw new Error("Missing required environment variable: FILECOIN_RPC_URL");
  }
  const network = process.env.FILECOIN_NETWORK || "calibration";
  const timeoutSeconds = parseInt(
    process.env.SMOKE_TIMEOUT_SECONDS || "300",
    10,
  );
  const pollIntervalMs = parseInt(
    process.env.SMOKE_POLL_INTERVAL_MS || "10000",
    10,
  );

  console.log(`Smoke test target backend: ${backendUrl}`);
  console.log(`RPC: ${rpcUrl}`);
  console.log(`Network deployment key: ${network}`);

  const contractsDir = resolveContractsDir();
  const deployments = JSON.parse(
    readFileSync(resolve(contractsDir, "deployments.json"), "utf8"),
  );
  const fileRegistryAbi = JSON.parse(
    readFileSync(resolve(contractsDir, "FileRegistry.json"), "utf8"),
  ).abi;
  const paymentEscrowAbi = JSON.parse(
    readFileSync(resolve(contractsDir, "PaymentEscrow.json"), "utf8"),
  ).abi;

  const deployment = deployments[network];
  if (!deployment) {
    throw new Error(`No deployment found for network '${network}'`);
  }

  const fileRegistryAddress = deployment.contracts.FileRegistry.address;
  const paymentEscrowAddress = deployment.contracts.PaymentEscrow.address;

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const fileRegistryIface = new ethers.Interface(fileRegistryAbi);
  const paymentEscrowIface = new ethers.Interface(paymentEscrowAbi);

  const startBlock = await provider.getBlockNumber();
  console.log(`Start block: ${startBlock}`);

  console.log("1) Health check");
  await httpJson(`${backendUrl}/health`);

  console.log("2) Uploading smoke file");
  const inputBytes = randomBytes(1024);
  const inputHash = sha256Hex(inputBytes);

  const preflight = await httpJson<PreflightResponse>(
    `${backendUrl}/api/storage/preflight?size=${inputBytes.length}`,
  );
  if (!preflight.success || !preflight.data.canUpload) {
    throw new Error(
      `Preflight cannot upload: ${preflight.data.allowance?.message || "unknown reason"}`,
    );
  }

  const providerAddress = preflight.data.selectedProvider?.serviceProvider;
  if (!providerAddress) {
    console.warn(
      "Preflight returned no selected provider; continuing with backend/Synapse provider resolution.",
    );
  }

  const form = new FormData();
  form.append("file", new Blob([inputBytes]), "smoke.bin");
  if (providerAddress) {
    form.append("providerAddress", providerAddress);
  }
  if (preflight.data.dataSetId != null) {
    form.append("dataSetId", String(preflight.data.dataSetId));
  }

  const upload = await httpJson<UploadResponse>(
    `${backendUrl}/api/storage/upload`,
    {
      method: "POST",
      body: form,
    },
  );

  if (!upload.success) {
    throw new Error("Upload endpoint returned unsuccessful response");
  }
  const { fileId, pieceCid, contractTxHash } = upload.data;
  if (!fileId || !pieceCid || !contractTxHash) {
    throw new Error("Upload response missing fileId/pieceCid/contractTxHash");
  }
  console.log(`Uploaded fileId=${fileId} pieceCid=${pieceCid}`);

  console.log("3) Verifying FileUploaded event on-chain");
  const registerReceipt = await provider.getTransactionReceipt(contractTxHash);
  if (!registerReceipt) {
    throw new Error(`Missing receipt for register tx: ${contractTxHash}`);
  }
  const uploadedLog = registerReceipt.logs
    .map((log) => {
      try {
        return fileRegistryIface.parseLog(log);
      } catch {
        return null;
      }
    })
    .find((evt) => evt?.name === "FileUploaded");
  if (!uploadedLog) {
    throw new Error("FileUploaded event not found in register receipt");
  }
  if (Number(uploadedLog.args[0]) !== fileId) {
    throw new Error("FileUploaded fileId mismatch");
  }

  console.log("4) Paying file escrow");
  const pay = await httpJson<PayResponse>(`${backendUrl}/api/storage/pay`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fileId }),
  });
  if (!pay.success) {
    throw new Error("Pay endpoint returned unsuccessful response");
  }
  if (pay.data.fileId !== fileId) {
    throw new Error("Pay response fileId mismatch");
  }

  console.log("5) Verifying PaymentDeposited event on-chain");
  const payReceipt = await provider.getTransactionReceipt(
    pay.data.paymentTxHash,
  );
  if (!payReceipt) {
    throw new Error(`Missing receipt for pay tx: ${pay.data.paymentTxHash}`);
  }
  const depositedLog = payReceipt.logs
    .map((log) => {
      try {
        return paymentEscrowIface.parseLog(log);
      } catch {
        return null;
      }
    })
    .find((evt) => evt?.name === "PaymentDeposited");
  if (!depositedLog) {
    throw new Error("PaymentDeposited event not found in pay receipt");
  }
  if (Number(depositedLog.args[1]) !== fileId) {
    throw new Error("PaymentDeposited fileId mismatch");
  }

  console.log("6) Polling status until stored + released");
  const deadline = Date.now() + timeoutSeconds * 1000;
  let latestStatus: StatusResponse | null = null;

  while (Date.now() < deadline) {
    latestStatus = await httpJson<StatusResponse>(
      `${backendUrl}/api/storage/status/${fileId}`,
    );

    const stored = latestStatus.data.status >= 2;
    const released = latestStatus.data.payment.isReleased;

    console.log(
      `Status: fileStatus=${latestStatus.data.status} released=${released}`,
    );

    if (stored && released) {
      break;
    }

    await sleep(pollIntervalMs);
  }

  if (
    !latestStatus ||
    latestStatus.data.status < 2 ||
    !latestStatus.data.payment.isReleased
  ) {
    throw new Error("Timed out waiting for stored+released state");
  }

  console.log("7) Verifying PaymentReleased event exists on-chain");
  const releasedEvent = paymentEscrowIface.getEvent("PaymentReleased");
  if (!releasedEvent) {
    throw new Error("PaymentReleased event not present in PaymentEscrow ABI");
  }
  const releasedTopic = releasedEvent.topicHash;
  const releaseLogs = await provider.getLogs({
    address: paymentEscrowAddress,
    fromBlock: startBlock,
    toBlock: "latest",
    topics: [
      releasedTopic,
      null,
      ethers.zeroPadValue(ethers.toBeHex(fileId), 32),
    ],
  });

  if (releaseLogs.length === 0) {
    throw new Error("No PaymentReleased log found for fileId in scanned range");
  }

  console.log("8) Fetch UCAN token and download file");
  const tokenResponse = await httpJson<TokenResponse>(
    `${backendUrl}/api/storage/ucan/download-token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pieceCid, expiresInSeconds: 600 }),
    },
  );

  const downloadRes = await fetch(
    `${backendUrl}/api/storage/download/${pieceCid}`,
    {
      headers: {
        Authorization: `Bearer ${tokenResponse.data.token}`,
      },
    },
  );
  if (!downloadRes.ok) {
    const text = await downloadRes.text();
    throw new Error(`Download failed: ${downloadRes.status} ${text}`);
  }

  const outputBytes = new Uint8Array(await downloadRes.arrayBuffer());
  const outputHash = sha256Hex(outputBytes);
  if (inputHash !== outputHash) {
    throw new Error(
      `Downloaded payload hash mismatch: ${inputHash} != ${outputHash}`,
    );
  }

  console.log("9) Negative check: download without UCAN should fail");
  const noAuthRes = await fetch(
    `${backendUrl}/api/storage/download/${pieceCid}`,
  );
  if (noAuthRes.status !== 401) {
    throw new Error(`Expected 401 without UCAN, got ${noAuthRes.status}`);
  }

  console.log(
    "Smoke test passed: upload -> pay -> stored -> released -> retrieve validated",
  );
  console.log(
    JSON.stringify(
      {
        fileId,
        pieceCid,
        registerTx: contractTxHash,
        payTx: pay.data.paymentTxHash,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error("Smoke test failed:", error);
  process.exit(1);
});
