import { prisma } from "../lib/prisma";
import { purgeDeletedAssets } from "./purgeDeletedAssets";

const DAYS = (n: number) => n * 24 * 60 * 60 * 1000;

export async function purgeInactiveTenants(opts: { dryRun?: boolean }) {
  const now = Date.now();
  const freeCutoff = new Date(now - DAYS(30));
  const paidCutoff = new Date(now - DAYS(120));

  // 1) FREE inactive 30d
  const freeTenants = await prisma.tenant.findMany({
    where: {
      subscription: { is: null }, // или plan=FREE, зависит от твоей логики
      lastActivityAt: { lt: freeCutoff },
    },
    select: { id: true },
  });

  // 2) PRO/PRO+ expired 120d
  const paidTenants = await prisma.tenant.findMany({
    where: {
      subscription: {
        is: {
          plan: { in: ["PRO", "PRO_PLUS"] },
          status: { not: "ACTIVE" },
          currentPeriodEnd: { lt: paidCutoff },
        },
      },
    },
    select: { id: true },
  });

  const targetTenantIds = Array.from(new Set([...freeTenants, ...paidTenants].map((t) => t.id)));

  let wiped = 0;

  for (const tenantId of targetTenantIds) {
    if (!opts.dryRun) {
      // удаляем сущности, которые держат ссылки на assets
      await prisma.$transaction([
        prisma.presetAsset.deleteMany({ where: { preset: { tenantId } } }),
        prisma.proDesignAsset.deleteMany({ where: { proDesign: { tenantId } } }),

        prisma.preset.deleteMany({ where: { tenantId, scope: "TENANT" } }),
        prisma.proDesign.deleteMany({ where: { tenantId } }),

        // помечаем все assets tenant как DELETED (потом purgeDeletedAssets удалит файлы)
        prisma.asset.updateMany({
          where: { tenantId, status: "ACTIVE" },
          data: { status: "DELETED" },
        }),
      ]);
    }
    wiped++;
  }

  // после вайпа — можно сразу запустить purgeDeletedAssets, или оставить на отдельный cron
  const purged = await purgeDeletedAssets({ dryRun: opts.dryRun, batch: 1000 });

  return { tenantsMatched: targetTenantIds.length, tenantsWiped: wiped, assetsPurged: purged.purged };
}
