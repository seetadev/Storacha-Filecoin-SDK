import { Request, Response } from "express";
import { getUserHistory } from "../services/userService";
import { INTERNAL_SERVER_ERROR_CODE, SUCCESS_CODE } from "../lib/constants";
import { createUCANDelegation } from "../services/storachaService";
/**
 * Function to get user upload history
 * @param req
 * @param res
 * @returns
 */
export const GetUserUploadHistory = async (req: Request, res: Response) => {
  try {
    const userAddress = req.query.userAddress as string;
    if (userAddress === null || userAddress === undefined) {
      return res.status(INTERNAL_SERVER_ERROR_CODE).json({
        message: "bad request",
      });
    }
    const userHistory = await getUserHistory(userAddress);
    return res.status(SUCCESS_CODE).json({
      userHistory: userHistory,
      userAddress: userAddress,
    });
  } catch (err) {
    return res.status(INTERNAL_SERVER_ERROR_CODE).json({
      message: "Error getting the user history",
    });
  }
};

/**
 *
 */
export const CreateDelegation = async (req: Request, res: Response) => {
  try {
    const { recipientDID, deadline, notBefore, baseCapabilities, fileCID } =
      req.body;

    const archive = await createUCANDelegation(
      recipientDID,
      deadline,
      notBefore,
      baseCapabilities,
      fileCID
    );
    if (archive === undefined) {
      return res.status(INTERNAL_SERVER_ERROR_CODE).json({
        message: "Unable to create Delegation",
        delegation: undefined,
      });
    }
    return res.status(SUCCESS_CODE).json({
      message: "Delegation created successfully",
      delegation: Buffer.from(archive).toString("base64"),
    });
  } catch (err) {
    return res.status(INTERNAL_SERVER_ERROR_CODE).json({
      message: "Unable to create Delegation initial error",
      delegation: undefined,
    });
  }
};
