// apps/api/src/utils/aiUsage.ts
import { prisma } from "../../lib/prisma"; 
import { PlanType } from "@prisma/client";

/**
 * Определяет текущий биллинговый период для tenant:
 * - если у Subscription есть currentPeriodStart/currentPeriodEnd → используем их
 * - иначе календарный месяц (1 число текущего и 1 число следующего)
 */
export async function resolveCurrentPeriodForTenant(tenantId: string) {
  const sub = await prisma.subscription.findUnique({
    where: { tenantId },
  });

  if (sub?.currentPeriodStart && sub?.currentPeriodEnd) {
    return {
      periodStart: sub.currentPeriodStart,
      periodEnd: sub.currentPeriodEnd,
    };
  }

  const now = new Date();
  const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  return { periodStart, periodEnd };
}

/**
 * Простейший лимит генераций текста в период по плану
 */
export function getTextLimitForPlan(plan: PlanType | null | undefined): number {
  switch (plan) {
    case "FREE":
      return 50;
    case "STARTER":
      return 300;
    case "PRO":
      return 1000;
    default:
      return 50;
  }
}
