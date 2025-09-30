import { db } from "../db/db";
import { configTable } from "../db/schema";
/**
 *
 * @param rate
 * @returns
 */
export const updateRate = async (rate: number) => {
  try {
    const result = await db
      .update(configTable)
      .set({
        rate_per_byte_per_day: rate,
      })
      .returning();
    return result[0]?.rate_per_byte_per_day;
  } catch (err: any) {
    throw new Error("Error uploading the rate of filecoin", err?.message);
  }
};

/**
 *
 * @param minDuration
 * @returns
 */
export const updateMinDuration = async (minDuration: number) => {
  try {
    const result = await db
      .update(configTable)
      .set({
        min_duration_days: minDuration,
      })
      .returning();
    return result[0]?.min_duration_days;
  } catch (err: any) {
    throw new Error(
      "Error uploading the minimum duration of filecoin",
      err?.message
    );
  }
};
