import express from "express";
import * as adminController from "../controllers/admin.controller.js";
import { isAdmin } from "../middlewares/middleware.js";

export const adminRouter = express.Router();

adminRouter.use(isAdmin);

adminRouter.post("/updateRate", adminController.updateRate);
adminRouter.post("/updateMinDuration", adminController.updateMinDuration);
