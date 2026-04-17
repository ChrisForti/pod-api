import { Router, Request, Response } from "express";
import Stripe from "stripe";
import rateLimit from "express-rate-limit";
import { CartItem } from "../types";
import { sanitize } from "../lib/validate";

const router = Router();

function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not set");
  return new Stripe(key);
}

// Rate-limit: 20 session creates per minute per IP
const checkoutLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests. Please try again in a minute." },
});

// ─────────────────────────────────────────
// POST /api/checkout
// Creates a Stripe Checkout Session for the given cart items.
// Returns { url, sessionId } — frontend redirects the user to `url`.
// After payment Stripe redirects to /checkout/success?session_id=…
// ─────────────────────────────────────────
router.post("/", checkoutLimiter, async (req: Request, res: Response) => {
  const body = (req.body ?? {}) as { items?: unknown };

  if (!Array.isArray(body.items) || body.items.length === 0) {
    res.status(400).json({ error: "items must be a non-empty array" });
    return;
  }

  const items = body.items as CartItem[];

  for (const item of items) {
    if (typeof item.name !== "string" || !item.name.trim()) {
      res.status(400).json({ error: "Each item must have a name" });
      return;
    }
    if (typeof item.unitPrice !== "number" || item.unitPrice <= 0) {
      res
        .status(400)
        .json({ error: "Each item must have a positive unitPrice" });
      return;
    }
    if (!Number.isInteger(item.quantity) || item.quantity < 1) {
      res
        .status(400)
        .json({ error: "Each item must have a positive integer quantity" });
      return;
    }
  }

  const frontendUrl = process.env.FRONTEND_URL ?? "http://localhost:5173";

  const lineItems = items.map((item) => ({
    price_data: {
      currency: "usd",
      product_data: {
        name: sanitize(item.name),
        // Only include images if the URL is a valid absolute URL
        ...(typeof item.image === "string" && item.image.startsWith("http")
          ? { images: [item.image] }
          : {}),
      },
      unit_amount: Math.round(item.unitPrice * 100), // Stripe expects cents
    },
    quantity: item.quantity,
  }));

  try {
    const stripe = getStripe();
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: lineItems,
      success_url: `${frontendUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${frontendUrl}/checkout/cancel`,
      metadata: {
        // Store cart item ids (up to 500 chars total — Stripe metadata limit)
        cartItemIds: items
          .map((i) => i.id)
          .join(",")
          .slice(0, 500),
      },
    });

    res.json({ url: session.url, sessionId: session.id });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to create checkout session";
    res.status(502).json({ error: message });
  }
});

export default router;
