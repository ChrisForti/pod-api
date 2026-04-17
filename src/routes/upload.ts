import { Router, Request, Response } from "express";
import multer from "multer";
import { validateUpload, uploadLogo } from "../services/storage";

const router = Router();

// Store files in memory — we stream straight to S3/R2
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB hard stop
});

// POST /api/upload/logo
router.post(
  "/logo",
  upload.single("file"),
  async (req: Request, res: Response) => {
    if (!req.file) {
      res
        .status(400)
        .json({ error: 'No file provided. Use field name "file".' });
      return;
    }

    const validation = validateUpload(req.file.mimetype, req.file.size);
    if (!validation.valid) {
      res.status(400).json({ error: validation.reason });
      return;
    }

    try {
      const url = await uploadLogo(
        req.file.buffer,
        req.file.mimetype,
        req.file.originalname,
      );
      res.json({ url });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Upload failed";
      res.status(500).json({ error: message });
    }
  },
);

export default router;
