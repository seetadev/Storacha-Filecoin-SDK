import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import { config, validateConfig } from "./config/env.js";
import { initializeSynapse, cleanupSynapse } from "./config/synapse.js";
import storageRoutes from "./routes/storage.routes.js";

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging
app.use((req: Request, res: Response, next: NextFunction) => {
  console.log(`${req.method} ${req.path}`);
  next();
});

// Routes
app.use("/api/storage", storageRoutes);

// Health check
app.get("/health", (req: Request, res: Response) => {
  res.json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    network: "calibration",
  });
});

app.get("/", (req: Request, res: Response) => {
  res.json({
    name: "@storacha/fc-backend",
    version: "1.0.0",
    endpoints: {
      health: "GET /health",
      storage: {
        upload: "POST /api/storage/upload",
        download: "GET /api/storage/download/:pieceCid",
        preflight: "GET /api/storage/preflight?size={bytes}",
        account: "GET /api/storage/account",
        setup: "POST /api/storage/setup",
      },
    },
  });
});

// Error handling
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  console.error("❌ Error:", err.message);

  res.status(err.status || 500).json({
    success: false,
    error: err.message || "Internal server error",
    ...(config.nodeEnv === "development" && { stack: err.stack }),
  });
});

// 404 handler
app.use((req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    error: "Not found",
  });
});

// Startup
async function start() {
  try {
    console.log("Starting Backend...\n");

    // Validate configuration
    validateConfig();

    // Initialize Synapse SDK
    await initializeSynapse();

    // Start server
    const server = app.listen(config.port, () => {
      console.log("\n Server ready!");
      console.log(` Listening on http://localhost:${config.port}`);
      console.log(` Environment: ${config.nodeEnv}`);
      console.log(
        ` Max file size: ${(config.upload.maxFileSize / 1024 / 1024).toFixed(2)} MB`,
      );
      console.log("\n Available endpoints:");
      console.log("  GET    /                                   - API info");
      console.log(
        "  GET    /health                             - Health check",
      );
      console.log(
        "  POST   /api/storage/setup                  - Setup account (one-time)",
      );
      console.log(
        "  GET    /api/storage/account                - Get account info",
      );
      console.log(
        "  GET    /api/storage/preflight?size={bytes} - Check upload feasibility",
      );
      console.log("  POST   /api/storage/upload                 - Upload file");
      console.log(
        "  GET    /api/storage/download/:pieceCid     - Download file",
      );
      console.log("\n Quick start:");
      console.log("  1. POST /api/storage/setup (setup account with USDFC)");
      console.log("  2. POST /api/storage/upload (upload your first file)");
      console.log(
        "  3. GET  /api/storage/download/:cid (retrieve your file)\n",
      );
    });

    // Graceful shutdown
    const shutdown = async (signal: string) => {
      console.log(`\n ${signal} received, shutting down gracefully...`);

      server.close(() => {
        console.log("HTTP server closed");
      });

      await cleanupSynapse();

      process.exit(0);
    };

    process.on("SIGTERM", () => shutdown("SIGTERM"));
    process.on("SIGINT", () => shutdown("SIGINT"));
  } catch (error: any) {
    console.error("❌ Failed to start server:", error.message);
    process.exit(1);
  }
}

// Handle unhandled rejections
process.on("unhandledRejection", (reason: any) => {
  console.error("❌ Unhandled Rejection:", reason);
  process.exit(1);
});

start();
