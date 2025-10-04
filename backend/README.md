# Storacha Filecoin Backend

Simple backend API for uploading and downloading files to/from Filecoin using the **Synapse SDK**.

## Features

- 📤 Upload files to Filecoin warm storage
- 📥 Download files by Piece CID
- 💰 Manage USDFC payments via Synapse SDK
- ✅ Preflight checks before upload
- 🔐 Account setup with deposits and service approvals

---

## Quick Start

### 1. Install Dependencies

```bash
cd backend
pnpm install
```

### 2. Configure Environment

Copy the example environment file and fill in your Filecoin private key:

```bash
cp .env.example .env
```

Edit `.env`:

```env
FILECOIN_PRIVATE_KEY=0x...  # Your Calibration testnet private key
FILECOIN_RPC_URL=https://api.calibration.node.glif.io/rpc/v1
PORT=3000
```

### 3. Start the Server

```bash
pnpm dev
```

The server will start on `http://localhost:3000`.

---

## First-Time Setup

Before uploading files, you need to setup your account (deposit USDFC and approve the Warm Storage service):

```bash
curl -X POST http://localhost:3000/api/storage/setup \
  -H "Content-Type: application/json" \
  -d '{"depositAmount": "100"}'
```

This will:
1. Deposit 100 USDFC to your account
2. Approve the Warm Storage service with allowances

**Note:** You only need to run this once per account.

---

## API Endpoints

### Health Check

```bash
GET /health
```

Returns server status.

### Get Account Info

```bash
GET /api/storage/account
```

Returns:
```json
{
  "success": true,
  "data": {
    "totalFunds": "100.0",
    "lockupRequirement": "1000.0",
    "availableFunds": "100.0"
  }
}
```

### Preflight Check

Check if an upload is possible before uploading:

```bash
GET /api/storage/preflight?size=1024000
```

Returns:
```json
{
  "success": true,
  "data": {
    "canUpload": true,
    "estimatedCost": "0.5",
    "allowance": {
      "current": "100.0",
      "required": "0.5",
      "sufficient": true
    }
  }
}
```

### Upload File

```bash
POST /api/storage/upload
Content-Type: multipart/form-data

file: <your file>
```

**Example with cURL:**

```bash
curl -X POST http://localhost:3000/api/storage/upload \
  -F "file=@./test.txt"
```

**Response:**

```json
{
  "success": true,
  "data": {
    "pieceCid": "baga6ea4seaqao7s73y24kcutaosvacpdjgfe5pw76ooefnyqw4ynr3d2y6x2mpq",
    "size": 1024,
    "filename": "test.txt",
    "uploadedAt": "2024-01-15T10:30:00.000Z",
    "txHash": "0x..."
  }
}
```

### Download File

```bash
GET /api/storage/download/:pieceCid
```

**Example:**

```bash
curl http://localhost:3000/api/storage/download/baga6ea4seaqao7s73y24kcutaosvacpdjgfe5pw76ooefnyqw4ynr3d2y6x2mpq \
  --output downloaded-file.txt
```

---

## Project Structure

```
backend/
├── src/
│   ├── config/
│   │   ├── env.ts          # Environment configuration
│   │   └── synapse.ts      # Synapse SDK initialization
│   ├── services/
│   │   └── storage.service.ts  # Storage operations
│   ├── routes/
│   │   └── storage.routes.ts   # API routes
│   └── index.ts            # Express server
├── .env.example
├── package.json
└── tsconfig.json
```

---

## Development

### Run in Development Mode

```bash
pnpm dev
```

This uses `tsx watch` for hot reloading.

### Build for Production

```bash
pnpm build
pnpm start
```

---

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | `3000` |
| `NODE_ENV` | Environment | `development` |
| `FILECOIN_PRIVATE_KEY` | Filecoin wallet private key | *required* |
| `FILECOIN_RPC_URL` | RPC endpoint | Calibration testnet |
| `GLIF_AUTH_TOKEN` | Optional GLIF auth token | - |
| `MAX_FILE_SIZE` | Max upload size in bytes | `200000000` (200MB) |
| `UPLOAD_TEMP_DIR` | Temp upload directory | `./temp/uploads` |

---

## Testing with cURL

### 1. Setup Account

```bash
curl -X POST http://localhost:3000/api/storage/setup \
  -H "Content-Type: application/json" \
  -d '{"depositAmount": "100"}'
```

### 2. Check Account

```bash
curl http://localhost:3000/api/storage/account
```

### 3. Preflight Check

```bash
curl "http://localhost:3000/api/storage/preflight?size=5000"
```

### 4. Upload File

```bash
curl -X POST http://localhost:3000/api/storage/upload \
  -F "file=@./sample.pdf"
```

### 5. Download File

```bash
curl http://localhost:3000/api/storage/download/{PIECE_CID} \
  --output downloaded.pdf
```

---

## Error Handling

All endpoints return errors in this format:

```json
{
  "success": false,
  "error": "Error message here"
}
```

Common errors:
- `400` - Bad request (missing file, invalid params)
- `402` - Insufficient allowance
- `500` - Server error

---

## Troubleshooting

### "FILECOIN_PRIVATE_KEY not set"

Make sure you've created a `.env` file with your private key.

### "Insufficient allowance"

Run the setup endpoint to deposit USDFC and approve the service:

```bash
curl -X POST http://localhost:3000/api/storage/setup
```

### Upload fails

1. Check account balance: `GET /api/storage/account`
2. Run preflight check: `GET /api/storage/preflight?size={fileSize}`
3. Ensure you have USDFC in your Calibration wallet

---

## Next Steps

- Add database integration for tracking uploads
- Implement file metadata storage
- Add authentication middleware
- Build frontend client (SDK)
- Add payment tracking

---

## License

MIT
