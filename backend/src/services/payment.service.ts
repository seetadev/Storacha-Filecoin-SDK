import { ethers } from "ethers";
import { config } from "../config/env.js";

const REGISTRY_ABI = [
  "function getFileIdByCid(string calldata pieceCid) external view returns (uint256)"
];

const ESCROW_ABI = [

  "function getEscrowByFile(uint256 fileId) external view returns (uint256, tuple(uint256 fileId, address payer, address provider, uint256 amount, uint256 lockTime, bool released, bool refunded))"
];

export class PaymentService {
  private provider: ethers.JsonRpcProvider;
  private registryContract: ethers.Contract;
  private escrowContract: ethers.Contract;

  constructor() {
    // Initialize provider using the RPC URL from config
    this.provider = new ethers.JsonRpcProvider(config.filecoin.rpcUrl);

    this.registryContract = new ethers.Contract(
      config.contracts.fileRegistryAddress,
      REGISTRY_ABI,
      this.provider
    );

    this.escrowContract = new ethers.Contract(
      config.contracts.paymentEscrowAddress,
      ESCROW_ABI,
      this.provider
    );
  }

  /**
   * * @param pieceCid - The Filecoin Piece CID of the content
   * @param userAddress - The EVM address of the user requesting access
   * @returns boolean - True if paid and valid
   */
  async verifyPayment(pieceCid: string, userAddress: string): Promise<boolean> {
    try {
      const fileId = await this.registryContract.getFileIdByCid(pieceCid);
      
      if (fileId == 0n) {
        console.log(`PaymentCheck: CID ${pieceCid} not found in registry.`);
        return false;
      }

      const [escrowId, escrowRecord] = await this.escrowContract.getEscrowByFile(fileId);

      if (escrowId == 0n) {
        console.log(`PaymentCheck: No escrow record found for fileId ${fileId}`);
        return false;
      }

      const payer = escrowRecord.payer;
      const amount = escrowRecord.amount;
      const isRefunded = escrowRecord.refunded;

      if (isRefunded) {
        console.log(`PaymentCheck: Payment was refunded.`);
        return false;
      }

      if (amount <= 0n) {
        console.log(`PaymentCheck: Payment amount is zero.`);
        return false;
      }

      if (payer.toLowerCase() !== userAddress.toLowerCase()) {
        console.log(`PaymentCheck: Payer mismatch. Paid by ${payer}, requested by ${userAddress}`);
        return false;
      }

      return true;

    } catch (error) {
      console.error("Payment verification failed on-chain:", error);
      return false;
    }
  }
}