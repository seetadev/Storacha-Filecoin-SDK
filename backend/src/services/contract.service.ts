import { ethers } from "ethers";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const FileRegistryABI = JSON.parse(
  readFileSync(join(__dirname, "../contracts/FileRegistry.json"), "utf8")
).abi;

const PaymentEscrowABI = JSON.parse(
  readFileSync(join(__dirname, "../contracts/PaymentEscrow.json"), "utf8")
).abi;

const deployments = JSON.parse(
  readFileSync(join(__dirname, "../contracts/deployments.json"), "utf8")
);

export enum FileStatus {
  Uploaded = 0,
  Paid = 1,
  Stored = 2,
  Retrieved = 3,
}

export interface FileRecord {
  pieceCid: string;
  uploader: string;
  fileSize: number;
  storagePrice: bigint;
  uploadTime: number;
  paidTime: number;
  storedTime: number;
  status: FileStatus;
  metadataHash: string;
  exists: boolean;
}

export interface EscrowRecord {
  fileId: number;
  payer: string;
  provider: string;
  amount: bigint;
  lockTime: number;
  released: boolean;
  refunded: boolean;
}

export class ContractService {
  private provider: ethers.Provider;
  private signer: ethers.Wallet;
  private fileRegistry: ethers.Contract;
  private paymentEscrow: ethers.Contract;
  private usdfcToken: ethers.Contract;
  private network: string;

  constructor() {
    const rpcUrl = process.env.FILECOIN_RPC_URL || "http://localhost:8545";
    this.provider = new ethers.JsonRpcProvider(rpcUrl);

    const privateKey = process.env.FILECOIN_PRIVATE_KEY;
    if (!privateKey) {
      throw new Error("FILECOIN_PRIVATE_KEY not set in environment");
    }
    this.signer = new ethers.Wallet(privateKey, this.provider);

    this.network = process.env.FILECOIN_NETWORK || "hardhat";

    const networkDeployment = deployments[this.network];
    if (!networkDeployment) {
      throw new Error(`No deployment found for network: ${this.network}`);
    }

    console.log(`Connecting to contracts on ${this.network}:`);
    console.log(`FileRegistry: ${networkDeployment.contracts.FileRegistry.address}`);
    console.log(`PaymentEscrow: ${networkDeployment.contracts.PaymentEscrow.address}`);

    this.fileRegistry = new ethers.Contract(
      networkDeployment.contracts.FileRegistry.address,
      FileRegistryABI,
      this.signer
    );

    this.paymentEscrow = new ethers.Contract(
      networkDeployment.contracts.PaymentEscrow.address,
      PaymentEscrowABI,
      this.signer
    );

    const ERC20_ABI = [
      "function transfer(address to, uint256 amount) returns (bool)",
      "function approve(address spender, uint256 amount) returns (bool)",
      "function transferFrom(address from, address to, uint256 amount) returns (bool)",
      "function balanceOf(address account) view returns (uint256)",
      "function allowance(address owner, address spender) view returns (uint256)",
      "function totalSupply() view returns (uint256)",
      "function name() view returns (string)",
      "function symbol() view returns (string)",
      "function decimals() view returns (uint8)"
    ];

    this.usdfcToken = new ethers.Contract(
      networkDeployment.dependencies.USDFC,
      ERC20_ABI,
      this.signer
    );
  }

  async registerFile(
    pieceCid: string,
    fileSize: number,
    metadataHash?: string
  ): Promise<{ fileId: number; storagePrice: bigint; txHash: string }> {
    try {
      const metadata = metadataHash || ethers.ZeroHash;

      console.log(`Registering file: ${pieceCid}, size: ${fileSize} bytes`);

      const tx = await this.fileRegistry.registerFile(pieceCid, fileSize, metadata);
      const receipt = await tx.wait();

      const event = receipt.logs.find((log: any) => {
        try {
          const parsed = this.fileRegistry.interface.parseLog(log);
          return parsed?.name === "FileUploaded";
        } catch {
          return false;
        }
      });

      if (!event) {
        throw new Error("FileUploaded event not found in transaction receipt");
      }

      const parsedEvent = this.fileRegistry.interface.parseLog(event);
      if (!parsedEvent) {
        throw new Error("Failed to parse FileUploaded event");
      }
      const fileId = Number(parsedEvent.args[0]);
      const storagePrice = parsedEvent.args[4];

      console.log(`File registered - ID: ${fileId}, Price: ${storagePrice} USDFC`);

      return {
        fileId,
        storagePrice,
        txHash: tx.hash,
      };
    } catch (error) {
      console.error("Failed to register file:", error);
      throw error;
    }
  }

