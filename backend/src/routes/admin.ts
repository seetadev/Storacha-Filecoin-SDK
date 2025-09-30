import express from "express";
import * as adminController from "../controllers/adminController";
import { isAdmin } from "../middlewares/middleware.js";

export const adminRouter = express.Router();

adminRouter.use(isAdmin);

adminRouter.post("/updateRate", adminController.UpdateRateRoute);
adminRouter.post("/updateMinDuration", adminController.UpdateMinDuration);
