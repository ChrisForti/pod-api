import dotenv from "dotenv";
dotenv.config({ path: process.env.DOTENV_CONFIG_PATH ?? ".env" });

import { createApp } from "./app";

// ─────────────────────────────────────────
// Validate required environment variables at startup
// ─────────────────────────────────────────
const REQUIRED_ENV = [
  "PRINTFUL_API_KEY",
  "PRINTFUL_STORE_ID",
  "S3_BUCKET_NAME",
  "DATABASE_URL",
];
for (const key of REQUIRED_ENV) {
  if (!process.env[key]) {
    console.error(`[startup] Missing required environment variable: ${key}`);
    process.exit(1);
  }
}

const app = createApp();
const PORT = parseInt(process.env.SERVER_PORT ?? "3001", 10);
const allowedOrigin = process.env.FRONTEND_URL ?? "http://localhost:5173";

app.listen(PORT, () => {
  console.log(`[server] Listening on port ${PORT}`);
  console.log(`[server] CORS origin: ${allowedOrigin}`);
});
