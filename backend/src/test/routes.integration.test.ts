import assert from "node:assert/strict";
import test from "node:test";
import type { NextFunction, Request, Response } from "express";

import { createStorageRouter } from "../routes/storage.routes.js";
import { getUcanService } from "../services/ucan.service.js";

process.env.FILECOIN_PRIVATE_KEY =
  process.env.FILECOIN_PRIVATE_KEY ||
  "0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

type MockStorageService = {
  preflightCheck: (size: number) => Promise<any>;
  uploadFile: (
    buffer: Buffer,
    filename: string,
    metadata?: Record<string, any>,
  ) => Promise<any>;
  payForFile: (fileIdOrCid: number | string) => Promise<any>;
  getFileStatus: (fileIdOrCid: number | string) => Promise<any>;
  ensureFileStored: (pieceCid: string) => Promise<void>;
  downloadFile: (
    pieceCid: string,
  ) => Promise<{ data: Uint8Array; size: number }>;
  getAccountInfo: () => Promise<any>;
  setupAccount: (depositAmount?: string) => Promise<any>;
};

type MockResponse = Response & {
  statusCode: number;
  body: any;
  headers: Record<string, string | number>;
  sentData?: any;
};

function createMockStorageService(): MockStorageService {
  return {
    preflightCheck: async () => ({ canUpload: true }),
    uploadFile: async () => ({
      fileId: 1,
      pieceCid: "baga6ea4upload",
      size: 10,
    }),
    payForFile: async (fileIdOrCid) => ({
      fileId: Number(fileIdOrCid) || 1,
      pieceCid: "baga6ea4upload",
      amount: "1000",
      paymentTxHash: "0xpay",
      status: "paid",
      confirmationQueued: true,
    }),
    getFileStatus: async () => ({ fileId: 1, status: 1 }),
    ensureFileStored: async () => undefined,
    downloadFile: async () => ({ data: new Uint8Array([1, 2, 3]), size: 3 }),
    getAccountInfo: async () => ({ totalFunds: "100" }),
    setupAccount: async () => ({ success: true }),
  };
}

function makeReq(overrides: Partial<Request>): Request {
  return {
    body: {},
    params: {},
    query: {},
    headers: {},
    path: "",
    ...overrides,
  } as Request;
}

function makeRes(): MockResponse {
  const res: any = {
    statusCode: 200,
    body: undefined,
    headers: {} as Record<string, string | number>,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: any) {
      this.body = payload;
      return this;
    },
    setHeader(name: string, value: string | number) {
      this.headers[name.toLowerCase()] = value;
      return this;
    },
    send(payload: any) {
      this.sentData = payload;
      return this;
    },
  };

  return res;
}

function findRouteHandlers(
  router: any,
  method: "get" | "post",
  path: string,
): Array<(req: Request, res: Response, next: NextFunction) => any> {
  const layer = router.stack.find(
    (entry: any) =>
      entry.route && entry.route.path === path && entry.route.methods[method],
  );
  if (!layer) {
    throw new Error(`Route ${method.toUpperCase()} ${path} not found`);
  }
  return layer.route.stack.map((stackLayer: any) => stackLayer.handle);
}

test("upload handler returns 201 and calls upload when preflight passes", async () => {
  const mock = createMockStorageService();
  const router = createStorageRouter(mock as any);
  const handlers = findRouteHandlers(router, "post", "/upload");
  const uploadHandler = handlers[1];

  let preflightSize = 0;
  let uploadedFilename = "";
  mock.preflightCheck = async (size) => {
    preflightSize = size;
    return { canUpload: true };
  };
  mock.uploadFile = async (_buffer, filename) => {
    uploadedFilename = filename;
    return { fileId: 7, pieceCid: "baga6ea4ok", size: 12 };
  };

  const req = makeReq({
    file: {
      buffer: Buffer.from("hello world"),
      originalname: "hello.txt",
      size: 11,
      mimetype: "text/plain",
    } as any,
  });
  const res = makeRes();

  await uploadHandler(req, res, () => undefined);

  assert.equal(res.statusCode, 201);
  assert.equal(res.body.success, true);
  assert.equal(res.body.data.fileId, 7);
  assert.equal(uploadedFilename, "hello.txt");
  assert.equal(preflightSize, 11);
});

