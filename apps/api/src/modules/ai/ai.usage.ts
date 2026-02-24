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
    select: {
      plan: true,
      currentPeriodStart: true,
      currentPeriodEnd: true,
    },
  });

  const plan: PlanType = sub?.plan ?? PlanType.FREE;

  if (sub?.currentPeriodStart && sub?.currentPeriodEnd) {
    return {
      plan,
      periodStart: sub.currentPeriodStart,
      periodEnd: sub.currentPeriodEnd,
    };
  }

  const now = new Date();
  const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  return { plan, periodStart, periodEnd };
}

export function getMaxExportPxForPlan(plan: PlanType) {
  switch (plan) {
    case PlanType.PRO:
      return 4096;
    case PlanType.FREE:
    default:
      return 1920; 
  }
}

export function canExportWithoutWatermark(plan: PlanType | null | undefined): boolean {
  return plan === "PRO" || plan === "PRO_PLUS";
}

export function getImageGenLimitForPlan(plan: PlanType | null | undefined): number {
  switch (plan) {
    case "FREE":
      return 3;      // пример
    case "PRO":
      return 10;     // пример
    case "PRO_PLUS":
      return 10;     // пример
    default:
      return 3;
  }
}