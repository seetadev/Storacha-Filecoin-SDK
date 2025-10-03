import { Router } from "express";
import * as userController from "../controllers/userController";
export const userRouter = Router();

userRouter.get("/getUserUploadHistory", userController.GetUserUploadHistory);
userRouter.post("/createDelegation", userController.CreateDelegation);
//userRouter.post("/uploadFileEntry");//
