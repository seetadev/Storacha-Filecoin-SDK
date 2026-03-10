# Storacha Filecoin SDK - Quick Start Guide

Complete guide to running the POC (Proof of Concept) with backend and frontend.

---

## Project Structure

```
Storacha-Filecoin-SDK/
├── backend/          # Node.js API with Synapse SDK
├── frontend/         # Next.js web interface
├── contracts/        # (Future) Filecoin smart contracts
└── sdk/              # (Future) TypeScript SDK package
```

---

## Prerequisites

- Node.js >= 20
- pnpm (or npm/yarn)
- Filecoin Calibration Testnet wallet with:
  - Test FIL (for gas)
  - Test USDFC tokens

---

## Step-by-Step Setup

### 1. Clone Repository

```bash
git clone https://github.com/seetadev/storacha-filecoin-sdk.git
cd storacha-filecoin-sdk
```

### 2. Setup Backend

```bash
cd backend
pnpm install

# Configure environment
cp .env.example .env
# Edit .env and add your FILECOIN_PRIVATE_KEY
```

**Important:** Get your Filecoin Calibration testnet private key and add it to `.env`:

```env
FILECOIN_PRIVATE_KEY=0x...
FILECOIN_RPC_URL=https://api.calibration.node.glif.io/rpc/v1
```

### 3. Start Backend

```bash
pnpm dev
```

Backend should now be running on `http://localhost:3000`.

### 4. Setup Account (One-Time)

In a new terminal, run:

```bash
curl -X POST http://localhost:3000/api/storage/setup \
  -H "Content-Type: application/json" \
  -d '{"depositAmount": "100"}'
```

This deposits 100 USDFC and approves the Warm Storage service.

### 5. Setup Frontend

In a new terminal:

```bash
cd frontend
pnpm install

# Configure environment
cp .env.local.example .env.local
```

Edit `.env.local`:

```env
NEXT_PUBLIC_BACKEND_URL=http://localhost:3000
```

### 6. Start Frontend

```bash
pnpm dev
```

Frontend should now be running on `http://localhost:3001`.

---

## Testing the Flow

### Via Web Interface

1. Open `http://localhost:3001` in your browser
2. Check that "Backend: Online" shows in Account Info
3. Upload a file:
   - Drag & drop or click to select a file
   - Click "Upload to Filecoin"
   - Copy the Piece CID from the success message
4. Download the file:
   - Paste the Piece CID in the download field
   - Click "Download from Filecoin"

### Via cURL

```bash
# Check backend health
curl http://localhost:3000/health

# Check account
curl http://localhost:3000/api/storage/account

# Upload file
curl -X POST http://localhost:3000/api/storage/upload \
  -F "file=@./test.txt"

# Download file (replace {CID} with your Piece CID)
curl http://localhost:3000/api/storage/download/{CID} \
  --output downloaded.txt
```

---

## Expected Flow

1. **Upload:**
   - Frontend sends file to backend
   - Backend runs preflight check (validates allowance)
   - Backend uploads to Synapse SDK
   - Synapse stores on Filecoin
   - Returns Piece CID

2. **Download:**
   - Frontend sends Piece CID to backend
   - Backend retrieves from Synapse SDK
   - Synapse fetches from Filecoin (or CDN)
   - Returns file to frontend

---

## Troubleshooting

### Backend Won't Start

**Error:** "FILECOIN_PRIVATE_KEY not set"

**Solution:** Add your private key to `backend/.env`

### "Insufficient Allowance" Error

**Solution:** Run the setup endpoint:

```bash
curl -X POST http://localhost:3000/api/storage/setup
```

### Frontend Can't Connect to Backend

**Solution:**
1. Verify backend is running on port 3000
2. Check `NEXT_PUBLIC_BACKEND_URL` in `frontend/.env.local`
3. Look for CORS errors in browser console

### Upload Fails

**Possible causes:**
1. Not enough USDFC in account (run setup)
2. File too large (max 200 MB)
3. Synapse SDK connection issue (check backend logs)

---

## Architecture Overview

```
┌─────────────┐
│  Frontend   │  Next.js (Port 3001)
│  (React)    │
└──────┬──────┘
       │ HTTP/REST
       │
┌──────▼──────┐
│   Backend   │  Express (Port 3000)
│   API       │
└──────┬──────┘
       │ TypeScript SDK
       │
┌──────▼──────────┐
│  Synapse SDK    │
│  (Filecoin)     │
└──────┬──────────┘
       │ RPC
       │
┌──────▼──────────┐
│  Filecoin       │
│  Calibration    │
│  Testnet        │
└─────────────────┘
```

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/health` | Backend health check |
| `GET` | `/api/storage/account` | Get USDFC balance |
| `POST` | `/api/storage/setup` | Setup account (one-time) |
| `GET` | `/api/storage/preflight?size=X` | Check upload feasibility |
| `POST` | `/api/storage/upload` | Upload file |
| `GET` | `/api/storage/download/:cid` | Download file |

---

## Development Workflow

### Backend Development

```bash
cd backend
pnpm dev  # Auto-reloads on changes
```

### Frontend Development

```bash
cd frontend
pnpm dev  # Hot reloads on changes
```

### Live Calibration Test

Run an end-to-end live test (upload -> pay -> store/release -> retrieve) against Calibration:

```bash
# Terminal 1: run backend with calibration env
cd backend
pnpm dev

# Terminal 2: run calibration test
cd backend
BACKEND_URL=http://localhost:3000 \
FILECOIN_RPC_URL=https://api.calibration.node.glif.io/rpc/v1 \
FILECOIN_NETWORK=calibration \
pnpm test:calibration
```

Optional environment variables:

- `SMOKE_TIMEOUT_SECONDS` (default `300`)
- `SMOKE_POLL_INTERVAL_MS` (default `10000`)

### View Logs

- Backend: Terminal running `pnpm dev`
- Frontend: Browser console + terminal

---

## Next Steps

- [ ] Add database for upload tracking
- [ ] Implement payment tracking per file
- [ ] Build TypeScript SDK package
- [ ] Add authentication (wallet connect)
- [ ] Deploy to testnet
- [ ] Add monitoring/analytics

---

## Get Help

- **Backend Issues:** Check `backend/README.md`
- **Frontend Issues:** Check `frontend/README.md`
- **Implementation Details:** Check `backend/IMPLEMENTATION.md`

---

## Funding Your Wallet

1. Get a Calibration testnet wallet
2. Request test FIL: https://faucet.calibration.fildev.network/
3. Request test USDFC from the Synapse team or faucet

---

## Production Considerations

⚠️ **This is a POC** - For production:

- Add authentication/authorization
- Implement rate limiting
- Use environment-specific RPC URLs
- Add monitoring and logging
- Set up database for persistence
- Implement payment tracking
- Add HTTPS/TLS
- Use secure key management (not .env files)

---

## License

MIT
