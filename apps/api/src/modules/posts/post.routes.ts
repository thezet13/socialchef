import { Router } from "express";
import { GeneratedPost, PostType } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { requireAuth } from "../../middleware/requireAuth"; // если у тебя так называется
import { withTenant } from "../../middleware/withTenant"; // твой middleware tenantId

const postsRouter = Router();

/**
 * GET /posts
 * История сгенерированных постов текущего tenant
 *
 * query:
 *  - page?: number (1 по умолчанию)
 *  - limit?: number (20 по умолчанию, максимум 100)
 *  - type?: PostType
 *  - language?: string ("en" | "ru" | "az")
 */
postsRouter.get(
  "/",
  requireAuth,
  withTenant,
  async (req, res) => {
    try {
      const tenantId = res.locals.tenantId as string;

      const page = Math.max(parseInt(String(req.query.page ?? "1"), 10) || 1, 1);
      const limitRaw = parseInt(String(req.query.limit ?? "20"), 10) || 20;
      const limit = Math.min(Math.max(limitRaw, 1), 100);
      const skip = (page - 1) * limit;

      const typeParam = req.query.type as string | undefined;
      const language = req.query.language as string | undefined;

      const where: any = { tenantId };

      if (typeParam) {
        // Проверяем, что тип валидный, чтобы не словить ошибку Prisma
        if (Object.values(PostType).includes(typeParam as PostType)) {
          where.type = typeParam as PostType;
        }
      }

      if (language) {
        where.language = language;
      }

      const [items, total] = await Promise.all([
        prisma.generatedPost.findMany({
          where,
          orderBy: { createdAt: "desc" },
          skip,
          take: limit,
        }),
        prisma.generatedPost.count({ where }),
      ]);

      const totalPages = Math.ceil(total / limit) || 1;

      res.json({
        items,
        page,
        limit,
        total,
        totalPages,
      });
    } catch (error) {
      console.error("[GET /posts] error", error);
      res.status(500).json({ error: "Failed to load posts" });
    }
  }
);

export default postsRouter; 
