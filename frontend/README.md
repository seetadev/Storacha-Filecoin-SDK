# Storacha Filecoin Frontend

Next.js frontend application for testing the Filecoin storage backend POC.

## Features

- 📤 **File Upload** - Drag & drop or click to upload files to Filecoin
- 📥 **File Download** - Retrieve files using Piece CID
- 💰 **Account Info** - View USDFC balance and allowances
- ✅ **Preflight Checks** - Automatic validation before upload
- 🎨 **Modern UI** - Built with Tailwind CSS

---

## Quick Start

### 1. Install Dependencies

```bash
cd frontend
pnpm install
```

### 2. Configure Environment

```bash
cp .env.local.example .env.local
```

Edit `.env.local`:

```env
NEXT_PUBLIC_BACKEND_URL=http://localhost:3000
```

### 3. Start Development Server

```bash
pnpm dev
```

The app will be available at `http://localhost:3001` (or the next available port).

---

## Prerequisites

Make sure the backend is running before using the frontend:

```bash
# In the backend directory
cd ../backend
pnpm dev
```

The backend should be running on `http://localhost:3000`.

---

## Project Structure

```
frontend/
├── app/
│   ├── layout.tsx          # Root layout
│   ├── page.tsx            # Main page
│   └── globals.css         # Global styles
├── components/
│   ├── FileUpload.tsx      # Upload component
│   ├── FileDownload.tsx    # Download component
│   └── AccountInfo.tsx     # Account display
├── lib/
│   └── api-client.ts       # Backend API client
├── .env.local.example
├── next.config.js
├── tailwind.config.js
├── tsconfig.json
└── package.json
```

---

## Usage

### Upload a File

1. Drag and drop a file onto the upload zone, or click to browse
2. Select a file (max 200 MB)
3. Click "Upload to Filecoin"
4. Wait for the upload to complete
5. Copy the Piece CID for later retrieval

### Download a File

1. Paste the Piece CID in the download field
2. Click "Download from Filecoin"
3. The file will be downloaded to your browser's download folder

### View Account Info

- Total Funds: Total USDFC deposited
- Available Funds: USDFC available for uploads
- Lockup Requirement: USDFC locked for service

Click "Refresh" to update the account information.

---

## API Client

The frontend uses a TypeScript API client (`lib/api-client.ts`) to communicate with the backend:

```typescript
import { apiClient } from '@/lib/api-client';

// Upload file
const result = await apiClient.uploadFile(file);

// Download file
const blob = await apiClient.downloadFile(pieceCid);

// Get account info
const account = await apiClient.getAccountInfo();

// Preflight check
const preflight = await apiClient.preflightCheck(fileSize);
```

---

## Components

### FileUpload

Features:
- Drag & drop support
- File size validation
- Automatic preflight checks
- Upload progress indication
- Success/error feedback

### FileDownload

Features:
- Piece CID input
- Automatic file download
- Error handling

### AccountInfo

Features:
- Real-time balance display
- Backend health status
- Manual refresh

---

## Development

### Run in Development Mode

```bash
pnpm dev
```

Runs on `http://localhost:3001` with hot reloading.

### Build for Production

```bash
pnpm build
pnpm start
```

### Linting

```bash
pnpm lint
```

---

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `NEXT_PUBLIC_BACKEND_URL` | Backend API URL | `http://localhost:3000` |

---

## Troubleshooting

### Backend Connection Failed

**Error:** "Failed to get account info"

**Solution:**
1. Ensure backend is running: `cd backend && pnpm dev`
2. Check backend URL in `.env.local`
3. Verify CORS is enabled in backend

### Upload Fails with "Insufficient Allowance"

**Solution:**
Run the backend setup endpoint:

```bash
curl -X POST http://localhost:3000/api/storage/setup
```

### File Not Downloading

**Solution:**
1. Verify the Piece CID is correct
2. Check browser console for errors
3. Ensure the file was successfully uploaded

---

## Tech Stack

- **Framework:** Next.js 14 (App Router)
- **Language:** TypeScript
- **Styling:** Tailwind CSS
- **HTTP Client:** Native Fetch API

---

## Next Steps

- [ ] Add file upload history
- [ ] Implement file search by CID
- [ ] Add wallet connection (MetaMask)
- [ ] Show upload/download progress bars
- [ ] Add file preview (images, PDFs)
- [ ] Implement batch uploads
- [ ] Add authentication
- [ ] Display transaction history

---

## License

MIT
