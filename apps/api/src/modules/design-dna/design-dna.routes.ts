import { Router } from "express";
import { requireAuth } from "../../middleware/requireAuth";
import { withTenant } from "../../middleware/withTenant";
import { generateDesignDNA } from "./design-dna.service";

export const designDnaRouter = Router();

designDnaRouter.post(
  "/generate",
  requireAuth,
  withTenant,
  async (req, res) => {
    try {
      const result = await generateDesignDNA(req.body);
      return res.json(result);
    } catch (error) {
      console.error("design-dna/generate error", error);
      return res.status(500).json({ error: "Failed to generate Design DNA" });
    }
  },
);