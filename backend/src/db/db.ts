import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import dotenv from "dotenv";
dotenv.config();

if (!process.env.DATABASE_URL) {
  console.log("Invalid Db url present");
  process.exit();
}
const sql = neon(process.env.DATABASE_URL!);
export const db = drizzle({ client: sql });
