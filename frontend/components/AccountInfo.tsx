'use client';

import { useEffect, useState } from 'react';
import { apiClient, AccountInfo, SetupResult } from '@/lib/api-client';

export default function AccountInfoDisplay() {
  const [accountInfo, setAccountInfo] = useState<AccountInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [backendOnline, setBackendOnline] = useState(false);
  const [setupLoading, setSetupLoading] = useState(false);
  const [setupAmount, setSetupAmount] = useState('100');
  const [setupResult, setSetupResult] = useState<SetupResult | null>(null);

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

  const handleSetup = async () => {
    setSetupLoading(true);
    setError(null);
    setSetupResult(null);

    try {
      const result = await apiClient.setupAccount(setupAmount || undefined);
      setSetupResult(result);
      await loadAccountInfo();
    } catch (err: any) {
      setError(err.message || 'Failed to setup account');
    } finally {
      setSetupLoading(false);
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

      {/* One-time setup (deposit + approve) */}
      <div className="mt-6 border-t border-gray-100 pt-4">
        <p className="text-sm text-gray-700 mb-2">Fund USDFC + approve Warm Storage</p>
        <div className="flex items-center space-x-2">
          <input
            type="number"
            min="1"
            step="1"
            value={setupAmount}
            onChange={(e) => setSetupAmount(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="100"
            disabled={setupLoading}
          />
          <button
            onClick={handleSetup}
            disabled={setupLoading}
            className="whitespace-nowrap bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
          >
            {setupLoading ? 'Funding...' : 'Setup'}
          </button>
        </div>
        <p className="text-xs text-gray-500 mt-1">
          Deposits USDFC and sets allowances so uploads can be registered on-chain.
        </p>
      </div>

      {setupResult && (
        <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-800 space-y-1">
          <p className="font-semibold">Account ready</p>
          <p>Deposited: {setupResult.depositAmount} USDFC</p>
          <p className="break-all text-xs">
            Warm Storage: <code className="bg-green-100 px-1 rounded">{setupResult.warmStorageAddress}</code>
          </p>
        </div>
      )}
    </div>
  );
}
