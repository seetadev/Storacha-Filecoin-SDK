import FileUpload from '@/components/FileUpload';
import FileDownload from '@/components/FileDownload';
import AccountInfoDisplay from '@/components/AccountInfo';

export default function Home() {
  return (
    <main className="min-h-screen py-12 px-4">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">
            Storacha Filecoin Storage
          </h1>
          <p className="text-gray-600">
            Upload to Filecoin via Synapse with on-chain FileRegistry + PaymentEscrow tracking
          </p>
        </div>

        {/* Main Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left Column - Account Info */}
          <div className="lg:col-span-1">
            <AccountInfoDisplay />
          </div>

          {/* Right Column - Upload & Download */}
          <div className="lg:col-span-2 space-y-8">
            <FileUpload />
            <FileDownload />
          </div>
        </div>

        {/* Footer */}
        <div className="mt-12 text-center text-sm text-gray-500">
          <p>
            Powered by{' '}
            <a
              href="https://synapse.filecoin.services"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:underline"
            >
              Synapse SDK
            </a>
            {' '}on Filecoin Calibration Testnet
          </p>
        </div>
      </div>
    </main>
  );
}
