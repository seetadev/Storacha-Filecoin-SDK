import { getSynapse } from "../config/synapse.js";
import { ethers } from "ethers";

export interface UploadResult {
  pieceCid: string;
  size: number;
  filename: string;
  uploadedAt: Date;
  txHash?: string;
}

export interface DownloadResult {
  data: Uint8Array;
  size: number;
}

export class StorageService {
  /**
   * Upload a file to Filecoin storage via Synapse SDK
   */
  async uploadFile(
    fileBuffer: Buffer,
    filename: string,
    metadata?: Record<string, any>,
  ): Promise<UploadResult> {
    const synapse = getSynapse();

    try {
      console.log(`Uploading ${filename} (${fileBuffer.length} bytes)...`);

      let txHash: string | undefined;
      let uploadedPieceCid: string = "";

      // Upload with callbacks to capture transaction details
      const uploadResult = await synapse.storage.upload(fileBuffer, {
        metadata: {
          filename,
          uploadedAt: new Date().toISOString(),
          ...metadata,
        },
        callbacks: {
          onUploadComplete: (pieceCid: any) => {
            uploadedPieceCid = pieceCid.toString();
            console.log(`Upload complete: ${uploadedPieceCid}`);
          },
          onPieceAdded: (tx: any) => {
            txHash = tx.hash;
            console.log(`Transaction: ${txHash}`);
          },
        },
      });

      return {
        pieceCid: uploadResult.pieceCid.toString(),
        size: uploadResult.size,
        filename,
        uploadedAt: new Date(),
        txHash,
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
  /**
   * Sync the network storage price from Synapse SDK to the FileRegistry smart contract
   */
  async syncStoragePrice() {
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

  /**
   * Subscribe to a prepaid storage plan
   * @param planSizeGB The size of the storage plan in Gigabytes
   */
  async subscribeStorage(planSizeGB: number) {
    console.log(`=== Initiating Storage Subscription: ${planSizeGB} GB ===`);
    
    const provider = new ethers.JsonRpcProvider(config.filecoin.rpcUrl);
    const wallet = new ethers.Wallet(config.filecoin.privateKey, provider);
    
    // 1. Calculate USDFC cost dynamically from the Registry
    const REGISTRY_ABI = ["function pricePerByte() view returns (uint256)"];
    const registry = new ethers.Contract(config.filecoin.fileRegistryAddress as string, REGISTRY_ABI, provider);
    
    const pricePerByte = await registry.pricePerByte();
    const bytesInGB = BigInt(1073741824); // 1024^3
    const totalBytes = BigInt(planSizeGB) * bytesInGB;
    const subscriptionCost = totalBytes * pricePerByte;
    
    console.log(`Plan Cost: ${subscriptionCost.toString()} wei of USDFC`);

    const usdfcAddress = "0xb3042734b608a1B16e9e86B374A3f3e389B4cDf0"; 
    const escrowAddress = config.filecoin.paymentEscrowAddress as string;

    // 2. Ensure Escrow is approved to pull the subscription funds
    const ERC20_ABI = [
      "function approve(address, uint256) public returns (bool)",
      "function allowance(address, address) public view returns (uint256)"
    ];
    const usdfcContract = new ethers.Contract(usdfcAddress, ERC20_ABI, wallet);
    
    const currentAllowance = await usdfcContract.allowance(wallet.address, escrowAddress);
    if (currentAllowance < subscriptionCost) {
      console.log(`Approving USDFC for subscription...`);
      const approveTx = await usdfcContract.approve(escrowAddress, ethers.MaxUint256);
      await approveTx.wait();
      // Brief buffer for Filecoin testnet sync
      await new Promise(resolve => setTimeout(resolve, 5000));
    }

    // 3. Fund the Subscription on the Escrow Contract
    const ESCROW_ABI = ["function fundSubscription(uint256) external"];
    const escrowContract = new ethers.Contract(escrowAddress, ESCROW_ABI, wallet);
    
    console.log(`Funding subscription on-chain...`);
    const fundTx = await escrowContract.fundSubscription(subscriptionCost);
    await fundTx.wait();

    console.log(`✅ Subscription funded successfully! Hash: ${fundTx.hash}`);

    return {
      planSizeGB,
      costWei: subscriptionCost.toString(),
      txHash: fundTx.hash,
      status: "active"
    };
  }
}

/**
   * Upload multiple files as a single verifiable AI Dataset
   * @param files Array of uploaded Express.Multer files
   */
  async uploadDataset(files: Express.Multer.File[]) {
    console.log(`=== Initiating AI Dataset Upload: ${files.length} files ===`);

    if (!files || files.length === 0) {
      throw new Error("No files provided for dataset");
    }

    const uploadedFilesData = [];
    let totalSize = 0;

    // Upload each individual file to the decentralized network
    console.log("Uploading individual files to Storacha...");
    for (const file of files) {
      // NOTE: Replace this line with your actual Storacha/Synapse upload call
      const pieceCid = await this.uploadToStoracha(file.path); 
      
      totalSize += file.size;
      uploadedFilesData.push({
        filename: file.originalname,
        mimetype: file.mimetype,
        size: file.size,
        pieceCid: pieceCid
      });
    }

    // Generate the Deterministic JSON Manifest
    console.log("Generating Dataset Manifest...");
    const manifest = {
      name: `AI_Dataset_${Date.now()}`,
      version: "1.0",
      createdAt: new Date().toISOString(),
      fileCount: files.length,
      totalSizeBytes: totalSize,
      files: uploadedFilesData
    };

    // 3. Upload the Manifest itself to the network to get the Master CID
    const manifestBuffer = Buffer.from(JSON.stringify(manifest, null, 2));
    // NOTE: Replace with your actual buffer upload logic
    const manifestCid = await this.uploadToStorachaBuffer(manifestBuffer); 
    console.log(`Master Manifest CID: ${manifestCid}`);

    // 4. Register the Dataset on the Smart Contract
    console.log("Registering Dataset Provenance on-chain");
    const provider = new ethers.JsonRpcProvider(config.filecoin.rpcUrl);
    const wallet = new ethers.Wallet(config.filecoin.privateKey, provider);
    
    const REGISTRY_ABI = [
      "function registerDataset(string calldata, uint256, uint256) external returns (uint256)",
      "event DatasetRegistered(uint256 indexed datasetId, string indexed manifestCid, address indexed uploader, uint256 fileCount, uint256 totalSize, uint256 storagePrice)"
    ];
    
    const registry = new ethers.Contract(config.filecoin.fileRegistryAddress as string, REGISTRY_ABI, wallet);
    
    const tx = await registry.registerDataset(manifestCid, files.length, totalSize);
    const receipt = await tx.wait();

    // Extract the new Dataset ID and dynamically calculated price from the event logs
    const event = receipt.logs
        .map((log: any) => registry.interface.parseLog(log))
        .find((parsedLog: any) => parsedLog?.name === 'DatasetRegistered');

    const datasetId = event?.args[0].toString();
    const storagePrice = event?.args[5].toString();

    console.log(`✅ Dataset ${datasetId} registered successfully! Price: ${storagePrice} wei`);

    return {
      datasetId,
      manifestCid,
      fileCount: files.length,
      totalSize,
      storagePrice,
      txHash: tx.hash,
      manifest // Return the manifest structure so the frontend can display it
    };
  }