test("upload handler returns 402 when preflight fails", async () => {
  const mock = createMockStorageService();
  const router = createStorageRouter(mock as any);
  const handlers = findRouteHandlers(router, "post", "/upload");
  const uploadHandler = handlers[1];

  mock.preflightCheck = async () => ({ canUpload: false });

  const req = makeReq({
    file: {
      buffer: Buffer.from("hello"),
      originalname: "hello.txt",
      size: 5,
      mimetype: "text/plain",
    } as any,
  });
  const res = makeRes();

  await uploadHandler(req, res, () => undefined);

  assert.equal(res.statusCode, 402);
  assert.equal(res.body.success, false);
  assert.match(res.body.error, /Insufficient allowance/);
});

test("pay route validates body and status route parses id/cid", async () => {
  const mock = createMockStorageService();
  const router = createStorageRouter(mock as any);

  const payHandler = findRouteHandlers(router, "post", "/pay")[0];
  const statusHandler = findRouteHandlers(
    router,
    "get",
    "/status/:fileIdOrCid",
  )[0];

  const badReq = makeReq({ body: {} });
  const badRes = makeRes();
  await payHandler(badReq, badRes, () => undefined);
  assert.equal(badRes.statusCode, 400);

  let payArg: number | string | null = null;
  let statusArg: number | string | null = null;
  mock.payForFile = async (fileIdOrCid) => {
    payArg = fileIdOrCid;
    return { fileId: 42, pieceCid: "baga6ea4paid" };
  };
  mock.getFileStatus = async (fileIdOrCid) => {
    statusArg = fileIdOrCid;
    return { fileId: 42, status: 1 };
  };

  const okReq = makeReq({ body: { fileId: 42 } });
  const okRes = makeRes();
  await payHandler(okReq, okRes, () => undefined);
  assert.equal(okRes.statusCode, 200);
  assert.equal(payArg, 42);

  const idReq = makeReq({ params: { fileIdOrCid: "42" } as any });
  const idRes = makeRes();
  await statusHandler(idReq, idRes, () => undefined);
  assert.equal(idRes.statusCode, 200);
  assert.equal(statusArg, 42);

  const cidReq = makeReq({ params: { fileIdOrCid: "baga6ea4paid" } as any });
  const cidRes = makeRes();
  await statusHandler(cidReq, cidRes, () => undefined);
  assert.equal(cidRes.statusCode, 200);
  assert.equal(statusArg, "baga6ea4paid");
});

test("download middleware enforces UCAN and download handler enforces stored status", async () => {
  const pieceCid = "baga6ea4download";
  const mock = createMockStorageService();
  const router = createStorageRouter(mock as any);
  const [downloadAuthMiddleware, downloadHandler] = findRouteHandlers(
    router,
    "get",
    "/download/:pieceCid",
  );

  const unauthReq = makeReq({
    params: { pieceCid } as any,
    headers: {} as any,
    path: `/download/${pieceCid}`,
  });
  const unauthRes = makeRes();
  await downloadAuthMiddleware(unauthReq, unauthRes, () => undefined);
  assert.equal(unauthRes.statusCode, 401);

  const token = (
    await getUcanService().generateDownloadToken({
      pieceCid,
      expiresInSeconds: 120,
    })
  ).token;
  const authReq = makeReq({
    params: { pieceCid } as any,
    headers: { authorization: `Bearer ${token}` } as any,
    path: `/download/${pieceCid}`,
  });
  const authRes = makeRes();
  let nextCalled = false;
  await downloadAuthMiddleware(authReq, authRes, () => {
    nextCalled = true;
  });
  assert.equal(nextCalled, true);

  mock.ensureFileStored = async () => {
    throw new Error("File is not stored yet");
  };
  let propagated: Error | null = null;
  await downloadHandler(authReq, makeRes(), (err?: any) => {
    propagated = err;
  });
  assert.ok(propagated);
  assert.match((propagated as Error).message, /not stored yet/);

  mock.ensureFileStored = async () => undefined;
  mock.downloadFile = async () => ({
    data: new Uint8Array([9, 8, 7]),
    size: 3,
  });
  const okRes = makeRes();
  await downloadHandler(authReq, okRes, () => undefined);
  assert.equal(okRes.statusCode, 200);
  assert.deepEqual(Array.from(okRes.sentData as Uint8Array), [9, 8, 7]);
  assert.equal(okRes.headers["content-length"], 3);
});
