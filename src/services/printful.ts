import { Product, ProductVariant } from "../types";

const PRINTFUL_BASE = "https://api.printful.com";

// ─────────────────────────────────────────
// Custom error for 404s from Printful
// ─────────────────────────────────────────
export class PrintfulNotFoundError extends Error {
  constructor() {
    super("Not found");
    this.name = "PrintfulNotFoundError";
  }
}

// ─────────────────────────────────────────
// Internal fetch wrapper
// The API key is NEVER logged or returned to the client.
// ─────────────────────────────────────────
function buildHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${process.env.PRINTFUL_API_KEY}`,
    "Content-Type": "application/json",
    "X-PF-Store-Id": process.env.PRINTFUL_STORE_ID ?? "",
  };
}

interface PrintfulEnvelope<T> {
  code: number;
  result: T;
  error?: string | Record<string, unknown>;
}

async function pfFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const url = `${PRINTFUL_BASE}${path}`;

  const res = await fetch(url, {
    ...options,
    headers: {
      ...buildHeaders(),
      ...(options.headers as Record<string, string> | undefined),
    },
  });

  let data: PrintfulEnvelope<T>;
  try {
    data = (await res.json()) as PrintfulEnvelope<T>;
  } catch {
    throw new Error(
      `Printful returned a non-JSON response (HTTP ${res.status})`,
    );
  }

  if (res.status === 404) throw new PrintfulNotFoundError();

  if (!res.ok) {
    const errMsg =
      typeof data.error === "string"
        ? data.error
        : data.error
          ? JSON.stringify(data.error)
          : `Printful API error: HTTP ${res.status}`;
    throw new Error(errMsg);
  }

  return data.result;
}

// ─────────────────────────────────────────
// Mapping helpers
// ─────────────────────────────────────────

/** Strip HTML and control characters from a string returned by Printful. */
function cleanString(value: unknown): string {
  if (typeof value !== "string") return "";
  return value
    .replace(/<[^>]*>/g, "")
    .replace(/[\x00-\x1F\x7F]/g, "")
    .trim();
}

function mapVariant(v: Record<string, unknown>): ProductVariant {
  const options = Array.isArray(v.options)
    ? (v.options as Record<string, unknown>[])
    : [];
  const colorOpt = options.find((o) => o.id === "color");
  const sizeOpt = options.find((o) => o.id === "size");

  // Sync variants from /store/products/:id don't have an options array —
  // they encode color and size in `name` as "Color / Size" (e.g. "White / XS").
  // Fall back to splitting the name when options lookup yields nothing.
  let color = cleanString(colorOpt?.value);
  let size = cleanString(sizeOpt?.value);
  if (
    (!color || !size) &&
    typeof v.name === "string" &&
    v.name.includes(" / ")
  ) {
    const [namePart1, namePart2, ...rest] = v.name.split(" / ");
    // Printful convention: first segment is color, second is size
    if (!color) color = cleanString(namePart1);
    if (!size) size = cleanString([namePart2, ...rest].join(" / "));
  }

  return {
    id: Number(v.id),
    sku: typeof v.sku === "string" ? v.sku : undefined,
    name: cleanString(v.name),
    color,
    size,
    price: parseFloat(String(v.retail_price ?? "0")),
    inStock: v.is_ignored !== true,
  };
}

function mapSyncProduct(item: Record<string, unknown>): Product {
  return {
    id: Number(item.id),
    externalId:
      typeof item.external_id === "string" ? item.external_id : undefined,
    name: cleanString(item.name),
    category: cleanString(item.main_category_title ?? "General"),
    description:
      typeof item.description === "string"
        ? cleanString(item.description)
        : undefined,
    image: typeof item.thumbnail_url === "string" ? item.thumbnail_url : "",
    price: 0, // populated from variants on the detail call
  };
}

// ─────────────────────────────────────────
// Public API surface
// ─────────────────────────────────────────

/** Fetch all sync products in the store. */
export async function getProducts(): Promise<Product[]> {
  const result = await pfFetch<Record<string, unknown>[]>("/v2/sync/products");
  return result.map(mapSyncProduct);
}

/** Fetch a single sync product with full variant list. Returns null on 404. */
export async function getProduct(id: number | string): Promise<Product | null> {
  try {
    const result = await pfFetch<{
      sync_product: Record<string, unknown>;
      sync_variants: Record<string, unknown>[];
    }>(`/v2/sync/products/${id}`);

    const p = result.sync_product;
    const variants = result.sync_variants.map(mapVariant);
    const minPrice =
      variants.length > 0 ? Math.min(...variants.map((v) => v.price)) : 0;

    return {
      id: Number(p.id),
      externalId: typeof p.external_id === "string" ? p.external_id : undefined,
      name: cleanString(p.name),
      category: cleanString(p.main_category_title ?? "General"),
      description:
        typeof p.description === "string"
          ? cleanString(p.description)
          : undefined,
      image: typeof p.thumbnail_url === "string" ? p.thumbnail_url : "",
      price: minPrice,
      variants,
    };
  } catch (err) {
    if (err instanceof PrintfulNotFoundError) return null;
    throw err;
  }
}

/** Resolve the catalog product_id from a sync_variant_id. */
async function getProductIdForVariant(variantId: number): Promise<number> {
  const result = await pfFetch<{
    sync_variant: { product: { product_id: number } };
  }>(`/store/variants/${variantId}`);
  return result.sync_variant.product.product_id;
}

/** POST /mockup-generator/create-task/{productId} — returns the task key. */
export async function createMockupTask(
  variantId: number,
  imageUrl: string,
  placement: "front" | "back" = "front",
): Promise<string> {
  const productId = await getProductIdForVariant(variantId);
  const result = await pfFetch<{ task_key: string }>(
    `/mockup-generator/create-task/${productId}`,
    {
      method: "POST",
      body: JSON.stringify({
        variant_ids: [variantId],
        format: "jpg",
        files: [{ placement, image_url: imageUrl }],
      }),
    },
  );
  return result.task_key;
}

interface MockupTaskResult {
  status: string;
  mockups?: { placement: string; mockup_url: string }[];
}

/** GET /mockup-generator/task?task_key=… */
async function getMockupTaskResult(taskKey: string): Promise<MockupTaskResult> {
  return pfFetch<MockupTaskResult>(
    `/mockup-generator/task?task_key=${encodeURIComponent(taskKey)}`,
  );
}

/** Poll the mockup task until complete or timeout (30 s). Returns first mockup URL. */
export async function pollMockupTask(taskKey: string): Promise<string> {
  const TIMEOUT_MS = 30_000;
  const INTERVAL_MS = 2_000;
  const deadline = Date.now() + TIMEOUT_MS;

  while (Date.now() < deadline) {
    const result = await getMockupTaskResult(taskKey);

    if (result.status === "completed") {
      const first = result.mockups?.[0];
      if (!first)
        throw new Error("Mockup task completed but returned no mockups");
      return first.mockup_url;
    }

    if (result.status === "failed") {
      throw new Error("Printful mockup generation failed");
    }

    await new Promise((resolve) => setTimeout(resolve, INTERVAL_MS));
  }

  throw new Error("Mockup generation timed out after 30 s");
}

/** POST /orders — create a new Printful order. */
export async function createPrintfulOrder(
  payload: Record<string, unknown>,
): Promise<{ id: number | string; status: string }> {
  return pfFetch<{ id: number | string; status: string }>("/orders", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

/** GET /orders/:id — fetch a single Printful order. */
export async function getPrintfulOrder(
  orderId: number | string,
): Promise<Record<string, unknown>> {
  return pfFetch<Record<string, unknown>>(`/orders/${orderId}`);
}
