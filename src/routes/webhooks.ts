import { Router, Request, Response } from "express";
import Stripe from "stripe";
import { db } from "../db";
import { webhookEvents, orders } from "../db/schema";
import { eq } from "drizzle-orm";

function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not set");
  return new Stripe(key);
}

const router = Router();

// ─────────────────────────────────────────
// Printful IP allowlist
// https://www.printful.com/docs/webhooks — update if Printful changes their ranges
// ─────────────────────────────────────────
const PRINTFUL_IPS = new Set([
  "185.111.212.0/24", // placeholder — replace with real Printful CIDR ranges
  "127.0.0.1", // allow localhost in dev
  "::1",
]);

function ipAllowed(ip: string): boolean {
  if (process.env.NODE_ENV !== "production") return true; // skip check in dev
  return PRINTFUL_IPS.has(ip);
}

// ─────────────────────────────────────────
// Event → internal status mapping
// ─────────────────────────────────────────
const EVENT_STATUS_MAP: Record<string, string> = {
  package_shipped: "shipped",
  package_returned: "returned",
  order_canceled: "cancelled",
  order_failed: "failed",
};

interface PrintfulWebhookPayload {
  type: string;
  created: number;
  retries: number;
  store: number;
  data: Record<string, unknown>;
}

// POST /api/webhooks/printful
router.post("/printful", async (req: Request, res: Response) => {
  const ip =
    (req.headers["x-forwarded-for"] as string | undefined)
      ?.split(",")[0]
      ?.trim() ??
    req.socket.remoteAddress ??
    "";

  if (!ipAllowed(ip)) {
    console.warn(`[webhook] Rejected request from disallowed IP: ${ip}`);
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const payload = req.body as Partial<PrintfulWebhookPayload>;

  if (!payload.type) {
    res.status(400).json({ error: "Missing event type" });
    return;
  }

  const internalStatus = EVENT_STATUS_MAP[payload.type] ?? null;
  const printfulOrderId =
    String(
      (payload.data?.order as Record<string, unknown> | undefined)?.id ?? "",
    ) || null;

  console.log("[webhook] Printful event:", {
    type: payload.type,
    internalStatus,
    printfulOrderId,
    store: payload.store,
  });

  // Persist the event regardless of whether we handle it
  try {
    await db.insert(webhookEvents).values({
      eventType: payload.type,
      internalStatus,
      printfulOrderId,
      store: payload.store ?? null,
      rawPayload: payload,
    });

    // If we have a status update and a matching local order, sync it
    if (internalStatus && printfulOrderId) {
      await db
        .update(orders)
        .set({ status: internalStatus, updatedAt: new Date() })
        .where(eq(orders.printfulOrderId, printfulOrderId));
    }
  } catch (dbErr) {
    // DB errors must not cause Printful to retry — log and acknowledge
    console.error("[webhook] DB write failed:", dbErr);
  }

  res.status(204).end();
});

// ─────────────────────────────────────────
// POST /api/webhooks/stripe
// Verifies Stripe signature then logs the event.
// Raw body is required — express.raw() is applied in app.ts for this path.
// ─────────────────────────────────────────
router.post("/stripe", async (req: Request, res: Response) => {
  const sig = req.headers["stripe-signature"];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    console.error("[webhook/stripe] STRIPE_WEBHOOK_SECRET is not set");
    res.status(500).json({ error: "Webhook secret not configured" });
    return;
  }

  if (!sig || typeof sig !== "string") {
    res.status(400).json({ error: "Missing stripe-signature header" });
    return;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let event: any;
  try {
    event = getStripe().webhooks.constructEvent(
      req.body as Buffer,
      sig,
      webhookSecret,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid signature";
    console.warn("[webhook/stripe] Signature verification failed:", message);
    res.status(400).json({ error: `Webhook verification failed: ${message}` });
    return;
  }

  console.log("[webhook/stripe] Event:", { type: event.type, id: event.id });

  try {
    await db.insert(webhookEvents).values({
      eventType: event.type,
      internalStatus: null,
      printfulOrderId: null,
      store: null,
      rawPayload: event as unknown as Record<string, unknown>,
    });
  } catch (dbErr) {
    // DB errors must not cause Stripe to retry — log and acknowledge
    console.error("[webhook/stripe] DB write failed:", dbErr);
  }

  res.status(200).json({ received: true });
});

export default router;
