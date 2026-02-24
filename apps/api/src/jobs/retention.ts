// apps/api/src/jobs/retention/retention.ts
import fs from "fs/promises";
import path from "path";
import { prisma } from "../lib/prisma";
import { uploadsImagesDir } from "../lib/uploadsPaths";
import { uploadsUrlToAbsPath } from "../lib/assets"; // ✅ единый safe-mapping

import { cleanupOrphanAssets } from "./cleanupOrphanAssets";
import { purgeDeletedAssets } from "./purgeDeletedAssets";
import { purgeInactiveTenants } from "./purgeInactiveTenants";

type RunOpts = {
  dryRun?: boolean;
  previewTtlHours?: number; // default 24
  maxDbBatch?: number; // default 500

  orphanAfterDays?: number;          // default 14
  purgeDeletedBatch?: number;        // default 500
  runInactiveTenantsPurge?: boolean; // default false
};

const PREVIEW_PREFIXES = ["preview_", "bake_preview_", "combo_preview_"];

function isSafeUploadsUrl(u: string) {
  return typeof u === "string" && u.startsWith("/uploads/");
}

async function unlinkBestEffort(absPath: string, dryRun?: boolean) {
  try {
    if (!dryRun) await fs.unlink(absPath);
    return true;
  } catch {
    return false;
  }
}

async function cleanupPreviewFiles(opts: RunOpts) {
  const ttlHours = opts.previewTtlHours ?? 24;
  const ttlMs = ttlHours * 60 * 60 * 1000;
  const now = Date.now();

  let names: string[] = [];
  try {
    names = await fs.readdir(uploadsImagesDir);
  } catch {
    return { scanned: 0, deleted: 0 };
  }

  let scanned = 0;
  let deleted = 0;

  for (const name of names) {
    if (!PREVIEW_PREFIXES.some((p) => name.startsWith(p))) continue;

    scanned++;
    const abs = path.join(uploadsImagesDir, name);

    try {
      const st = await fs.stat(abs);
      const ageMs = now - st.mtimeMs;
      if (ageMs < ttlMs) continue;

      const ok = await unlinkBestEffort(abs, opts.dryRun);
      if (ok) deleted++;
    } catch {
      // best-effort
    }
  }

  return { scanned, deleted };
}


async function cleanupGeneratedImagesCap100(opts: RunOpts) {
  // cap 100 на tenant для final_* export history
  // + чистим соответствующий Asset (если ты его создаешь на render)
  const batch = opts.maxDbBatch ?? 500;

  const tenants = await prisma.tenant.findMany({ select: { id: true } });

  let totalDeleted = 0;
  let totalAssetsMarkedDeleted = 0;

  for (const t of tenants) {
    while (true) {
      const extra = await prisma.generatedImage.findMany({
        where: {
          tenantId: t.id,
          imageUrl: { startsWith: "/uploads/images/final_" },
        },
        orderBy: { createdAt: "desc" },
        skip: 100,
        take: batch,
        select: { id: true, imageUrl: true },
      });

      if (extra.length === 0) break;

      for (const row of extra) {
        // delete file best-effort
        if (isSafeUploadsUrl(row.imageUrl)) {
          try {
            const abs = uploadsUrlToAbsPath(row.imageUrl);
            await unlinkBestEffort(abs, opts.dryRun);
          } catch {
            // ignore
          }
        }

        if (!opts.dryRun) {
          await prisma.generatedImage.delete({ where: { id: row.id } });

          // ✅ если export регистрируется как Asset — помечаем/чистим запись
          const upd = await prisma.asset.updateMany({
            where: {
              tenantId: t.id,
              storagePath: row.imageUrl,
              status: "ACTIVE",
            },
            data: { status: "DELETED" },
          });
          totalAssetsMarkedDeleted += upd.count;
        }

        totalDeleted++;
      }
    }
  }

  return { deleted: totalDeleted, assetsMarkedDeleted: totalAssetsMarkedDeleted };
}

export async function runRetention(opts: RunOpts = {}) {
  const startedAt = Date.now();

  const preview = await cleanupPreviewFiles(opts);
  const exports = await cleanupGeneratedImagesCap100(opts);

  const orphan = await cleanupOrphanAssets({
    orphanAfterDays: opts.orphanAfterDays ?? 14,
    dryRun: opts.dryRun,
  });

  const purged = await purgeDeletedAssets({
    dryRun: opts.dryRun,
    batch: opts.purgeDeletedBatch ?? 500,
  });

  const inactive = opts.runInactiveTenantsPurge
    ? await purgeInactiveTenants({ dryRun: opts.dryRun })
    : { skipped: true };

  const ms = Date.now() - startedAt;

  return {
    ok: true,
    dryRun: !!opts.dryRun,
    tookMs: ms,
    preview,
    exportHistory: exports,
    orphan,
    purgedDeleted: purged,
    inactiveTenants: inactive,
  };
}

// CLI entrypoint (удобно для Windows/cron)
if (require.main === module) {
  (async () => {
    const dryRun = process.argv.includes("--dry");
    const ttlArg = process.argv.find((a) => a.startsWith("--previewTtlHours="));
    const previewTtlHours = ttlArg ? Number(ttlArg.split("=")[1]) : undefined;

    const orphanArg = process.argv.find((a) => a.startsWith("--orphanAfterDays="));
    const orphanAfterDays = orphanArg ? Number(orphanArg.split("=")[1]) : undefined;

    const purgeBatchArg = process.argv.find((a) => a.startsWith("--purgeDeletedBatch="));
    const purgeDeletedBatch = purgeBatchArg ? Number(purgeBatchArg.split("=")[1]) : undefined;

    const runInactiveTenantsPurge = process.argv.includes("--purgeInactiveTenants");

    const result = await runRetention({
      dryRun,
      previewTtlHours,
      orphanAfterDays,
      purgeDeletedBatch,
      runInactiveTenantsPurge,
    });

    console.log("[retention] result:", result);

    process.exit(0);

  })().catch((e) => {
    // eslint-disable-next-line no-console
    console.error("[retention] failed", e);
    process.exit(1);
  });
}
