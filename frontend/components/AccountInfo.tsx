'use client';

import { useState, useEffect } from 'react';
import { apiClient, AccountInfo } from '@/lib/api-client';

export default function AccountInfoDisplay() {
  const [accountInfo, setAccountInfo] = useState<AccountInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [backendOnline, setBackendOnline] = useState(false);

  useEffect(() => {
    loadAccountInfo();
    checkBackendHealth();
  }, []);

  const checkBackendHealth = async () => {
    const isHealthy = await apiClient.checkHealth();
    setBackendOnline(isHealthy);
  };

  const loadAccountInfo = async () => {
    setLoading(true);
    setError(null);

    try {
      const info = await apiClient.getAccountInfo();
      setAccountInfo(info);
    } catch (err: any) {
      setError(err.message || 'Failed to load account info');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-2xl font-bold">Account Info</h2>
        <button
          onClick={loadAccountInfo}
          disabled={loading}
          className="text-sm bg-gray-100 hover:bg-gray-200 px-3 py-1 rounded-lg transition-colors disabled:opacity-50"
        >
          {loading ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      {/* Backend Status */}
      <div className="mb-4 flex items-center space-x-2">
        <div className={`w-3 h-3 rounded-full ${backendOnline ? 'bg-green-500' : 'bg-red-500'}`} />
        <span className="text-sm text-gray-600">
          Backend: {backendOnline ? 'Online' : 'Offline'}
        </span>
      </div>

      {loading && !accountInfo && (
        <div className="text-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-2 text-gray-600">Loading account info...</p>
        </div>
      )}

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-red-800 text-sm">{error}</p>
        </div>
      )}

      {accountInfo && !loading && (
        <div className="space-y-3">
          <div className="p-3 bg-blue-50 rounded-lg">
            <p className="text-sm text-gray-600">Total Funds</p>
            <p className="text-xl font-bold text-blue-900">{accountInfo.totalFunds} USDFC</p>
          </div>

          <div className="p-3 bg-green-50 rounded-lg">
            <p className="text-sm text-gray-600">Available Funds</p>
            <p className="text-xl font-bold text-green-900">{accountInfo.availableFunds} USDFC</p>
          </div>

          <div className="p-3 bg-purple-50 rounded-lg">
            <p className="text-sm text-gray-600">Lockup Requirement</p>
            <p className="text-xl font-bold text-purple-900">{accountInfo.lockupRequirement} USDFC</p>
          </div>
        </div>
      )}
    </div>
  );
}
