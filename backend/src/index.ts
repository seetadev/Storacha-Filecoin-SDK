import express from "express";
import { Request, Response } from "express";
import dotenv from "dotenv";
import cors from "cors";
import { adminRouter } from "./routes/admin";
import { userRouter } from "./routes/user";
dotenv.config();
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

dotenv.config();

/**
 *  Validate all required env variables upfront
 */
function validateEnv() {
  const requiredVars = ["DATABASE_URL", "ADMIN_API_KEY"];
  const missing = requiredVars.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    console.log(missing);
    throw new Error(
      `Missing required environment variables: ${missing.join(", ")}`
    );
  }
}

validateEnv();
app.use(cors());
app.use(express.json());

app.use("/api/admin", adminRouter);
app.use("/api/user", userRouter);

app.get("/", (req: Request, res: Response) => {
  res.send("Hello from Express + TypeScript backend 🚀");
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
