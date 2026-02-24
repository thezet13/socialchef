import { Router } from "express";
import path from "path";
import { requireAuth } from "@/middleware/requireAuth";
import { withTenant } from "@/middleware/withTenant";
import { uploadSingleImage } from "@/lib/uploads";

type UploadImageResponse = { url: string };

export const uploadsRouter = Router();

uploadsRouter.post(
  "/images",
  requireAuth,
  withTenant,
  uploadSingleImage("file"),
  (req, res) => {
    const f = req.file;
    if (!f) return res.status(400).json({ error: "No file uploaded" });

    const body: UploadImageResponse = {
      url: `/uploads/images/${path.basename(f.filename)}`,
    };

    return res.json(body);
  }
);
