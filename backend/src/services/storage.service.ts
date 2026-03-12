import { getSynapse } from "../config/synapse.js";
import { getContractService } from "./contract.service.js";
import { ethers } from "ethers";

export interface UploadResult {
  fileId: number;
  pieceCid: string;
  size: number;
  filename: string;
  uploadedAt: Date;
  storagePrice: string;
  selectedProvider?: {
    id: number;
    address: string;
    name: string;
  };
  dataSetId?: number;
  uploadTxHash?: string;
  contractTxHash?: string;
}

export interface DownloadResult {
  data: Uint8Array;
  size: number;
}

export interface PaymentResult {
  fileId: number;
  pieceCid: string;
  amount: string;
  paymentTxHash: string;
  status: "paid";
  confirmationQueued: boolean;
}

interface PendingConfirmation {
  fileId: number;
  pieceCid: string;
  attempts: number;
}

interface SynapseLike {
  storage: {
    preflightUpload: (size: number) => Promise<any>;
    upload: (data: Uint8Array, options?: any) => Promise<any>;
    download: (pieceCid: string, options?: any) => Promise<Uint8Array>;
  };
  payments: {
    accountInfo: () => Promise<any>;
    balance: () => Promise<bigint>;
    deposit: (amount: bigint) => Promise<{ wait: () => Promise<any> }>;
    approveService: (
      serviceAddress: string,
      rateAllowance: bigint,
      lockupAllowance: bigint,
      ttl: bigint,
    ) => Promise<{ wait: () => Promise<any> }>;
  };
  getWarmStorageAddress: () => string;
}

interface ContractServiceLike {
  getStoragePrice: (fileSize: number) => Promise<bigint>;
  registerFile: (
    pieceCid: string,
    fileSize: number,
    metadataHash?: string,
  ) => Promise<{ fileId: number; storagePrice: bigint; txHash: string }>;
  getFile: (fileId: number) => Promise<any>;
  getFileIdByCid: (pieceCid: string) => Promise<number>;
  depositPayment: (fileId: number, amount: bigint) => Promise<string>;
  getFilePaymentStatus: (fileId: number) => Promise<{
    hasPayment: boolean;
    amount: bigint;
    isReleased: boolean;
  }>;
  confirmStorage: (fileId: number) => Promise<string>;
  releasePayment: (fileId: number) => Promise<string>;
}

interface StorageServiceOptions {
  contractService?: ContractServiceLike;
  synapseProvider?: () => SynapseLike;
  confirmationIntervalMs?: number;
  maxConfirmationAttempts?: number;
  startConfirmationProcessor?: boolean;
}

export class StorageService {
  private contractService: ContractServiceLike;
  private synapseProvider: () => SynapseLike;
  private pendingConfirmations = new Map<number, PendingConfirmation>();
  private activeConfirmations = new Set<number>();
  private maxConfirmationAttempts: number;

  constructor(options: StorageServiceOptions = {}) {
    this.contractService = options.contractService ?? getContractService();
    this.synapseProvider =
      options.synapseProvider ?? (getSynapse as unknown as () => SynapseLike);
    this.maxConfirmationAttempts = options.maxConfirmationAttempts ?? 20;

    if (options.startConfirmationProcessor !== false) {
      const intervalMs = options.confirmationIntervalMs ?? 15000;
      setInterval(() => {
        this.processPendingConfirmations().catch((error) => {
          console.error("Pending confirmation processing failed:", error);
        });
      }, intervalMs);
    }
  }

