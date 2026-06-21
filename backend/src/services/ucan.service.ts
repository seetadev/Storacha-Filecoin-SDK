import { ed25519, Verifier } from '@ucanto/principal';
import * as UCAN from '@ipld/dag-ucan';
import { Signer, DID } from '@ucanto/interface'; 

export class UcanService {
  private static instance: UcanService;
  private signer: Signer | null = null;

  private constructor() {}

  public static getInstance(): UcanService {
    if (!UcanService.instance) {
      UcanService.instance = new UcanService();
    }
    return UcanService.instance;
  }

  /**
   * Initialize the server's identity (DID).
   */
  async init() {
    if (!this.signer) {
      // Generate a new Ed25519 keypair for the server
      this.signer = await ed25519.generate();
      console.log('🔐 UCAN Service Initialized');
      console.log(`   Server DID: ${this.signer.did()}`);
    }
    return this.signer;
  }

  /**
   * Issue a "Retrieval Ticket" (UCAN) for a specific user and file.
   */
  async issueRetrievalToken(userDid: string, pieceCid: string): Promise<string> {
    if (!this.signer) await this.init();

    const audience = Verifier.parse(userDid as DID);

    const ucan = await UCAN.issue({
      issuer: this.signer!,
      audience: audience,
      lifetimeInSeconds: 3600,
      capabilities: [
        {
          with: `storage:${pieceCid}`,
          can: 'storage/retrieve'
        }
      ]
    });

    return UCAN.format(ucan);
  }

  /**
   * Verify a token provided by a user.
   */
  async verifyRetrievalAccess(encodedToken: string, pieceCid: string): Promise<boolean> {
    try {
      if (!this.signer) await this.init();

      const token = UCAN.parse(encodedToken);
      
      const hasCapability = token.capabilities.some((cap: any) => {
        const resourceMatch = cap.with === `storage:${pieceCid}`;
        const actionMatch = cap.can === 'storage/retrieve';

        return resourceMatch && actionMatch;
      });

      return hasCapability; 
    } catch (error) {
      console.error("UCAN verification error:", error);
      return false;
    }
  }
}