  async getFile(fileId: number): Promise<FileRecord> {
    try {
      const file = await this.fileRegistry.getFile(fileId);
      return {
        pieceCid: file.pieceCid,
        uploader: file.uploader,
        fileSize: Number(file.fileSize),
        storagePrice: file.storagePrice,
        uploadTime: Number(file.uploadTime),
        paidTime: Number(file.paidTime),
        storedTime: Number(file.storedTime),
        status: Number(file.status) as FileStatus,
        metadataHash: file.metadataHash,
        exists: file.exists,
      };
    } catch (error) {
      console.error(`Failed to get file ${fileId}:`, error);
      throw error;
    }
  }

  async getFileIdByCid(pieceCid: string): Promise<number> {
    try {
      const fileId = await this.fileRegistry.getFileIdByCid(pieceCid);
      return Number(fileId);
    } catch (error) {
      console.error(`Failed to get file ID for CID ${pieceCid}:`, error);
      throw error;
    }
  }

  async confirmStorage(fileId: number): Promise<string> {
    try {
      console.log(`Confirming storage for file ${fileId}...`);

      const tx = await this.fileRegistry.confirmStorage(fileId);
      await tx.wait();

      console.log(`Storage confirmed for file ${fileId}`);
      return tx.hash;
    } catch (error) {
      console.error(`Failed to confirm storage for file ${fileId}:`, error);
      throw error;
    }
  }

  async getStoragePrice(fileSize: number): Promise<bigint> {
    try {
      return await this.fileRegistry.calculateStoragePrice(fileSize);
    } catch (error) {
      console.error(`Failed to calculate storage price:`, error);
      throw error;
    }
  }

  async getUserFiles(userAddress: string): Promise<number[]> {
    try {
      const fileIds = await this.fileRegistry.getUserFiles(userAddress);
      return fileIds.map((id: bigint) => Number(id));
    } catch (error) {
      console.error(`Failed to get user files:`, error);
      throw error;
    }
  }

  async ensureUsdfcAllowance(amount: bigint): Promise<string | null> {
    try {
      const escrowAddress = this.paymentEscrow.getAddress();
      const currentAllowance = await this.usdfcToken.allowance(this.signer.address, escrowAddress);

      console.log(`Current USDFC allowance: ${ethers.formatUnits(currentAllowance, 18)} USDFC`);
      console.log(`Required amount: ${ethers.formatUnits(amount, 18)} USDFC`);

      if (currentAllowance < amount) {
        console.log("Insufficient allowance, approving USDFC tokens...");

        const approvalAmount = amount * 10n;
        const tx = await this.usdfcToken.approve(escrowAddress, approvalAmount);
        await tx.wait();

        console.log(`USDFC tokens approved: ${ethers.formatUnits(approvalAmount, 18)} USDFC`);
        return tx.hash;
      }

      console.log("Sufficient USDFC allowance already exists");
      return null;
    } catch (error) {
      console.error("Failed to check/approve USDFC allowance:", error);
      throw error;
    }
  }

  async getUsdfcBalance(): Promise<bigint> {
    try {
      return await this.usdfcToken.balanceOf(this.signer.address);
    } catch (error) {
      console.error("Failed to get USDFC balance:", error);
      throw error;
    }
  }

