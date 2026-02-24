import { prisma } from "../../../lib/prisma";
import { PlanType } from "@prisma/client"; // или откуда у тебя PlanType

export async function getTenantPlan(tenantId: string): Promise<PlanType> {
  const sub = await prisma.subscription.findUnique({
    where: { tenantId },
    select: { plan: true },
  });

  return sub?.plan ?? PlanType.FREE;
}