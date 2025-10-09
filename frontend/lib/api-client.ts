const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3000';

export interface UploadResult {
  pieceCid: string;
  size: number;
  filename: string;
  uploadedAt: string;
  txHash?: string;
}

export interface AccountInfo {
  totalFunds: string;
  lockupRequirement: string;
  availableFunds: string;
}

export interface PreflightCheck {
  canUpload: boolean;
  estimatedCost: string;
  allowance: {
    current: string;
    required: string;
    sufficient: boolean;
  };
}

export class StorageAPIClient {
  private baseUrl: string;

  constructor(baseUrl: string = BACKEND_URL) {
    this.baseUrl = baseUrl;
  }

  /**
   * Upload a file to Filecoin
   */
  async uploadFile(file: File): Promise<UploadResult> {
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch(`${this.baseUrl}/api/storage/upload`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Upload failed');
    }

    const result = await response.json();
    return result.data;
  }

  /**
   * Download a file from Filecoin
   */
  async downloadFile(pieceCid: string): Promise<Blob> {
    const response = await fetch(`${this.baseUrl}/api/storage/download/${pieceCid}`);

    if (!response.ok) {
      throw new Error('Download failed');
    }

    return await response.blob();
  }

  /**
   * Check if upload is possible
   */
  async preflightCheck(fileSize: number): Promise<PreflightCheck> {
    const response = await fetch(`${this.baseUrl}/api/storage/preflight?size=${fileSize}`);

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Preflight check failed');
    }

    const result = await response.json();
    return result.data;
  }

  /**
   * Get account information
   */
  async getAccountInfo(): Promise<AccountInfo> {
    const response = await fetch(`${this.baseUrl}/api/storage/account`);

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to get account info');
    }

    const result = await response.json();
    return result.data;
  }

  /**
   * Setup account (deposit and approve service)
   */
  async setupAccount(depositAmount?: string): Promise<any> {
    const response = await fetch(`${this.baseUrl}/api/storage/setup`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ depositAmount }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Setup failed');
    }

    const result = await response.json();
    return result.data;
  }

  /**
   * Check backend health
   */
  async checkHealth(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/health`);
      return response.ok;
    } catch {
      return false;
    }
  }
}

export const apiClient = new StorageAPIClient();
