import {
  pgTable,
  serial,
  text,
  integer,
  numeric,
  jsonb,
  timestamp,
  index,
} from "drizzle-orm/pg-core";

// ─────────────────────────────────────────
// orders
// One row per Printful order created.
// ─────────────────────────────────────────
export const orders = pgTable(
  "orders",
  {
    id: serial("id").primaryKey(),
    printfulOrderId: text("printful_order_id").notNull().unique(),
    status: text("status").notNull().default("pending"), // pending | shipped | returned | cancelled
    email: text("email").notNull(),
    fullName: text("full_name").notNull(),
    address1: text("address1").notNull(),
    address2: text("address2"),
    city: text("city").notNull(),
    stateCode: text("state_code").notNull(),
    zip: text("zip").notNull(),
    countryCode: text("country_code").notNull(),
    notes: text("notes"),
    // Raw shipping snapshot for reference / re-send
    shippingSnapshot: jsonb("shipping_snapshot"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [index("orders_email_idx").on(t.email)],
);

// ─────────────────────────────────────────
// order_items
// Line items belonging to an order.
// ─────────────────────────────────────────
export const orderItems = pgTable("order_items", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id")
    .notNull()
    .references(() => orders.id, { onDelete: "cascade" }),
  cartItemId: text("cart_item_id").notNull(), // client-generated stable key
  productId: integer("product_id").notNull(),
  variantId: integer("variant_id"),
  name: text("name").notNull(),
  image: text("image").notNull(),
  unitPrice: numeric("unit_price", { precision: 10, scale: 2 }).notNull(),
  quantity: integer("quantity").notNull(),
  // Customization stored as JSON so we don't need a separate table now
  customization: jsonb("customization"),
});

// ─────────────────────────────────────────
// webhook_events
// Append-only log of all Printful webhook calls.
// ─────────────────────────────────────────
export const webhookEvents = pgTable(
  "webhook_events",
  {
    id: serial("id").primaryKey(),
    eventType: text("event_type").notNull(),
    internalStatus: text("internal_status"), // mapped value, null if unhandled
    printfulOrderId: text("printful_order_id"),
    store: integer("store"),
    rawPayload: jsonb("raw_payload").notNull(),
    receivedAt: timestamp("received_at").notNull().defaultNow(),
  },
  (t) => [index("webhook_events_order_idx").on(t.printfulOrderId)],
);
