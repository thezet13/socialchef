import { Router } from "express";
import { prisma } from "../../lib/prisma";
import { requireAuth } from "../../middleware/requireAuth";
import { withTenant } from "../../middleware/withTenant";
import fs from "fs";
import path from "path";

const imagesRouter = Router();

/**
 * GET /images
 * История сгенерированных изображений текущего tenant
 */
imagesRouter.get("/", requireAuth, withTenant, async (req, res) => {
  try {
    const tenantId = res.locals.tenantId as string;

    const items = await prisma.generatedImage.findMany({
      where: { tenantId },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    res.json({ items });
  } catch (err) {
    console.error("[GET /images] error", err);
    res.status(500).json({ error: "Failed to load images" });
  }
});

export default imagesRouter;


imagesRouter.delete(
  "/:id",
  requireAuth,
  withTenant,
  async (req, res) => {
    try {
      const { tenantId } = req.auth!;
      const id = req.params.id;

      const found = await prisma.generatedImage.findFirst({
        where: { id, tenantId },
      });

      if (!found) return res.status(404).json({ error: "Image not found" });

      const filePath = path.join(process.cwd(), found.imageUrl.replace(/^\//, ""));
      fs.unlink(filePath, () => {});

      await prisma.generatedImage.delete({ where: { id } });

      return res.json({ success: true });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: "Internal server error" });
    }
  }
);

export { imagesRouter };
