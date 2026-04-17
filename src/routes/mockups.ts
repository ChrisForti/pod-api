import { Router, Request, Response } from "express";
import { createMockupTask, pollMockupTask } from "../services/printful";
import { isPositiveInt, isHttpUrl } from "../lib/validate";

const router = Router();

// POST /api/mockup
// Contract: { variantId, artworkUrl, placement? }
// Response: { mockupUrl }
router.post("/", async (req: Request, res: Response) => {
  const body = (req.body ?? {}) as Record<string, unknown>;

  if (!isPositiveInt(body.variantId)) {
    res.status(400).json({ error: "variantId must be a positive integer" });
    return;
  }
  if (!isHttpUrl(body.artworkUrl)) {
    res
      .status(400)
      .json({ error: "artworkUrl must be a valid http/https URL" });
    return;
  }
  const placement = body.placement === "back" ? "back" : "front";

  try {
    const taskKey = await createMockupTask(
      Number(body.variantId),
      String(body.artworkUrl),
      placement,
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
