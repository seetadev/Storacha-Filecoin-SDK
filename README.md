# Storacha Onchain Payments (Filecoin)

**Storacha Onchain Payments** is a proof-of-concept system enabling **per-file, pay-as-you-go decentralized storage payments on Filecoin**.
Users pay with **USDFC on the Filecoin Calibration Testnet**, while a storage provider account underwrites warm storage using the **Synapse SDK**.
This monorepo contains the **Filecoin & Storacha Storage + Payment Contracts**, **Backend API**, and **TypeScript SDK**.

---

## Features

* **Onchain Payments** – Pay storage fees directly with USDFC.
* **No Credit Cards** – Crypto-native billing flow.
* **Escrow-based Rewards** – Funds released after file storage is confirmed.
* **Backend API with UCAN Delegation** – Secure access control via UCAN tokens.
* **TypeScript SDK** – Simple integration for apps and workflows.
* **Extensible** – Designed for additional storage/payment flows (subscriptions, escrow).

---

## Monorepo Structure

```
contracts/   # Filecoin payment + storage contracts (Calibration Testnet)
backend/     # Node.js backend API with UCAN-based delegation
sdk/         # TypeScript SDK (@storacha/fc-sdk)
demo/        # CLI + frontend demo (file upload → storage → payment)
```

---

## Quick Start

### **1. Prerequisites**

* [Node.js >= 20](https://nodejs.org/en/) and [pnpm](https://pnpm.io/installation)
* [Docker](https://www.docker.com/) (for n8n + local test services)
* [Synapse SDK](https://github.com/FilOzone/synapse-sdk) (installed as npm dependency)
* [Filecoin Calibration Wallet](https://docs.filecoin.io/networks/calibration) with test USDFC tokens

---

### **2. Clone & Install Dependencies**

```bash
git clone https://github.com/seetadev/storacha-filecoin-sdk.git
cd storacha-filecoin-sdk
pnpm install
```

---

### **3. Setup Filecoin Environment**

Export your Calibration Testnet wallet private key (for dev only):

```bash
export FILECOIN_PRIVATE_KEY="..."
export FILECOIN_RPC="https://api.calibration.node.glif.io/rpc/v1"
```

Fund your wallet with test FIL and request test USDFC from the faucet.

---

### **4. Deploy Filecoin Contracts**

```bash
cd contracts
pnpm build
pnpm deploy
```

Contracts are deployed to the Calibration Testnet and return contract addresses for file/payment tracking.

---

### **5. Run the Backend Server**

```bash
cd backend
pnpm dev
```

Endpoints available:

* `POST /file-upload` → upload file, store with Synapse SDK, return CID
* `POST /pay-file` → lock USDFC against CID
* `GET /files/:wallet` → list uploaded files and payments

---

### **6. Build & Use the SDK**

```bash
cd sdk
pnpm build
```

Example usage:

```ts
import { StorachaClient } from '@storacha/fc-sdk';

const client = new StorachaClient();
const cid = await client.createFile("./sample.pdf", { size: 1024 });
await client.payFile(cid, 50);
const file = await client.retrieveFile(cid);
```

---

## Testing

### **Contracts Tests**

```bash
cd contracts
pnpm test
```

### **Backend Tests**

```bash
cd backend
pnpm test
```

### **SDK Tests**

```bash
cd sdk
pnpm test
```

---

## **Backend Database Migration Workflow**

1. Navigate to the backend directory:

   ```bash
   cd backend
   ```

2. Generate migration files:

   ```bash
   pnpm migrations-generate
   ```

3. Apply migrations:

   ```bash
   pnpm migrations-apply
   ```

---

## Testing the End-to-End Flow

1. Upload a file (e.g. `invoice.pdf`) via CLI or demo frontend.
2. File is stored in Filecoin warm storage → CID returned.
3. Pay storage fee using USDFC linked to CID.
4. Retrieve file later via CID.

Try the demo CLI:

```bash
cd demo
pnpm start
```

---

## Side Notes

* **Contract ABI:** after build, ABI artifacts are under `contracts/target/`.
* **Contract Addresses:** written to `contracts/deployments.json` after deployment.
* **Calibration Testnet:** ensure your wallet has FIL for gas + USDFC for payments.
* **UCAN Delegation:** backend issues scoped UCANs for retrieval access.


