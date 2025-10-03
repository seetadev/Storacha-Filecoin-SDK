import { eq } from "drizzle-orm";
import { db } from "../db/db.js";
import { depositAccount } from "../db/schema.js";

/**
 *
 * @param wallet
 * @returns
 */
export const getUserHistory = async (wallet: string) => {
  try {
    const userAddres = wallet.toLowerCase();
    const userFiles = await db
      .select()
      .from(depositAccount)
      .where(eq(depositAccount.deposit_key, userAddres));
    return userFiles;
  } catch (err) {
    console.log("Error getting user history", err);
    return undefined;
  }
};
