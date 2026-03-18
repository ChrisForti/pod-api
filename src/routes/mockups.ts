import { Router, Request, Response } from "express";
import { createMockupTask, pollMockupTask } from "../services/printful";
import { validateMockupRequest } from "../lib/validate";

const router = Router();

// POST /api/mockups/generate
router.post("/generate", async (req: Request, res: Response) => {
  const validation = validateMockupRequest(req.body);
  if (!validation.valid) {
    res.status(400).json({ error: validation.error });
    return;
  }

  const { productId, variantId, customization } = validation.data;

  try {
    const taskKey = await createMockupTask(
      productId,
      variantId,
      customization.logoUrl!,
    );
    const mockupUrl = await pollMockupTask(taskKey);
    res.json({ mockupUrl });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Mockup generation failed";
    const status = message.includes("timed out") ? 504 : 502;
    res.status(status).json({ error: message });
  }
});

export default router;
