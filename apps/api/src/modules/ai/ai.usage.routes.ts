import { Router } from "express";
import { prisma } from "../../lib/prisma";
import { requireAuth } from "../../middleware/requireAuth";
import { withTenant } from "../../middleware/withTenant";
import {
  resolveCurrentPeriodForTenant,
} from "../../modules/ai/ai.usage"; 

const aiUsageRouter = Router();

/**
 * GET /ai/usage/current
 * Текущее использование AI по активному периоду (tenant)
 */
aiUsageRouter.get(
  "/usage/current",
  requireAuth,
  withTenant,
  async (req, res) => {
    try {
      const tenantId = res.locals.tenantId as string;

      const { periodStart, periodEnd } =
        await resolveCurrentPeriodForTenant(tenantId);

      const [usage, subscription] = await Promise.all([
        prisma.aIUsagePeriod.findUnique({
          where: {
            tenantId_periodStart_periodEnd: {
              tenantId,
              periodStart,
              periodEnd,
            },
          },
        }),
        prisma.subscription.findUnique({
          where: { tenantId },
        }),
      ]);

      const plan = subscription?.plan ?? null;

      res.json({
        periodStart,
        periodEnd,
        plan,
        textCount: usage?.textCount ?? 0,
        imageCount: usage?.imageCount ?? 0,
        planCount: usage?.planCount ?? 0,
      });
    } catch (error) {
      console.error("[GET /ai/usage/current] error", error);
      res.status(500).json({ error: "Failed to load AI usage" });
    }
  }
);

export default aiUsageRouter;