  async uploadFile(
    fileBuffer: Buffer,
    filename: string,
    metadata?: Record<string, any>,
  ): Promise<UploadResult> {
    const synapse = this.synapseProvider();

    try {
      console.log(`Uploading ${filename} (${fileBuffer.length} bytes)...`);

      const uint8ArrayBytes = new Uint8Array(fileBuffer);
      console.log(
        `Uploading ${filename} (${uint8ArrayBytes.length} bytes) via Synapse SDK...`,
      );

      const preflight = await synapse.storage.preflightUpload(
        uint8ArrayBytes.length,
      );
      if (!preflight.allowanceCheck.sufficient) {
        throw new Error(
          preflight.allowanceCheck.message ||
            "Insufficient allowance for upload",
        );
      }

      const selectedProvider = preflight.selectedProvider;
      const selectedDataSetId = preflight.selectedDataSetId;
      if (!selectedProvider || selectedDataSetId == null) {
        console.warn(
          "Preflight did not return selected provider/data set. Falling back to Synapse auto-selection.",
          {
            selectedProvider: selectedProvider
              ? {
                  id: selectedProvider.id,
                  name: selectedProvider.name,
                  serviceProvider: selectedProvider.serviceProvider,
                }
              : null,
            selectedDataSetId,
          },
        );
      }

      let uploadTxHash: string | undefined;
      const uploadMetadata = Object.fromEntries(
        Object.entries({
          filename,
          ...(metadata ?? {}),
        }).map(([key, value]) => [key, String(value)]),
      );

      const uploadOptions: Record<string, any> = {
        metadata: {
          ...uploadMetadata,
        },
        callbacks: {
          onPieceAdded: (transaction: string | undefined) => {
            if (transaction) {
              uploadTxHash = transaction;
            }
          },
        },
      };

      if (selectedProvider?.serviceProvider) {
        uploadOptions.providerAddress = selectedProvider.serviceProvider;
      }
      if (selectedDataSetId != null) {
        uploadOptions.dataSetId = selectedDataSetId;
      }

      const uploadResult = await synapse.storage.upload(
        uint8ArrayBytes,
        uploadOptions,
      );

      const pieceCid = uploadResult.pieceCid.toString();
      console.log(`Synapse upload completed with piece CID: ${pieceCid}`);

      const storagePrice = await this.contractService.getStoragePrice(
        uint8ArrayBytes.length,
      );
      console.log(`Storage price: ${storagePrice} USDFC`);

      const metadataHash = metadata
        ? ethers.keccak256(ethers.toUtf8Bytes(JSON.stringify(metadata)))
        : ethers.ZeroHash;

      const { fileId, txHash: contractTxHash } =
        await this.contractService.registerFile(
          pieceCid,
          uint8ArrayBytes.length,
          metadataHash,
        );

      console.log(`File registered in contract - ID: ${fileId}`);

      return {
        fileId,
        pieceCid,
        size: uint8ArrayBytes.length,
        filename,
        storagePrice: storagePrice.toString(),
        uploadedAt: new Date(),
        selectedProvider: {
          id: selectedProvider?.id ?? -1,
          address: selectedProvider?.serviceProvider ?? "auto-selected",
          name: selectedProvider?.name ?? "auto-selected",
        },
        dataSetId: selectedDataSetId ?? undefined,
        uploadTxHash,
        contractTxHash,
      };
    } catch (error) {
      console.error("Upload failed:", error);
      throw error;
    }
  }

  async downloadFile(pieceCid: string): Promise<DownloadResult> {
    const synapse = this.synapseProvider();

    try {
      console.log(`Downloading ${pieceCid}...`);
      const data = await synapse.storage.download(pieceCid);
      console.log(`Downloaded ${data.length} bytes`);

      return {
        data,
        size: data.length,
      };
    } catch (error) {
      console.error("Download failed:", error);
      throw error;
    }
  }

  async payForFile(fileIdOrCid: number | string): Promise<PaymentResult> {
    const fileId =
      typeof fileIdOrCid === "number"
        ? fileIdOrCid
        : await this.contractService.getFileIdByCid(fileIdOrCid);

    if (!fileId) {
      throw new Error("File not found for payment");
    }

    const file = await this.contractService.getFile(fileId);
    const paymentTxHash = await this.contractService.depositPayment(
      fileId,
      file.storagePrice,
    );

    this.pendingConfirmations.set(fileId, {
      fileId,
      pieceCid: file.pieceCid,
      attempts: 0,
    });
    await this.processPendingConfirmations();

    return {
      fileId,
      pieceCid: file.pieceCid,
      amount: file.storagePrice.toString(),
      paymentTxHash,
      status: "paid",
      confirmationQueued: true,
    };
  }

