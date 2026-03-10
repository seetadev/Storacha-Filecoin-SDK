import assert from "node:assert/strict";
import test from "node:test";
import { ethers } from "ethers";

import { StorageService } from "../services/storage.service.js";

function buildSynapseMock(options?: {
  preflightSufficient?: boolean;
  downloadable?: boolean;
}) {
  const downloadable = options?.downloadable ?? true;

  return {
    storage: {
      preflightUpload: async (_size: number) => ({
        allowanceCheck: {
          sufficient: options?.preflightSufficient ?? true,
          message:
            options?.preflightSufficient === false
              ? "Insufficient allowance"
              : undefined,
        },
        estimatedCost: { perEpoch: 1n, perDay: 2n, perMonth: 3n },
        selectedProvider: {
          id: 11,
          serviceProvider: "0xProvider",
          name: "Provider One",
        },
        selectedDataSetId: 77,
      }),
      upload: async (_data: Uint8Array, opts?: any) => {
        opts?.callbacks?.onPieceAdded?.("0xuploadtx");
        return {
          pieceCid: { toString: () => "baga6ea4synapse" },
          size: 111,
          pieceId: 9,
        };
      },
      download: async () => {
        if (!downloadable) {
          throw new Error("not yet retrievable");
        }
        return new Uint8Array([1, 2, 3]);
      },
    },
    payments: {
      accountInfo: async () => ({
        funds: 10n,
        lockupCurrent: 2n,
        lockupRate: 1n,
        availableFunds: 8n,
      }),
      balance: async () => ethers.parseUnits("100", 18),
      deposit: async () => ({ wait: async () => ({}) }),
      approveService: async () => ({ wait: async () => ({}) }),
    },
    getWarmStorageAddress: () => "0xWarmStorage",
  };
}

function buildContractMock() {
  const calls = {
    registerFile: 0,
    depositPayment: 0,
    confirmStorage: 0,
    releasePayment: 0,
  };

  const contract = {
    getStoragePrice: async (_size: number) => 1234n,
    registerFile: async (
      _pieceCid: string,
      _fileSize: number,
      _metadataHash?: string,
    ) => {
      calls.registerFile += 1;
      return { fileId: 99, storagePrice: 1234n, txHash: "0xreg" };
    },
    getFile: async (_fileId: number) => ({
      pieceCid: "baga6ea4synapse",
      storagePrice: 1234n,
      status: 1,
      uploadTime: 1,
      paidTime: 2,
      storedTime: 0,
    }),
    getFileIdByCid: async (_pieceCid: string) => 99,
    depositPayment: async (_fileId: number, _amount: bigint) => {
      calls.depositPayment += 1;
      return "0xpay";
    },
    getFilePaymentStatus: async (_fileId: number) => ({
      hasPayment: true,
      amount: 1234n,
      isReleased: calls.releasePayment > 0,
    }),
    confirmStorage: async (_fileId: number) => {
      calls.confirmStorage += 1;
      return "0xconfirm";
    },
    releasePayment: async (_fileId: number) => {
      calls.releasePayment += 1;
      return "0xrelease";
    },
  };

  return { contract, calls };
}

test("uploadFile uses Synapse upload + contract register and does not auto-pay", async () => {
  const { contract, calls } = buildContractMock();
  const synapse = buildSynapseMock();
  const service = new StorageService({
    contractService: contract as any,
    synapseProvider: () => synapse as any,
    startConfirmationProcessor: false,
  });

  const result = await service.uploadFile(
    Buffer.from("hello world"),
    "hello.txt",
    { purpose: "test" },
  );

  assert.equal(result.fileId, 99);
  assert.equal(result.pieceCid, "baga6ea4synapse");
  assert.equal(result.uploadTxHash, "0xuploadtx");
  assert.equal(result.selectedProvider?.id, 11);
  assert.equal(result.dataSetId, 77);
  assert.equal(calls.registerFile, 1);
  assert.equal(calls.depositPayment, 0);
});

test("payForFile confirms storage and releases payment when piece is retrievable", async () => {
  const { contract, calls } = buildContractMock();
  const synapse = buildSynapseMock({ downloadable: true });
  const service = new StorageService({
    contractService: contract as any,
    synapseProvider: () => synapse as any,
    startConfirmationProcessor: false,
  });

  const payment = await service.payForFile(99);

  assert.equal(payment.fileId, 99);
  assert.equal(payment.status, "paid");
  assert.equal(calls.depositPayment, 1);
  assert.equal(calls.confirmStorage, 1);
  assert.equal(calls.releasePayment, 1);

  const status = await service.getFileStatus(99);
  assert.equal(status.queuedForConfirmation, false);
  assert.equal(status.payment.isReleased, true);
});

test("payForFile does not confirm/release when piece is not retrievable and times out", async () => {
  const { contract, calls } = buildContractMock();
  const synapse = buildSynapseMock({ downloadable: false });
  const service = new StorageService({
    contractService: contract as any,
    synapseProvider: () => synapse as any,
    startConfirmationProcessor: false,
    maxConfirmationAttempts: 1,
  });

  await service.payForFile(99);

  assert.equal(calls.depositPayment, 1);
  assert.equal(calls.confirmStorage, 0);
  assert.equal(calls.releasePayment, 0);

  const status = await service.getFileStatus(99);
  assert.equal(status.queuedForConfirmation, false);
  assert.equal(status.payment.isReleased, false);
});

test("payForFile fails for unknown CID mapping", async () => {
  const { contract } = buildContractMock();
  const synapse = buildSynapseMock();

  (contract as any).getFileIdByCid = async () => 0;

  const service = new StorageService({
    contractService: contract as any,
    synapseProvider: () => synapse as any,
    startConfirmationProcessor: false,
  });

  await assert.rejects(
    async () => service.payForFile("baga6ea4missing"),
    /File not found for payment/,
  );
});

test("ensureFileStored rejects when status is not stored", async () => {
  const { contract } = buildContractMock();
  const synapse = buildSynapseMock();

  (contract as any).getFile = async (_fileId: number) => ({
    pieceCid: "baga6ea4synapse",
    storagePrice: 1234n,
    status: 1,
  });

  const service = new StorageService({
    contractService: contract as any,
    synapseProvider: () => synapse as any,
    startConfirmationProcessor: false,
  });

  await assert.rejects(
    async () => service.ensureFileStored("baga6ea4synapse"),
    /not stored yet/,
  );
});
