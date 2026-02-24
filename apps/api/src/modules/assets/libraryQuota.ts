import { prisma } from "../../lib/prisma";
import { PlanType } from "@prisma/client";

const MB = 1024 * 1024;

const QUOTA = {
  [PlanType.FREE]:   { maxBytes: 100 * MB, maxCount: 50 },
  [PlanType.EDITOR]: { maxBytes: 1024 * MB, maxCount: 500 },
  [PlanType.PRO]:    { maxBytes: 20 * 1024 * MB, maxCount: 5000 },
  [PlanType.PRO_PLUS]:    { maxBytes: 20 * 1024 * MB, maxCount: 7500 },
} as const;

export async function assertLibraryQuota(tenantId: string, plan: PlanType) {
  const q = QUOTA[plan];

  const agg = await prisma.asset.aggregate({
    where: {
      tenantId,
      status: "ACTIVE",
      kind: { in: ["LIBRARY_BASE_IMAGE", "LIBRARY_OVERLAY_PIC"] },
    },
    _count: { id: true },
    _sum: { bytes: true },
  });

  const usedCount = agg._count.id ?? 0;
  const usedBytes = agg._sum.bytes ?? 0;

  if (usedCount >= q.maxCount) {
    throw new Error(`Library quota exceeded: max files ${q.maxCount}`);
  }
  if (usedBytes >= q.maxBytes) {
    throw new Error(`Library quota exceeded: max size ${Math.round(q.maxBytes / MB)}MB`);
  }
}