  async ensureFileStored(pieceCid: string): Promise<void> {
    const fileId = await this.contractService.getFileIdByCid(pieceCid);
    if (!fileId) {
      throw new Error("File not found");
    }

    const file = await this.contractService.getFile(fileId);
    if (file.status < 2) {
      throw new Error("File is not stored yet");
    }
  }

  async getFileStatus(fileIdOrCid: number | string) {
    const fileId =
      typeof fileIdOrCid === "number"
        ? fileIdOrCid
        : await this.contractService.getFileIdByCid(fileIdOrCid);

    if (!fileId) {
      throw new Error("File not found");
    }

    const file = await this.contractService.getFile(fileId);
    const payment = await this.contractService.getFilePaymentStatus(fileId);

    return {
      fileId,
      pieceCid: file.pieceCid,
      status: file.status,
      timestamps: {
        uploadTime: file.uploadTime,
        paidTime: file.paidTime,
        storedTime: file.storedTime,
      },
      payment: {
        hasPayment: payment.hasPayment,
        amount: payment.amount.toString(),
        isReleased: payment.isReleased,
      },
      queuedForConfirmation: this.pendingConfirmations.has(fileId),
    };
  }

  private async processPendingConfirmations(): Promise<void> {
    for (const [fileId, pending] of this.pendingConfirmations) {
      if (this.activeConfirmations.has(fileId)) {
        continue;
      }

      this.activeConfirmations.add(fileId);
      try {
        await this.processSingleConfirmation(pending);
      } finally {
        this.activeConfirmations.delete(fileId);
      }
    }
  }

  private async processSingleConfirmation(
    pending: PendingConfirmation,
  ): Promise<void> {
    const available = await this.isPieceRetrievable(pending.pieceCid);

    if (!available) {
      pending.attempts += 1;
      this.pendingConfirmations.set(pending.fileId, pending);
      if (pending.attempts >= this.maxConfirmationAttempts) {
        console.warn(
          `Storage confirmation timed out for file ${pending.fileId} (${pending.pieceCid})`,
        );
        this.pendingConfirmations.delete(pending.fileId);
      }
      return;
    }

    await this.contractService.confirmStorage(pending.fileId);
    console.log(
      JSON.stringify({
        event: "FileStored",
        fileId: pending.fileId,
        pieceCid: pending.pieceCid,
        timestamp: new Date().toISOString(),
      }),
    );

    await this.contractService.releasePayment(pending.fileId);
    console.log(
      JSON.stringify({
        event: "PaymentReleased",
        fileId: pending.fileId,
        pieceCid: pending.pieceCid,
        timestamp: new Date().toISOString(),
      }),
    );

    this.pendingConfirmations.delete(pending.fileId);
  }

  private async isPieceRetrievable(pieceCid: string): Promise<boolean> {
    const synapse = this.synapseProvider();

    try {
      await synapse.storage.download(pieceCid, { withCDN: true });
      return true;
    } catch {
      return false;
    }
  }

  async preflightCheck(fileSize: number) {
    const synapse = this.synapseProvider();

    try {
      const preflight = await synapse.storage.preflightUpload(fileSize);

      const estimatedCost = preflight.estimatedCost ?? {
        perEpoch: 0n,
        perDay: 0n,
        perMonth: 0n,
      };

      return {
        canUpload: preflight.allowanceCheck.sufficient,
        estimatedCost: ethers.formatUnits(estimatedCost.perEpoch ?? 0n, 18),
        estimatedCostBreakdown: {
          perEpoch: ethers.formatUnits(estimatedCost.perEpoch ?? 0n, 18),
          perDay: ethers.formatUnits(estimatedCost.perDay ?? 0n, 18),
          perMonth: ethers.formatUnits(estimatedCost.perMonth ?? 0n, 18),
        },
        allowance: {
          sufficient: preflight.allowanceCheck.sufficient,
          message: preflight.allowanceCheck.message ?? null,
        },
        selectedProvider: preflight.selectedProvider,
        dataSetId: preflight.selectedDataSetId,
      };
    } catch (error) {
      console.error("Preflight check failed:", error);
      throw error;
    }
  }

