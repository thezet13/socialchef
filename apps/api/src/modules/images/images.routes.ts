import { Router } from "express";
import { prisma } from "../../lib/prisma";
import { requireAuth } from "../../middleware/requireAuth";
import { withTenant } from "../../middleware/withTenant";
import fs from "fs";
import path from "path";
import z from "zod";

const imagesRouter = Router();
export default imagesRouter;

const listImagesQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(10),
  cursor: z.string().min(5).optional(), // "2026-02-11T...Z|cuid"
});


imagesRouter.get("/", requireAuth, withTenant, async (req, res) => {
  try {
    const tenantId = res.locals.tenantId as string;

    const parsed = listImagesQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid query", details: parsed.error.issues });
    }

    const { limit, cursor } = parsed.data;

    const where: any = { tenantId };

    // ✅ keyset cursor pagination: createdAt desc, id desc
    if (cursor) {
      const [iso, cursorId] = cursor.split("|");
      const cursorDate = new Date(iso);

      if (!iso || !cursorId || Number.isNaN(cursorDate.getTime())) {
        return res.status(400).json({ error: "Invalid cursor" });
      }

      where.AND = [
        {
          OR: [
            { createdAt: { lt: cursorDate } },
            { createdAt: cursorDate, id: { lt: cursorId } },
          ],
        },
      ];
    }

    const rows = await prisma.generatedImage.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit + 1,
      select: {
        id: true,
        imageUrl: true,
        proDesignId: true,
        width: true,
        height: true,
        prompt: true,
        style: true,
        tenantId: true,
        createdAt: true,
      },
    });

    const totalCount = await prisma.generatedImage.count({
      where: {
        tenantId,
        imageUrl: { startsWith: "/uploads/images/final_" },
      },
    });

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;

    const last = page[page.length - 1];
    const nextCursor =
      hasMore && last ? `${last.createdAt.toISOString()}|${last.id}` : null;

    return res.json({ items: page, nextCursor, totalCount });
  } catch (err) {
    console.error("[GET /images] error", err);
    res.status(500).json({ error: "Failed to load images" });
  }
});

imagesRouter.delete("/:id", requireAuth, withTenant, async (req, res) => {
  try {
    const { tenantId } = req.auth!;
    const id = req.params.id;

    const found = await prisma.generatedImage.findFirst({
      where: { id, tenantId },
      select: { id: true, imageUrl: true, proDesignId: true },
    });

    if (!found) return res.status(404).json({ error: "Image not found" });

    // 1) delete file for this history image
    const filePath = path.join(process.cwd(), found.imageUrl.replace(/^\//, ""));
    fs.unlink(filePath, () => { });

    // 2) if this image is linked to a proDesign and is currently the finalImageUrl — clear it
    if (found.proDesignId) {
      const design = await prisma.proDesign.findFirst({
        where: { id: found.proDesignId, tenantId },
        select: { id: true, finalImageUrl: true },
      });

      if (design?.finalImageUrl === found.imageUrl) {
        await prisma.proDesign.update({
          where: { id: design.id },
          data: {
            finalImageUrl: null,
            status: "DRAFT", // если хочешь
          },
        });
      }
    }

    // 3) delete DB row
    await prisma.generatedImage.delete({ where: { id } });

    return res.json({ success: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

export { imagesRouter };

