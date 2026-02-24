import { prisma } from "../lib/prisma";

export async function cleanupOrphanAssets(opts: { orphanAfterDays: number; dryRun?: boolean }) {
  const cutoff = new Date(Date.now() - opts.orphanAfterDays * 24 * 60 * 60 * 1000);

  // orphan = нет presetLinks и нет designLinks
  const orphans = await prisma.asset.findMany({
    where: {
      status: "ACTIVE",
      // lastUsedAt если есть, иначе createdAt
      OR: [
        { lastUsedAt: { lt: cutoff } },
        { lastUsedAt: null, createdAt: { lt: cutoff } },
      ],
      presetLinks: { none: {} },
      designLinks: { none: {} },
    },
    take: 500,
    select: { id: true },
  });

  if (orphans.length === 0) return { markedDeleted: 0 };

  if (!opts.dryRun) {
    await prisma.asset.updateMany({
      where: { id: { in: orphans.map((x) => x.id) } },
      data: { status: "DELETED" },
    });
  }

  return { markedDeleted: orphans.length };
}
