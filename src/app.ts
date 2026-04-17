import express from "express";
import cors from "cors";
import helmet from "helmet";

import catalogRouter from "./routes/catalog";
import checkoutRouter from "./routes/checkout";
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

  const allowedOrigins = [
    process.env.FRONTEND_URL ?? "http://localhost:5173",
    "http://localhost:5173",
    "http://localhost:4173",
  ].filter(Boolean);
  app.use(
    cors({
      origin: (origin, callback) => {
        // Allow requests with no origin (curl, Postman, server-to-server)
        if (!origin) return callback(null, true);
        if (allowedOrigins.includes(origin)) return callback(null, true);
        callback(new Error(`CORS: origin ${origin} not allowed`));
      },
      methods: ["GET", "POST", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization"],
      credentials: true,
    }),
  );

  // Raw body for Stripe webhook signature verification — must come BEFORE the global JSON parser
  // so body-parser skips re-reading the already-consumed stream for this path.
  app.use("/api/webhooks/stripe", express.raw({ type: "application/json" }));

  // Global JSON parser — body-parser checks req._body and skips if already parsed (e.g. stripe above)
  app.use(express.json({ limit: "1mb" }));

  app.use("/api/products", catalogRouter);
  app.use("/api/checkout", checkoutRouter);
  app.use("/api/upload", uploadRouter);
  app.use("/api/mockup", mockupsRouter);
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