  async depositPayment(fileId: number, amount: bigint): Promise<string> {
    try {
      console.log(`Depositing payment for file ${fileId}: ${amount} USDFC`);

      const balance = await this.getUsdfcBalance();
      console.log(`Current USDFC balance: ${ethers.formatUnits(balance, 18)} USDFC`);

      if (balance < amount) {
        throw new Error(`Insufficient USDFC balance: ${ethers.formatUnits(balance, 18)} USDFC available, ${ethers.formatUnits(amount, 18)} USDFC required`);
      }

      const file = await this.getFile(fileId);
      console.log(`File storage price from contract: ${file.storagePrice} USDFC`);
      console.log(`Payment amount we're trying to send: ${amount} USDFC`);
      console.log(`Amounts match: ${file.storagePrice === amount}`);
      console.log(`File status: ${file.status} (0=Uploaded, 1=Paid, 2=Stored, 3=Retrieved)`);

      if (file.storagePrice !== amount) {
        throw new Error(`Payment amount mismatch: contract expects ${file.storagePrice} USDFC, but trying to pay ${amount} USDFC`);
      }

      if (file.status !== FileStatus.Uploaded) {
        throw new Error(`File ${fileId} is not in Uploaded status (current status: ${file.status}), cannot accept payment`);
      }

      const paymentStatus = await this.getFilePaymentStatus(fileId);
      console.log(`Payment status from escrow: hasPayment=${paymentStatus.hasPayment}, amount=${paymentStatus.amount}`);
      if (paymentStatus.hasPayment) {
        throw new Error(`File ${fileId} already has payment in escrow`);
      }

      const isPaused = await this.paymentEscrow.paused();
      console.log(`PaymentEscrow contract paused: ${isPaused}`);
      if (isPaused) {
        throw new Error("PaymentEscrow contract is currently paused");
      }

      await this.ensureUsdfcAllowance(amount);

      console.log("Calling PaymentEscrow.depositForFile...");
      const tx = await this.paymentEscrow.depositForFile(fileId, amount);
      console.log("Transaction submitted, waiting for confirmation...");
      await tx.wait();

      console.log(`Payment deposited for file ${fileId}`);
      return tx.hash;
    } catch (error) {
      console.error(`Failed to deposit payment for file ${fileId}:`, error);
      throw error;
    }
  }

  async getFilePaymentStatus(fileId: number): Promise<{
    hasPayment: boolean;
    amount: bigint;
    isReleased: boolean;
  }> {
    try {
      const [hasPayment, amount, isReleased] = await this.paymentEscrow.getFilePaymentStatus(fileId);
      return { hasPayment, amount, isReleased };
    } catch (error) {
      console.error(`Failed to get payment status for file ${fileId}:`, error);
      throw error;
    }
  }

  async releasePayment(fileId: number): Promise<string> {
    try {
      console.log(`Releasing payment for file ${fileId}...`);

      const tx = await this.paymentEscrow.releasePayment(fileId);
      await tx.wait();

      console.log(`Payment released for file ${fileId}`);
      return tx.hash;
    } catch (error) {
      console.error(`Failed to release payment for file ${fileId}:`, error);
      throw error;
    }
  }

  async getCurrentStoragePrice(): Promise<{ pricePerByte: bigint; totalFiles: number }> {
    try {
      const [totalFiles, , pricePerByte] = await this.fileRegistry.getStats();
      return {
        pricePerByte,
        totalFiles: Number(totalFiles),
      };
    } catch (error) {
      console.error("Failed to get storage stats:", error);
      throw error;
    }
  }

  async updateStoragePrice(newPricePerByte: bigint): Promise<string> {
    try {
      console.log(`Updating storage price to ${newPricePerByte} USDFC per byte...`);

      const tx = await this.fileRegistry.updateStoragePrice(newPricePerByte);
      await tx.wait();

      console.log("Storage price updated");
      return tx.hash;
    } catch (error) {
      console.error("Failed to update storage price:", error);
      throw error;
    }
  }

  getContractAddresses() {
    const networkDeployment = deployments[this.network];
    return {
      network: this.network,
      fileRegistry: networkDeployment.contracts.FileRegistry.address,
      paymentEscrow: networkDeployment.contracts.PaymentEscrow.address,
      usdfc: networkDeployment.dependencies.USDFC,
    };
  }
}

let contractService: ContractService;

export function getContractService(): ContractService {
  if (!contractService) {
    contractService = new ContractService();
  }
  return contractService;
}
