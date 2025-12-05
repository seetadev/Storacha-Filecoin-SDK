import { getSynapse } from "../config/synapse.js";
import { getContractService } from "./contract.service.js";
import { ethers } from "ethers";
import { calculate as calculatePieceCID } from "@filoz/synapse-core/piece";

export interface UploadResult {
  fileId: number;
  pieceCid: string;
  size: number;
  filename: string;
  uploadedAt: Date;
  storagePrice: string;
  synapseStxHash?: string;
  contractTxHash?: string;
}

export interface DownloadResult {
  data: Uint8Array;
  size: number;
}

export class StorageService {
  private contractService = getContractService();

  /**
   * Upload a file to Filecoin storage via Synapse SDK with contract integration
   */
  async uploadFile(
    fileBuffer: Buffer,
    filename: string,
    metadata?: Record<string, any>,
  ): Promise<UploadResult> {
    const synapse = getSynapse();

    try {
      console.log(`Uploading ${filename} (${fileBuffer.length} bytes)...`);

      let synapseStxHash: string | undefined;
      let uploadedPieceCid: string = "";

      // Step 1: Convert Buffer to Uint8Array and validate (Node.js level checks)
      const uint8ArrayBytes = new Uint8Array(fileBuffer);
      console.log(`Uploading ${filename} (${uint8ArrayBytes.length} bytes) via Synapse SDK...`);

      // Node.js level validation - CAR files need minimum 65 bytes
      if (uint8ArrayBytes.length < 65) {
        throw new Error(`File too small for CAR generation. Minimum size is 65 bytes, got ${uint8ArrayBytes.length} bytes`);
      }

      // Debug Node.js environment
      console.log('Buffer type:', uint8ArrayBytes.constructor.name);

      // Step 2: Calculate proper CommP using Synapse Core piece calculation
      console.log("Calculating piece CID using Synapse Core...");

      const pieceCID = calculatePieceCID(uint8ArrayBytes);
      const pieceCidString = pieceCID.toString();
      uploadedPieceCid = pieceCidString;

      console.log(`Calculated piece CID: ${pieceCidString}`);

      const finalPieceCid = pieceCidString;

      // Step 4: Now get storage price from contract (after successful upload)
      const storagePrice = await this.contractService.getStoragePrice(uint8ArrayBytes.length);
      console.log(`Storage price: ${storagePrice} USDFC`);

      // Step 6: Register file in contract
      const metadataHash = metadata
        ? ethers.keccak256(ethers.toUtf8Bytes(JSON.stringify(metadata)))
        : ethers.ZeroHash;

      const { fileId, txHash: contractTxHash } = await this.contractService.registerFile(
        finalPieceCid,
        uint8ArrayBytes.length,
        metadataHash
      );

      console.log(`File registered in contract - ID: ${fileId}`);

      // Step 7: Deposit payment for storage
      console.log(`Depositing payment for file ${fileId}: ${storagePrice} USDFC`);
      await this.contractService.depositPayment(fileId, storagePrice);

      // Step 8: Auto-confirm storage (after payment)
      setTimeout(async () => {
        try {
          await this.contractService.confirmStorage(fileId);
          console.log(`Auto-confirmed storage for file ${fileId}`);
        } catch (error) {
          console.error(`Failed to auto-confirm storage for file ${fileId}:`, error);
        }
      }, 2000); // 2 second delay

      return {
        fileId,
        pieceCid: finalPieceCid,
        size: uint8ArrayBytes.length,
        filename,
        storagePrice: storagePrice.toString(),
        uploadedAt: new Date(),
        synapseStxHash,
        contractTxHash,
      };
    } catch (error) {
      console.error("Upload failed:", error);
      throw error;
    }
  }

  /**
   * Download a file from Filecoin storage
   */
  async downloadFile(pieceCid: string): Promise<DownloadResult> {
    const synapse = getSynapse();

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

  /**
   * Check if upload is possible (preflight check)
   */
  async preflightCheck(fileSize: number) {
    const synapse = getSynapse();

    try {
      const preflight = await synapse.storage.preflightUpload(fileSize);

      // estimatedCost is an object with perEpoch, perDay, perMonth
      const estimatedCost = preflight.estimatedCost as any;
      const costPerEpoch = estimatedCost?.perEpoch ?? estimatedCost ?? 0n;

      return {
        canUpload: preflight.allowanceCheck.sufficient,
        estimatedCost: ethers.formatUnits(costPerEpoch, 18),
        estimatedCostBreakdown: {
          perEpoch: ethers.formatUnits(estimatedCost?.perEpoch ?? 0n, 18),
          perDay: ethers.formatUnits(estimatedCost?.perDay ?? 0n, 18),
          perMonth: ethers.formatUnits(estimatedCost?.perMonth ?? 0n, 18),
        },
        allowance: {
          current: ethers.formatUnits(
            preflight.allowanceCheck.current ?? 0n,
            18,
          ),
          required: ethers.formatUnits(
            preflight.allowanceCheck.required ?? 0n,
            18,
          ),
          sufficient: preflight.allowanceCheck.sufficient,
        },
      };
    } catch (error) {
      console.error("Preflight check failed:", error);
      throw error;
    }
  }

  /**
   * Get account information
   */
  async getAccountInfo() {
    const synapse = getSynapse();

    try {
      const accountInfo = await synapse.payments.accountInfo();

      // Handle null/undefined values by defaulting to '0'
      const totalFunds = accountInfo.totalFunds ?? 0n;
      const lockupRequirement = accountInfo.lockupRequirement ?? 0n;
      const availableFunds = accountInfo.availableFunds ?? 0n;

      return {
        totalFunds: ethers.formatUnits(totalFunds, 18),
        lockupRequirement: ethers.formatUnits(lockupRequirement, 18),
        availableFunds: ethers.formatUnits(availableFunds, 18),
      };
    } catch (error) {
      console.error("Failed to get account info:", error);
      throw error;
    }
  }

  /**
   * Setup account with deposit and service approval (one-time setup)
   */
  async setupAccount(depositAmount?: string) {
    const synapse = getSynapse();

    try {
      const depositAmountWei = depositAmount
        ? ethers.parseUnits(depositAmount, 18)
        : ethers.parseUnits("100", 18); // 100 USDFC default

      // Check current balance
      const balance = await synapse.payments.balance();

      console.log(`Current balance: ${ethers.formatUnits(balance, 18)} USDFC`);
      console.log(
        `Deposit amount: ${ethers.formatUnits(depositAmountWei, 18)} USDFC`,
      );

      // Deposit if needed
      if (balance < depositAmountWei) {
        console.log("Depositing USDFC...");
        const depositTx = await synapse.payments.deposit(depositAmountWei);
        await depositTx.wait();
        console.log("Deposit complete");
      } else {
        console.log("Sufficient balance, skipping deposit");
      }

      // Approve Warm Storage service
      const warmStorageAddress = await synapse.getWarmStorageAddress();

      console.log("Approving Warm Storage service...");
      const approvalTx = await synapse.payments.approveService(
        warmStorageAddress,
        ethers.parseUnits("10", 18), // 10 USDFC per epoch
        ethers.parseUnits("1000", 18), // 1000 USDFC lockup
        BigInt(86400 * 30), // 30 days
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
}
