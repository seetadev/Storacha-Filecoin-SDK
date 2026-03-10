import { ethers } from "ethers";
import { config } from "../config/env.js";

export interface UcanCapability {
  resource: string;
  action: "download" | "upload" | "read";
  constraints?: Record<string, any>;
}

export interface UcanTokenRequest {
  pieceCid?: string;
  capabilities?: UcanCapability[];
  expiresInSeconds?: number;
}

export interface UcanTokenResponse {
  token: string;
  capabilities: UcanCapability[];
  expiresAt: Date;
  issuer: string;
  audience?: string;
}

export class UcanService {
  private issuerDID: string = "";
  private secretKey: string = "";

  constructor() {
    this.initializeKeypair();
  }

  private initializeKeypair(): void {
    try {
      this.secretKey = config.filecoin.privateKey;
      this.issuerDID = `did:key:${ethers.keccak256(ethers.toUtf8Bytes(this.secretKey)).slice(0, 42)}`;
      console.log(`UCAN Service initialized with DID: ${this.issuerDID}`);
    } catch (error) {
      console.error("Failed to initialize UCAN keypair:", error);
      throw error;
    }
  }

  async generateDownloadToken(request: UcanTokenRequest): Promise<UcanTokenResponse> {
    const expiresInSeconds = request.expiresInSeconds || 3600;
    const expiresAt = new Date(Date.now() + expiresInSeconds * 1000);

    const capabilities = request.capabilities || [{
      resource: request.pieceCid ? `storacha:file:${request.pieceCid}` : "storacha:file:*",
      action: "download" as const,
      constraints: request.pieceCid ? { pieceCid: request.pieceCid } : undefined,
    }];

    try {
      const audience = request.pieceCid ? `did:key:file:${request.pieceCid}` : "did:key:storacha:client";

      const payload = {
        iss: this.issuerDID,
        aud: audience,
        exp: Math.floor(expiresAt.getTime() / 1000),
        iat: Math.floor(Date.now() / 1000),
        att: capabilities.map(cap => ({
          with: cap.resource,
          can: cap.action,
          nb: cap.constraints || {},
        })),
        prf: [],
      };

      const token = this.createSimpleJWT(payload);

      return {
        token,
        capabilities,
        expiresAt,
        issuer: this.issuerDID,
        audience,
      };
    } catch (error) {
      console.error("Failed to generate UCAN token:", error);
      throw error;
    }
  }

  async validateToken(token: string, requiredCapability?: UcanCapability): Promise<{
    valid: boolean;
    decoded?: any;
    error?: string;
    capabilities?: UcanCapability[];
  }> {
    try {
      const payload = this.verifySimpleJWT(token);

      if (!payload) {
        return {
          valid: false,
          error: "Invalid token signature",
        };
      }

      if (payload.iss !== this.issuerDID) {
        return {
          valid: false,
          error: "Token issued by unknown issuer",
        };
      }

      const now = Math.floor(Date.now() / 1000);
      if (payload.exp && payload.exp < now) {
        return {
          valid: false,
          error: "UCAN token has expired",
        };
      }

      const capabilities: UcanCapability[] = payload.att?.map((att: any) => ({
        resource: att.with,
        action: att.can,
        constraints: att.nb || {},
      })) || [];

      if (requiredCapability) {
        const hasCapability = capabilities.some(cap =>
          this.capabilityMatches(cap, requiredCapability)
        );

        if (!hasCapability) {
          return {
            valid: false,
            error: `Missing required capability: ${requiredCapability.action} on ${requiredCapability.resource}`,
            capabilities,
          };
        }
      }

      return {
        valid: true,
        decoded: payload,
        capabilities,
      };
    } catch (error) {
      console.error("UCAN token validation error:", error);
      return {
        valid: false,
        error: `Token validation failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  async generateUploadToken(request: UcanTokenRequest): Promise<UcanTokenResponse> {
    const expiresInSeconds = request.expiresInSeconds || 1800;
    const expiresAt = new Date(Date.now() + expiresInSeconds * 1000);

    const capabilities = request.capabilities || [{
      resource: "storacha:file:*",
      action: "upload" as const,
    }];

    try {
      const audience = "did:key:storacha:uploader";

      const payload = {
        iss: this.issuerDID,
        aud: audience,
        exp: Math.floor(expiresAt.getTime() / 1000),
        iat: Math.floor(Date.now() / 1000),
        att: capabilities.map(cap => ({
          with: cap.resource,
          can: cap.action,
          nb: cap.constraints || {},
        })),
        prf: [],
      };

      const token = this.createSimpleJWT(payload);

      return {
        token,
        capabilities,
        expiresAt,
        issuer: this.issuerDID,
        audience,
      };
    } catch (error) {
      console.error("Failed to generate upload UCAN token:", error);
      throw error;
    }
  }

  private createSimpleJWT(payload: any): string {
    const header = {
      alg: "HS256",
      typ: "JWT",
    };

    const encodedHeader = Buffer.from(JSON.stringify(header)).toString('base64url');
    const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');

    const data = `${encodedHeader}.${encodedPayload}`;
    const signature = ethers.keccak256(ethers.toUtf8Bytes(data + this.secretKey)).slice(2);

    return `${data}.${signature}`;
  }

  private verifySimpleJWT(token: string): any | null {
    try {
      const parts = token.split('.');
      if (parts.length !== 3) {
        return null;
      }

      const [encodedHeader, encodedPayload, signature] = parts;
      const data = `${encodedHeader}.${encodedPayload}`;
      const expectedSignature = ethers.keccak256(ethers.toUtf8Bytes(data + this.secretKey)).slice(2);

      if (signature !== expectedSignature) {
        return null;
      }

      const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString());
      return payload;
    } catch (error) {
      return null;
    }
  }

  private capabilityMatches(capability: UcanCapability, required: UcanCapability): boolean {
    if (capability.action !== required.action) {
      return false;
    }

    if (capability.resource === "*" || capability.resource === "storacha:file:*") {
      return true;
    }

    if (capability.resource === required.resource) {
      return true;
    }

    if (required.constraints && capability.constraints) {
      for (const [key, value] of Object.entries(required.constraints)) {
        if (capability.constraints[key] !== value) {
          return false;
        }
      }
    }

    return false;
  }

  getIssuerDID(): string {
    return this.issuerDID;
  }

  async createDelegation(
    audienceDID: string,
    capabilities: UcanCapability[],
    expiresInSeconds?: number
  ): Promise<string> {
    const expiresAt = new Date(Date.now() + (expiresInSeconds || 86400) * 1000);

    const payload = {
      iss: this.issuerDID,
      aud: audienceDID,
      exp: Math.floor(expiresAt.getTime() / 1000),
      iat: Math.floor(Date.now() / 1000),
      att: capabilities.map(cap => ({
        with: cap.resource,
        can: cap.action,
        nb: cap.constraints || {},
      })),
      prf: [],
    };

    try {
      const delegation = this.createSimpleJWT(payload);
      console.log(`Created delegation for ${audienceDID}`);
      return delegation;
    } catch (error) {
      console.error("Failed to create delegation:", error);
      throw error;
    }
  }
}

let ucanService: UcanService;

export function getUcanService(): UcanService {
  if (!ucanService) {
    ucanService = new UcanService();
  }
  return ucanService;
}