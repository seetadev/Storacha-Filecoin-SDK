import { INTERNAL_SERVER_ERROR_CODE, SUCCESS_CODE } from "../lib/constants";
import { updateMinDuration, updateRate } from "../services/adminService";
import { Response, Request } from "express";
/**
 * Route to update the price of the
 * @param req
 * @param res
 * @returns
 */
export const UpdateRateRoute = async (req: Request, res: Response) => {
  try {
    const { rate } = req.body;
    const result = await updateRate(rate);
    if (result === undefined) {
      return res
        .status(INTERNAL_SERVER_ERROR_CODE)
        .json({ error: "Failed to update rate" });
    }
    return res.status(SUCCESS_CODE).json({
      message: "Successfully updated the rate per file",
      value: result,
    });
  } catch (err) {
    console.log("The error is", err);
    return res
      .status(INTERNAL_SERVER_ERROR_CODE)
      .json({ error: "Failed to update rate" });
  }
};

/**
 * Function to update the Minimum Duration
 * @returns
 */
export const UpdateMinDuration = async (req: Request, res: Response) => {
  try {
    const { duration } = req.body; // duration should be kept in seconds easier to handle
    const daysInSeconds = duration * 86400;
    const result = await updateMinDuration(daysInSeconds);
    if (result === undefined) {
      return res
        .status(INTERNAL_SERVER_ERROR_CODE)
        .json({ error: "Failed to update minimum duration" });
    }
    return res.status(200).json({
      message: "Successfully updated the minimum Duration",
      value: result,
    });
  } catch (err) {
    console.log("The error is", err);
    return res.status(500).json({ error: "Failed to update rate" });
  }
};
