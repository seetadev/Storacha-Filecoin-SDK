import { Router, Request, Response, NextFunction } from "express";
import multer from "multer";
import { StorageService } from "../services/storage.service.js";
import { getUcanService } from "../services/ucan.service.js";
import { dynamicDownloadCapability } from "../middleware/ucan.middleware.js";
import { config } from "../config/env.js";

const router: Router = Router();
const storageService = new StorageService();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: config.upload.maxFileSize,
  },
});

router.post(
  "/upload",
  upload.single("file"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          error: "No file provided",
        });
      }

      console.log(`\n Upload request:`);
      console.log(`   Filename: ${req.file.originalname}`);
      console.log(`   Size: ${req.file.size} bytes`);
      console.log(`   MIME type: ${req.file.mimetype}`);

      const preflight = await storageService.preflightCheck(req.file.size);
      if (!preflight.canUpload) {
        return res.status(402).json({
          success: false,
          error: "Insufficient allowance for upload",
          preflight,
        });
      }

      const uploadResult = await storageService.uploadFile(
        req.file.buffer,
        req.file.originalname,
        {
          mimeType: req.file.mimetype,
          originalSize: req.file.size,
        },
      );

      res.status(201).json({
        success: true,
        data: uploadResult,
      });
    } catch (error: any) {
      console.error("Upload error:", error);
      next(error);
    }
  },
);

router.get(
  "/download/:pieceCid",
  dynamicDownloadCapability(),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { pieceCid } = req.params;

      console.log(`\n Download request: ${pieceCid}`);
      console.log(`UCAN validation: ${req.ucan?.valid ? 'VALID' : 'INVALID'}`);

      const downloadResult = await storageService.downloadFile(pieceCid);

      res.setHeader("Content-Type", "application/octet-stream");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${pieceCid}"`,
      );
      res.setHeader("Content-Length", downloadResult.size);

      res.send(Buffer.from(downloadResult.data));
    } catch (error: any) {
      console.error("Download error:", error);
      next(error);
    }
  },
);

router.get(
  "/preflight",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const fileSize = parseInt(req.query.size as string);

      if (!fileSize || fileSize <= 0) {
        return res.status(400).json({
          success: false,
          error: "Valid file size required (query param: size)",
        });
      }

      const preflight = await storageService.preflightCheck(fileSize);

      res.json({
        success: true,
        data: preflight,
      });
    } catch (error: any) {
      console.error("Preflight error:", error);
      next(error);
    }
  },
);

router.get(
  "/account",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const accountInfo = await storageService.getAccountInfo();

      res.json({
        success: true,
        data: accountInfo,
      });
    } catch (error: any) {
      console.error("Account info error:", error);
      next(error);
    }
  },
);

router.post(
  "/setup",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { depositAmount } = req.body;

      console.log("\n Setting up storage account...");

      const result = await storageService.setupAccount(depositAmount);

      res.json({
        success: true,
        data: result,
      });
    } catch (error: any) {
      console.error("Setup error:", error);
      next(error);
    }
  },
);

router.post(
  "/ucan/download-token",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { pieceCid, expiresInSeconds } = req.body;

      if (!pieceCid) {
        return res.status(400).json({
          success: false,
          error: "pieceCid is required",
        });
      }

      console.log(`\n Generating download UCAN token for: ${pieceCid}`);

      const ucanService = getUcanService();
      const tokenResponse = await ucanService.generateDownloadToken({
        pieceCid,
        expiresInSeconds: expiresInSeconds || 3600,
      });

      res.json({
        success: true,
        data: tokenResponse,
      });
    } catch (error: any) {
      console.error("UCAN token generation error:", error);
      next(error);
    }
  },
);

router.post(
  "/ucan/upload-token",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { expiresInSeconds } = req.body;

      console.log("\n Generating upload UCAN token");

      const ucanService = getUcanService();
      const tokenResponse = await ucanService.generateUploadToken({
        expiresInSeconds: expiresInSeconds || 1800,
      });

      res.json({
        success: true,
        data: tokenResponse,
      });
    } catch (error: any) {
      console.error("UCAN upload token generation error:", error);
      next(error);
    }
  },
);

router.get(
  "/ucan/issuer",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const ucanService = getUcanService();
      const issuerDID = ucanService.getIssuerDID();

      res.json({
        success: true,
        data: {
          issuer: issuerDID,
          service: "Storacha Filecoin Storage",
        },
      });
    } catch (error: any) {
      console.error("UCAN issuer info error:", error);
      next(error);
    }
  },
);

router.post(
  "/ucan/validate",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { token, requiredCapability } = req.body;

      if (!token) {
        return res.status(400).json({
          success: false,
          error: "token is required",
        });
      }

      console.log("\n Validating UCAN token");

      const ucanService = getUcanService();
      const validation = await ucanService.validateToken(token, requiredCapability);

      res.json({
        success: true,
        data: validation,
      });
    } catch (error: any) {
      console.error("UCAN validation error:", error);
      next(error);
    }
  },
);

export default router;
