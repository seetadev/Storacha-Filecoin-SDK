import { Router, Request, Response, NextFunction } from "express";
import multer from "multer";
import { StorageService } from "../services/storage.service.js";
import { config } from "../config/env.js";

const router: Router = Router();
const storageService = new StorageService();

// Configure multer for in-memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: config.upload.maxFileSize,
  },
});

/**
 * POST /api/storage/upload
 * Upload a file to Filecoin
 */
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

      // Optional preflight check
      const preflight = await storageService.preflightCheck(req.file.size);
      if (!preflight.canUpload) {
        return res.status(402).json({
          success: false,
          error: "Insufficient allowance for upload",
          preflight,
        });
      }

      // Upload file
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

/**
 * GET /api/storage/download/:pieceCid
 * Download a file from Filecoin
 */
router.get(
  "/download/:pieceCid",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { pieceCid } = req.params;

      console.log(`\n Download request: ${pieceCid}`);

      // Download file
      const downloadResult = await storageService.downloadFile(pieceCid);

      // Set headers for file download
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

/**
 * GET /api/storage/preflight
 * Check if upload is possible
 */
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

/**
 * GET /api/storage/account
 * Get account information
 */
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

/**
 * POST /api/storage/setup
 * Setup account (deposit and approve service)
 */
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

/**
 * @route POST /api/storage/sync-price
 * @desc Fetch network price via Synapse and update FileRegistry smart contract
 */
router.post(
  "/sync-price",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      console.log("\Syncing Dynamic Storage Price");
      const result = await storageService.syncStoragePrice();

      res.json({
        success: true,
        data: result,
      });
    } catch (error: any) {
      console.error("Sync price endpoint error:", error);
      next(error);
    }
  }
);

router.post('/subscribe', async (req, res) => {
  try {
    const { planSizeGB } = req.body;

    if (!planSizeGB || typeof planSizeGB !== 'number') {
      return res.status(400).json({ 
        success: false, 
        error: "Missing or invalid planSizeGB. Please provide a number." 
      });
    }

    // Assuming your StorageService is instantiated as 'storageService'
    const result = await storageService.subscribeStorage(planSizeGB);
    
    res.json({ success: true, data: result });
  } catch (error: any) {
    console.error("Subscription endpoint error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Allow uploading up to 50 files in a single dataset batch
router.post('/dataset/upload', upload.array('files', 50), async (req, res) => {
  try {
    const files = req.files as Express.Multer.File[];

    if (!files || files.length === 0) {
      return res.status(400).json({ 
        success: false, 
        error: "No files uploaded. Please attach files to the 'files' field." 
      });
    }

    const result = await storageService.uploadDataset(files);
    
    res.json({ 
      success: true, 
      message: "AI Dataset successfully bundled and registered on-chain",
      data: result 
    });

  } catch (error: any) {
    console.error("Dataset upload endpoint error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/dataset/pay', async (req, res) => {
  try {
    const { datasetId } = req.body;

    if (!datasetId) {
      return res.status(400).json({ success: false, error: "Missing datasetId" });
    }

    const result = await storageService.payDataset(Number(datasetId));
    res.json({ success: true, data: result });
  } catch (error: any) {
    console.error("Dataset payment endpoint error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});
export default router;
