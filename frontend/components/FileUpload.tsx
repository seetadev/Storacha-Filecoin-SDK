'use client';

import { useState } from 'react';
import { apiClient, PreflightCheck, UploadResult } from '@/lib/api-client';

export default function FileUpload() {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [preflight, setPreflight] = useState<PreflightCheck | null>(null);
  const [preflightLoading, setPreflightLoading] = useState(false);

  const runPreflight = async (selectedFile: File) => {
    setPreflightLoading(true);
    setPreflight(null);
    setError(null);

    try {
      const result = await apiClient.preflightCheck(selectedFile.size);
      setPreflight(result);

      if (!result.canUpload) {
        setError(
          `Allowance is insufficient. Required: ${result.allowance.required} USDFC, Available: ${result.allowance.current} USDFC`
        );
      }
    } catch (err: any) {
      setError(err.message || 'Preflight check failed');
    } finally {
      setPreflightLoading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selected = e.target.files[0];
      setFile(selected);
      setUploadResult(null);
      setError(null);
      runPreflight(selected);
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const selected = e.dataTransfer.files[0];
      setFile(selected);
      setUploadResult(null);
      setError(null);
      runPreflight(selected);
    }
  };

  const handleUpload = async () => {
    if (!file) return;

    setUploading(true);
    setError(null);
    setUploadResult(null);

    try {
      // Ensure we have a preflight result before uploading
      const latestPreflight = preflight ?? (await apiClient.preflightCheck(file.size));
      if (!latestPreflight.canUpload) {
        throw new Error(
          `Insufficient allowance. Required: ${latestPreflight.allowance.required} USDFC, Available: ${latestPreflight.allowance.current} USDFC`
        );
      }

      // Upload
      const result = await apiClient.uploadFile(file);
      setUploadResult(result);
      setFile(null);
      setPreflight(null);
    } catch (err: any) {
      setError(err.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <h2 className="text-2xl font-bold mb-4">Upload File</h2>

      {/* Drag & Drop Zone */}
      <div
        className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
          dragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-300'
        }`}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
      >
        <input
          type="file"
          id="file-upload"
          className="hidden"
          onChange={handleFileChange}
          disabled={uploading}
        />
        <label htmlFor="file-upload" className="cursor-pointer">
          <div className="text-gray-600">
            <svg
              className="mx-auto h-12 w-12 text-gray-400 mb-3"
              stroke="currentColor"
              fill="none"
              viewBox="0 0 48 48"
            >
              <path
                d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <p className="text-sm">
              <span className="font-semibold text-blue-600">Click to upload</span> or drag and drop
            </p>
            <p className="text-xs text-gray-500 mt-1">Max file size: 200 MB</p>
          </div>
        </label>
      </div>

      {/* Selected File */}
      {file && (
        <div className="mt-4 p-4 bg-gray-50 rounded-lg">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-gray-900">{file.name}</p>
              <p className="text-sm text-gray-500">{(file.size / 1024).toFixed(2)} KB</p>
            </div>
            <button
              onClick={() => {
                setFile(null);
                setPreflight(null);
                setError(null);
              }}
              className="text-red-600 hover:text-red-800"
              disabled={uploading}
            >
              Remove
            </button>
          </div>

          {/* Preflight details */}
          <div className="mt-3 text-sm text-gray-700 space-y-1">
            {preflightLoading && <p className="text-blue-600">Checking allowance and pricing...</p>}
            {preflight && (
              <>
                <p>
                  <span className="font-medium">Can upload:</span>{' '}
                  {preflight.canUpload ? 'Yes' : 'No'}
                </p>
                <p>
                  <span className="font-medium">Estimated cost/epoch:</span>{' '}
                  {preflight.estimatedCost} USDFC
                </p>
                {preflight.estimatedCostBreakdown && (
                  <p className="text-xs text-gray-500">
                    Day: {preflight.estimatedCostBreakdown.perDay} USDFC · Month: {preflight.estimatedCostBreakdown.perMonth} USDFC
                  </p>
                )}
                <p className="text-xs text-gray-600">
                  Allowance: {preflight.allowance.current} / {preflight.allowance.required} USDFC
                </p>
              </>
            )}
          </div>
        </div>
      )}

      {/* Upload Button */}
      {file && (
        <button
          onClick={handleUpload}
          disabled={uploading}
          className="mt-4 w-full bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
        >
          {uploading ? 'Uploading...' : 'Upload to Filecoin'}
        </button>
      )}

      {/* Error Message */}
      {error && (
        <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-red-800 text-sm">{error}</p>
        </div>
      )}

      {/* Success Result */}
      {uploadResult && (
        <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-lg">
          <h3 className="font-semibold text-green-900 mb-2">Upload Successful!</h3>
          <div className="text-sm text-green-800 space-y-1">
            <p>
              <span className="font-medium">File ID:</span> {uploadResult.fileId}
            </p>
            <p>
              <span className="font-medium">Piece CID:</span>
              <code className="ml-2 bg-green-100 px-2 py-1 rounded text-xs break-all">
                {uploadResult.pieceCid}
              </code>
            </p>
            <p>
              <span className="font-medium">Size:</span> {(uploadResult.size / 1024).toFixed(2)} KB
            </p>
            <p>
              <span className="font-medium">Storage price:</span> {uploadResult.storagePrice} USDFC
            </p>
            {uploadResult.synapseStxHash && (
              <p>
                <span className="font-medium">Synapse tx:</span>
                <code className="ml-2 bg-green-100 px-2 py-1 rounded text-xs break-all">{uploadResult.synapseStxHash}</code>
              </p>
            )}
            {uploadResult.contractTxHash && (
              <p>
                <span className="font-medium">Registry tx:</span>
                <code className="ml-2 bg-green-100 px-2 py-1 rounded text-xs break-all">{uploadResult.contractTxHash}</code>
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
