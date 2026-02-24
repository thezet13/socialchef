import fs from "fs/promises";
import path from "path";
import { prisma } from "../lib/prisma";
import { UPLOADS_DIR_ABS } from "../lib/uploadsPaths";
import type { AssetKind } from "@prisma/client";

function assertUploadsUrl(u: string) {
  if (typeof u !== "string" || !u.startsWith("/uploads/")) {
    throw new Error(`Not an uploads url: ${u}`);
  }
}

export function uploadsUrlToAbsPath(uploadUrl: string) {
  assertUploadsUrl(uploadUrl);

  // "/uploads/images/x.png" -> "<UPLOADS_DIR_ABS>/images/x.png"
  const rel = uploadUrl.replace(/^\/uploads\//, "");
  const abs = path.resolve(UPLOADS_DIR_ABS, rel);

  const root = path.resolve(UPLOADS_DIR_ABS);
  if (!abs.startsWith(root + path.sep) && abs !== root) {
    throw new Error(`Unsafe path outside uploads: ${uploadUrl}`);
  }
  return abs;
}

export async function ensureAssetForUploadsUrl(opts: {
  tenantId: string;
  uploadsUrl: string; // "/uploads/..."
  kind: AssetKind;
}) {
  assertUploadsUrl(opts.uploadsUrl);

  // best-effort bytes (если файла нет — не падаем, просто bytes=null)
  let bytes: number | null = null;
  try {
    const abs = uploadsUrlToAbsPath(opts.uploadsUrl);
    const st = await fs.stat(abs);
    bytes = st.size;
  } catch {
    bytes = null;
  }

  // требует @@unique([tenantId, storagePath])
  const asset = await prisma.asset.upsert({
    where: {
      tenantId_storagePath: {
        tenantId: opts.tenantId,
        storagePath: opts.uploadsUrl,
      },
    },
    update: {
      status: "ACTIVE",
      kind: opts.kind,
      bytes: bytes ?? undefined,
      lastUsedAt: new Date(),
    },
    create: {
      tenantId: opts.tenantId,
      storagePath: opts.uploadsUrl,
      kind: opts.kind,
      status: "ACTIVE",
      bytes: bytes ?? undefined,
      lastUsedAt: new Date(),
    },
    select: { id: true, kind: true },
  });

  return asset;
}

export async function linkAssetToPreset(opts: {
  presetId: string;
  assetId: string;
  kind?: AssetKind;
}) {
  await prisma.presetAsset.createMany({
    data: [{ presetId: opts.presetId, assetId: opts.assetId, kind: opts.kind }],
    skipDuplicates: true,
  });

  await prisma.asset.update({
    where: { id: opts.assetId },
    data: { lastUsedAt: new Date() },
  });
}

export async function linkAssetToProDesign(opts: {
  proDesignId: string;
  assetId: string;
  kind?: AssetKind;
}) {
  await prisma.proDesignAsset.createMany({
    data: [{ proDesignId: opts.proDesignId, assetId: opts.assetId, kind: opts.kind }],
    skipDuplicates: true,
  });

  await prisma.asset.update({
    where: { id: opts.assetId },
    data: { lastUsedAt: new Date() },
  });
}
