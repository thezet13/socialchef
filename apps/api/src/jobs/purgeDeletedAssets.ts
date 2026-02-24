import fs from "fs/promises";
import { prisma } from "../lib/prisma";
import { uploadsUrlToAbsPath } from "../lib/assets";

export async function purgeDeletedAssets(opts: {
  dryRun?: boolean;
  batch?: number;
}) {
  const batch = opts.batch ?? 500;

  const rows = await prisma.asset.findMany({
    where: { status: "DELETED", deletedAt: null },
    take: batch,
    select: { id: true, storagePath: true },
  });

  let purged = 0;
  let fileDeleted = 0;
  let fileMissing = 0;

  for (const a of rows) {
    let existed = false;

    if (a.storagePath?.startsWith("/uploads/")) {
      try {
        const abs = uploadsUrlToAbsPath(a.storagePath);

        try {
          await fs.access(abs);
          existed = true;
        } catch {
          existed = false;
        }

        if (!opts.dryRun && existed) {
          await fs.unlink(abs).catch(() => {});
          fileDeleted++;
        }

        if (!existed) {
          fileMissing++;
        }
      } catch {
        fileMissing++;
      }
    } else {
      // storagePath outside uploads (safety)
      fileMissing++;
    }

    if (!opts.dryRun) {
      await prisma.asset.update({
        where: { id: a.id },
        data: { deletedAt: new Date() },
      });
    }

    purged++;
  }

  return {
    purged,        // сколько записей обработано
    fileDeleted,   // сколько реально удалили с диска
    fileMissing,   // сколько уже отсутствовали
  };
}