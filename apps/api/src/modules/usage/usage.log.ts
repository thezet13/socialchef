import { prisma } from "../../lib/prisma";

export async function logUsageEvent(params: {
  tenantId: string;
  userId?: string;
  actionType: string;      // UsageActionType enum string
  creditsCost?: number;
  meta?: unknown;
}) {
  await prisma.usageEvent.create({
    data: {
      tenantId: params.tenantId,
      userId: params.userId ?? null,
      actionType: params.actionType as any,
      creditsCost: params.creditsCost ?? 0,
      metaJson: params.meta as any,
    },
  });

  // обновим "lastActivityAt" и country если передадим
  await prisma.tenant.update({
    where: { id: params.tenantId },
    data: { lastActivityAt: new Date() },
  });
}
