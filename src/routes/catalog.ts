import { Router, Request, Response } from "express";
import { getProducts, getProduct } from "../services/printful";

const router = Router();

// Simple in-process cache
let productsCache: { data: unknown; expiry: number } | null = null;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// GET /api/products
router.get("/", async (_req: Request, res: Response) => {
  try {
    const now = Date.now();
    if (productsCache && now < productsCache.expiry) {
      res.json(productsCache.data);
      return;
    }

    const products = await getProducts();
    productsCache = { data: products, expiry: now + CACHE_TTL };
    res.json(products);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Internal server error";
    res.status(502).json({ error: message });
  }
});

// GET /api/products/:id
router.get("/:id", async (req: Request, res: Response) => {
  const raw = req.params.id;
  const id = parseInt(raw, 10);

  if (isNaN(id) || id <= 0) {
    res.status(400).json({ error: "Invalid product id" });
    return;
  }

  try {
    const product = await getProduct(id);

    if (!product) {
      res.status(404).json({ error: "Not found" });
      return;
    }

    res.json(product);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Internal server error";
    res.status(502).json({ error: message });
  }
});

export default router;
