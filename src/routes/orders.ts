import { Router, Request, Response } from "express";
import rateLimit from "express-rate-limit";
import { CartItem, OrderDraft } from "../types";
import { createPrintfulOrder, getPrintfulOrder } from "../services/printful";
import { sanitize, validateOrderDraft } from "../lib/validate";
import { db } from "../db";
import { orders, orderItems } from "../db/schema";

const router = Router();

// Rate-limit order creation: 10 requests per minute per IP
const orderLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests. Please try again in a minute." },
});

// ─────────────────────────────────────────
// Map CartItem[] → Printful order line items
// ─────────────────────────────────────────

function buildPrintfulPayload(draft: OrderDraft): Record<string, unknown> {
  const { shipping } = draft;

  const recipient = {
    name: sanitize(shipping.fullName),
    email: sanitize(shipping.email),
    phone: shipping.phone ? sanitize(shipping.phone) : undefined,
    address1: sanitize(shipping.address1),
    address2: shipping.address2 ? sanitize(shipping.address2) : undefined,
    city: sanitize(shipping.city),
    state_code: sanitize(shipping.stateCode),
    zip: sanitize(shipping.zip),
    country_code: sanitize(shipping.countryCode),
  };

  const items = draft.items.map((item: CartItem) => {
    const files: Record<string, unknown>[] = [];

    if (item.customization?.logoUrl) {
      files.push({
        type: "front",
        url: item.customization.logoUrl,
      });
    }

    return {
      sync_variant_id: item.variantId,
      quantity: item.quantity,
      retail_price: item.unitPrice.toFixed(2),
      name: sanitize(item.name),
      files: files.length > 0 ? files : undefined,
    };
  });

  return {
    recipient,
    items,
    notes: draft.notes ? sanitize(draft.notes) : undefined,
  };
}

// ─────────────────────────────────────────
// Routes
// ─────────────────────────────────────────

// POST /api/orders
router.post("/", orderLimiter, async (req: Request, res: Response) => {
  const validation = validateOrderDraft(req.body);
  if (!validation.valid) {
    res.status(400).json({ error: validation.error });
    return;
  }

  const draft = validation.data;
  const payload = buildPrintfulPayload(draft);

  try {
    const result = await createPrintfulOrder(payload);

    // Persist to DB — insert order + line items in a transaction
    const [newOrder] = await db
      .insert(orders)
      .values({
        printfulOrderId: String(result.id),
        status: String(result.status ?? "pending"),
        email: sanitize(draft.shipping.email),
        fullName: sanitize(draft.shipping.fullName),
        address1: sanitize(draft.shipping.address1),
        address2: draft.shipping.address2
          ? sanitize(draft.shipping.address2)
          : null,
        city: sanitize(draft.shipping.city),
        stateCode: sanitize(draft.shipping.stateCode),
        zip: sanitize(draft.shipping.zip),
        countryCode: sanitize(draft.shipping.countryCode),
        notes: draft.notes ? sanitize(draft.notes) : null,
        shippingSnapshot: draft.shipping,
      })
      .returning({ id: orders.id });

    if (newOrder && draft.items.length > 0) {
      await db.insert(orderItems).values(
        draft.items.map((item: CartItem) => ({
          orderId: newOrder.id,
          cartItemId: item.id,
          productId: item.productId,
          variantId: item.variantId ?? null,
          name: sanitize(item.name),
          image: item.image,
          unitPrice: String(item.unitPrice),
          quantity: item.quantity,
          customization: item.customization ?? null,
        })),
      );
    }

    res.status(201).json({ orderId: result.id, status: result.status });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to create order";
    res.status(502).json({ error: message });
  }
});

// GET /api/orders/:orderId
router.get("/:orderId", async (req: Request, res: Response) => {
  const orderId = req.params.orderId;

  if (!orderId || !/^[\w-]+$/.test(orderId)) {
    res.status(400).json({ error: "Invalid order id" });
    return;
  }

  try {
    const raw = await getPrintfulOrder(orderId);

    // Normalize — only expose safe fields to the client
    res.json({
      orderId: raw.id,
      externalId: raw.external_id,
      status: raw.status,
      shipping: raw.shipping,
      trackingNumber: (
        raw.shipments as Record<string, unknown>[] | undefined
      )?.[0]?.tracking_number,
      created: raw.created,
      updated: raw.updated,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to fetch order";
    const status = message === "Not found" ? 404 : 502;
    res.status(status).json({ error: message });
  }
});

export default router;
