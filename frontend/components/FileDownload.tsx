'use client';

import { useState } from 'react';
import { apiClient } from '@/lib/api-client';

export default function FileDownload() {
  const [pieceCid, setPieceCid] = useState('');
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDownload = async () => {
    if (!pieceCid.trim()) {
      setError('Please enter a Piece CID');
      return;
    }

    setDownloading(true);
    setError(null);

    try {
      const blob = await apiClient.downloadFile(pieceCid.trim());

      // Create download link
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${pieceCid.substring(0, 16)}_download`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      setPieceCid('');
    } catch (err: any) {
      setError(err.message || 'Download failed');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <h2 className="text-2xl font-bold mb-4">Download File</h2>

      <div className="space-y-4">
        <div>
          <label htmlFor="piece-cid" className="block text-sm font-medium text-gray-700 mb-2">
            Piece CID
          </label>
          <input
            type="text"
            id="piece-cid"
            value={pieceCid}
            onChange={(e) => setPieceCid(e.target.value)}
            placeholder="baga6ea4seaq..."
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            disabled={downloading}
          />
          <p className="mt-1 text-xs text-gray-500">
            Enter the Piece CID of the file you want to download
          </p>
        </div>

        <button
          onClick={handleDownload}
          disabled={downloading || !pieceCid.trim()}
          className="w-full bg-green-600 text-white py-2 px-4 rounded-lg hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
        >
          {downloading ? 'Downloading...' : 'Download from Filecoin'}
        </button>

        {error && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-red-800 text-sm">{error}</p>
          </div>
        )}
      </div>
    </div>
  );
}