  async getAccountInfo() {
    const synapse = this.synapseProvider();

    try {
      const accountInfo = await synapse.payments.accountInfo();

      const funds = accountInfo.funds ?? 0n;
      const lockupCurrent = accountInfo.lockupCurrent ?? 0n;
      const lockupRate = accountInfo.lockupRate ?? 0n;
      const availableFunds = accountInfo.availableFunds ?? 0n;

      return {
        totalFunds: ethers.formatUnits(funds, 18),
        lockupCurrent: ethers.formatUnits(lockupCurrent, 18),
        lockupRate: ethers.formatUnits(lockupRate, 18),
        availableFunds: ethers.formatUnits(availableFunds, 18),
      };
    } catch (error) {
      console.error("Failed to get account info:", error);
      throw error;
    }
  }

  async setupAccount(depositAmount?: string) {
    const synapse = this.synapseProvider();

    try {
      const depositAmountWei = depositAmount
        ? ethers.parseUnits(depositAmount, 18)
        : ethers.parseUnits("100", 18);

      const balance = await synapse.payments.balance();

      console.log(`Current balance: ${ethers.formatUnits(balance, 18)} USDFC`);
      console.log(
        `Deposit amount: ${ethers.formatUnits(depositAmountWei, 18)} USDFC`,
      );

      if (balance < depositAmountWei) {
        console.log("Depositing USDFC...");
        const depositTx = await synapse.payments.deposit(depositAmountWei);
        await depositTx.wait();
        console.log("Deposit complete");
      } else {
        console.log("Sufficient balance, skipping deposit");
      }

      const warmStorageAddress = await synapse.getWarmStorageAddress();

      console.log("Approving Warm Storage service...");
      const approvalTx = await synapse.payments.approveService(
        warmStorageAddress,
        ethers.parseUnits("10", 18),
        ethers.parseUnits("1000", 18),
        BigInt(86400 * 30),
      );
      await approvalTx.wait();
      console.log("Service approved");

      return {
        success: true,
        depositAmount: ethers.formatUnits(depositAmountWei, 18),
        warmStorageAddress,
      };
    } catch (error) {
      console.error("Setup failed:", error);
      throw error;
    }
  }

  async getStoragePrice() {
    const synapse = getSynapse();

    try {
      console.log("Fetching dynamic storage price from filecoin network...");

      const ONE_GIB = 1024 * 1024 * 1024;
      const preflight = await synapse.storage.preflightUpload(ONE_GIB);

      const estimatedCost = preflight.estimatedCost as any;
      const costPerMonthWei = BigInt(estimatedCost?.perMonth ?? estimatedCost ?? 0n);

      if (costPerMonthWei === 0n) {
        throw new Error("Failed to retrieve valid pricing from Synapse SDK");
      }

      const pricePerByteWei = costPerMonthWei / BigInt(ONE_GIB);
      console.log(`New Dynamic Price: ${pricePerByteWei.toString()} wei per byte`);

      const provider = new ethers.JsonRpcProvider(config.filecoin.rpcUrl);
      const wallet = new ethers.Wallet(config.filecoin.privateKey, provider);

      const FILE_REGISTRY_ABI = [
        "function updateStoragePrice(uint256 newPricePerByte) external",
        "function pricePerByte() external view returns (uint256)"
      ];

      const registryAddress = config.filecoin.fileRegistryAddress;
      const registry = new ethers.Contract(registryAddress, FILE_REGISTRY_ABI, wallet);

      console.log(`Updating FileRegistry contract at ${registryAddress}...`);
      const tx = await registry.updateStoragePrice(pricePerByteWei);

      if (!config.filecoin.paymentEscrowAddress) {
      throw new Error("PAYMENT_ESCROW_ADDRESS is required");
     }
      
      console.log(`Transaction submitted! Waiting for confirmation... Hash: ${tx.hash}`);
      await tx.wait(); 
      
      console.log("Contract successfully updated!");

      return {
        success: true,
        newPricePerByteWei: pricePerByteWei.toString(),
        newPricePerByteUSDFC: ethers.formatUnits(pricePerByteWei, 18),
        txHash: tx.hash
      };
    } catch (error) {
      console.error("Price sync failed:", error);
      throw error;
    }
  }
}
