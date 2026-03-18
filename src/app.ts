import express from "express";
import cors from "cors";
import helmet from "helmet";

import catalogRouter from "./routes/catalog";
import uploadRouter from "./routes/upload";
import mockupsRouter from "./routes/mockups";
import ordersRouter from "./routes/orders";
import webhooksRouter from "./routes/webhooks";

export function createApp() {
  const app = express();

  app.set("trust proxy", 1);

  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: "cross-origin" },
    }),
  );

  const allowedOrigin = process.env.FRONTEND_URL ?? "http://localhost:5173";
  app.use(
    cors({
      origin: allowedOrigin,
      methods: ["GET", "POST", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization"],
      credentials: true,
    }),
  );

  // JSON body parser — NOT applied to /webhooks (needs raw body for HMAC if added later)
  app.use(/^\/api\/(?!webhooks)/, express.json({ limit: "1mb" }));

  app.use("/api/products", catalogRouter);
  app.use("/api/upload", uploadRouter);
  app.use("/api/mockups", mockupsRouter);
  app.use("/api/orders", ordersRouter);
  app.use("/api/webhooks", webhooksRouter);

  app.get("/health", (_req, res) => {
    res.json({ status: "ok", ts: new Date().toISOString() });
  });

  app.use((_req, res) => {
    res.status(404).json({ error: "Not found" });
  });

  app.use(
    (
      err: unknown,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      console.error("[unhandled error]", err);
      res.status(500).json({ error: "Internal server error" });
    },
  );

  return app;
}
