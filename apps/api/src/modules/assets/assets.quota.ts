import { prisma } from "../../lib/prisma";
import { LIBRARY_QUOTA, Plan } from "../../lib/retention";

export async function assertLibraryQuota(tenantId: string, plan: Plan) {
  const q = LIBRARY_QUOTA[plan];

  const rows = await prisma.asset.aggregate({
    where: {
      tenantId,
      status: "ACTIVE",
      kind: { in: ["LIBRARY_BASE_IMAGE", "LIBRARY_OVERLAY_PIC"] },
    },
    _count: { id: true },
    _sum: { bytes: true },
  });

  const usedCount = rows._count.id ?? 0;
  const usedBytes = rows._sum.bytes ?? 0;

  if (usedCount >= q.maxCount) {
    throw new Error(`Library quota exceeded: max files ${q.maxCount}`);
  }
  if (usedBytes >= q.maxBytes) {
    throw new Error(`Library quota exceeded: max size ${Math.round(q.maxBytes / 1024 / 1024)}MB`);
  }
}
