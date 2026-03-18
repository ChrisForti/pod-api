import { OrderDraft, Customization } from "../types";

// ─────────────────────────────────────────
// String sanitization
// Used before forwarding any user string to Printful.
// ─────────────────────────────────────────

/** Strip HTML tags, control characters, and trim. Caps length at 500 chars. */
export function sanitize(value: unknown): string {
  if (typeof value !== "string") return "";
  return value
    .replace(/<[^>]*>/g, "") // strip HTML
    .replace(/[\x00-\x1F\x7F]/g, "") // strip control chars
    .trim()
    .slice(0, 500);
}

// ─────────────────────────────────────────
// Primitive validators
// ─────────────────────────────────────────

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(value: unknown): boolean {
  return typeof value === "string" && EMAIL_RE.test(value);
}

/** Returns true if value is a finite integer > 0. */
export function isPositiveInt(value: unknown): boolean {
  const n = Number(value);
  return Number.isInteger(n) && n > 0;
}

/** Returns true if value is a non-empty string after trimming. */
export function isNonEmptyString(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

/** Returns true if the URL is a well-formed http/https URL. */
export function isHttpUrl(value: unknown): boolean {
  if (typeof value !== "string") return false;
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

// ─────────────────────────────────────────
// Schema validators — return a tagged union
// so callers get a typed draft on success.
// ─────────────────────────────────────────

type ValidationOk<T> = { valid: true; data: T };
type ValidationErr = { valid: false; error: string };
export type ValidationResult<T> = ValidationOk<T> | ValidationErr;

function ok<T>(data: T): ValidationOk<T> {
  return { valid: true, data };
}
function err(error: string): ValidationErr {
  return { valid: false, error };
}

// ── OrderDraft ──────────────────────────────────────────────────────────────

export function validateOrderDraft(
  body: unknown,
): ValidationResult<OrderDraft> {
  if (!body || typeof body !== "object") {
    return err("Request body is required");
  }

  const b = body as Record<string, unknown>;

  if (!Array.isArray(b.items) || b.items.length === 0) {
    return err("items must be a non-empty array");
  }

  // Validate each item has at minimum productId, name, unitPrice, quantity
  for (let i = 0; i < b.items.length; i++) {
    const item = b.items[i] as Record<string, unknown>;
    if (!isPositiveInt(item?.productId))
      return err(`items[${i}].productId must be a positive integer`);
    if (!isNonEmptyString(item?.name))
      return err(`items[${i}].name is required`);
    if (typeof item?.unitPrice !== "number" || item.unitPrice < 0)
      return err(`items[${i}].unitPrice must be a non-negative number`);
    if (!isPositiveInt(item?.quantity))
      return err(`items[${i}].quantity must be a positive integer`);
  }

  const shipping = b.shipping as Record<string, unknown> | undefined;
  if (!shipping) return err("shipping is required");

  const requiredShipping = [
    "fullName",
    "email",
    "address1",
    "city",
    "stateCode",
    "zip",
    "countryCode",
  ] as const;

  for (const field of requiredShipping) {
    if (!isNonEmptyString(shipping[field])) {
      return err(`shipping.${field} is required`);
    }
  }

  if (!isValidEmail(shipping.email)) {
    return err("shipping.email is not a valid email address");
  }

  // stateCode: 2-letter uppercase
  if (!/^[A-Z]{2}$/.test(String(shipping.stateCode))) {
    return err(
      "shipping.stateCode must be a 2-letter uppercase state code (e.g. FL)",
    );
  }

  // countryCode: 2-letter uppercase ISO
  if (!/^[A-Z]{2}$/.test(String(shipping.countryCode))) {
    return err(
      "shipping.countryCode must be a 2-letter uppercase ISO country code (e.g. US)",
    );
  }

  // zip: allow US 5-digit, ZIP+4, and common international formats
  if (!/^[\w\s-]{2,10}$/.test(String(shipping.zip))) {
    return err("shipping.zip appears invalid");
  }

  return ok(b as unknown as OrderDraft);
}

// ── MockupRequest ───────────────────────────────────────────────────────────

export interface MockupRequest {
  productId: number;
  variantId: number;
  customization: Customization;
}

export function validateMockupRequest(
  body: unknown,
): ValidationResult<MockupRequest> {
  if (!body || typeof body !== "object") {
    return err("Request body is required");
  }

  const b = body as Record<string, unknown>;

  if (!isPositiveInt(b.productId)) {
    return err("productId is required and must be a positive integer");
  }
  if (!isPositiveInt(b.variantId)) {
    return err("variantId is required and must be a positive integer");
  }

  const c = b.customization as Record<string, unknown> | undefined;
  if (!c) return err("customization is required");

  if (!isNonEmptyString(c.templateId)) {
    return err("customization.templateId is required");
  }

  if (!c.logoUrl || !isHttpUrl(c.logoUrl)) {
    return err("customization.logoUrl must be a valid http/https URL");
  }

  return ok({
    productId: Number(b.productId),
    variantId: Number(b.variantId),
    customization: b.customization as Customization,
  });
}
