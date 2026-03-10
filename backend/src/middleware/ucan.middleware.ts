import { Request, Response, NextFunction } from "express";
import { getUcanService, UcanCapability } from "../services/ucan.service.js";

declare global {
  namespace Express {
    interface Request {
      ucan?: {
        valid: boolean;
        decoded?: any;
        capabilities?: UcanCapability[];
        error?: string;
      };
    }
  }
}

export interface UcanMiddlewareOptions {
  required?: boolean;
  capability?: UcanCapability;
  skipPaths?: string[];
}

export function ucanAuth(options: UcanMiddlewareOptions = {}) {
  const {
    required = true,
    capability,
    skipPaths = [],
  } = options;

  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (skipPaths.some(path => req.path.includes(path))) {
        return next();
      }

      const ucanService = getUcanService();

      const authHeader = req.headers.authorization;
      if (!authHeader) {
        if (required) {
          return res.status(401).json({
            success: false,
            error: "Missing Authorization header. Expected: 'Bearer <ucan-token>'",
          });
        }
        return next();
      }

      const parts = authHeader.split(' ');
      if (parts.length !== 2 || parts[0] !== 'Bearer') {
        if (required) {
          return res.status(401).json({
            success: false,
            error: "Invalid Authorization header format. Expected: 'Bearer <ucan-token>'",
          });
        }
        return next();
      }

      const token = parts[1];
      const validation = await ucanService.validateToken(token, capability);

      req.ucan = validation;

      if (!validation.valid && required) {
        return res.status(403).json({
          success: false,
          error: `UCAN validation failed: ${validation.error}`,
        });
      }

      next();
    } catch (error) {
      console.error("UCAN middleware error:", error);

      if (required) {
        return res.status(500).json({
          success: false,
          error: "Internal server error during UCAN validation",
        });
      }

      next();
    }
  };
}

export function requireDownloadCapability(pieceCid?: string) {
  return ucanAuth({
    required: true,
    capability: {
      resource: pieceCid ? `storacha:file:${pieceCid}` : "storacha:file:*",
      action: "download",
      constraints: pieceCid ? { pieceCid } : undefined,
    },
  });
}

export function requireUploadCapability() {
  return ucanAuth({
    required: true,
    capability: {
      resource: "storacha:file:*",
      action: "upload",
    },
  });
}

export function optionalUcanAuth() {
  return ucanAuth({
    required: false,
  });
}

export function requireAdminCapability() {
  return ucanAuth({
    required: true,
    capability: {
      resource: "storacha:*",
      action: "read",
    },
  });
}

export function dynamicDownloadCapability() {
  return async (req: Request, res: Response, next: NextFunction) => {
    const pieceCid = req.params.pieceCid || req.params.cid;

    if (!pieceCid) {
      return res.status(400).json({
        success: false,
        error: "Missing pieceCid in request parameters",
      });
    }

    const middleware = requireDownloadCapability(pieceCid);
    return middleware(req, res, next);
  };
}
