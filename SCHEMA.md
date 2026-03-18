# Shared Data Types

These TypeScript interfaces are canonical — all request/response bodies must conform to them.

---

## ProductVariant

```ts
interface ProductVariant {
  id: number;
  sku?: string;
  name: string;
  size: string;
  color: string;
  price: number;
  inStock: boolean;
}
```

---

## Product

```ts
interface Product {
  id: number;
  externalId?: string; // Printful product/variant id
  name: string;
  category: string;
  description?: string;
  image: string; // primary image URL
  images?: { front?: string; back?: string; detail?: string };
  price: number;
  variants?: ProductVariant[];
}
```

---

## Customization

```ts
interface Customization {
  boatName?: string;
  templateId: string; // e.g. "classic-text" | "marlin" | "tuna" | "waves-fish"
  logoUrl?: string; // public URL of uploaded artwork (S3/R2)
}
```

---

## CartItem

```ts
interface CartItem {
  id: string; // client-generated stable key
  productId: number;
  variantId?: number;
  name: string;
  image: string;
  unitPrice: number;
  quantity: number;
  customization?: Customization;
}
```

---

## ShippingAddress

```ts
interface ShippingAddress {
  fullName: string;
  email: string;
  phone?: string;
  address1: string;
  address2?: string;
  city: string;
  stateCode: string;
  zip: string;
  countryCode: string;
}
```

---

## OrderDraft

```ts
interface OrderDraft {
  items: CartItem[];
  shipping: ShippingAddress;
  notes?: string;
}
```
