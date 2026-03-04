import path from "path";
import fs from "fs";
import { Router } from "express";
import { PresetScope, PresetAccess, PresetStatus, ImageOrigin, Prisma } from "@prisma/client";
import { prisma } from '../../lib/prisma';
import { requireAuth } from '../../middleware/requireAuth';
import { withTenant } from '../../middleware/withTenant';
import { applyPresetBodySchema, createBodySchema, listQuerySchema, patchBodySchema } from "./presets.types";
import { SYSTEM_TENANT_ID } from "../../config/system";
import { collectPresetUploadPaths, ensureUploadsImagesDir, extractRelativeUploadPath, extractUploadUrlsFromOverlay, getThumbSizeByRatio, isFileReferencedByOtherPresets, mergeOverlayJson, normalizeUploadsUrl, relUploadToAbs, remapOverlayIds, toDetailDto, toListDto } from "./presets.service";
import { renderCompositeImage, renderOverlayOnlyImage } from "../ai/renderCompositeImage";
import { ensureAssetForUploadsUrl, linkAssetToPreset } from "../../lib/assets";
import type { AssetKind } from "@prisma/client";
import { uploadsUrlToAbsPath } from "../../lib/assets";

export const presetsRouter = Router();


presetsRouter.get("/", requireAuth, withTenant, async (req, res) => {
  const parsed = listQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid query", details: parsed.error.issues });
  }

  const { tenantId } = (req as any).auth; // если у тебя типизировано — заменим после
  const { format, scope, access, status, q, take = 100, skip = 0 } = parsed.data;

  const where: any = {
    OR: [
      { scope: PresetScope.SYSTEM, tenantId: SYSTEM_TENANT_ID },
      { scope: PresetScope.TENANT, tenantId },
    ],
    ...(status ? { status: status as PresetStatus } : {}),
  };


  if (format) where.format = format;
  if (scope) where.scope = scope as PresetScope;
  if (access) where.access = access as PresetAccess;


  if (q) {
    where.AND = [
      {
        OR: [
          { title: { contains: q, mode: "insensitive" } },
          { subtitle: { contains: q, mode: "insensitive" } },
        ],
      },
    ];
  }

  const rows = await prisma.preset.findMany({
    where,
    orderBy: [{ sortOrder: "asc" }, { updatedAt: "desc" }],
    skip,
    take,
    select: {
      id: true,
      scope: true,
      access: true,
      status: true,
      title: true,
      subtitle: true,
      tags: true,
      sortOrder: true,
      format: true,
      style: true,
      thumbnailUrl: true,
      thumbnailW: true,
      thumbnailH: true,
      updatedAt: true,
      imageOrigin: true,
      baseImageUrl: true,
      baseWidth: true,
      baseHeight: true,
      baseTransformJson: true,
      imageAdjustmentsJson: true,

      backgroundImageUrl: true,
      backgroundTransformJson: true,
      foregroundImageUrl: true,
      foregroundTransformJson: true,
      swapDishEnabled: true,
      dishType: true,
    },
  });

  return res.json(rows.map(toListDto));
});

presetsRouter.get("/list", requireAuth, withTenant, async (req, res) => {
  const parsed = listQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid query", details: parsed.error.issues });
  }

  const { tenantId } = (req as any).auth;
  const {
    format,
    scope,
    access,
    status,
    q,
    take = 10,
    cursor,
    swapDishEnabled,
    dishType,
  } = parsed.data;

  // ✅ доступ: SYSTEM(tenantId=SYSTEM) + TENANT(tenantId=current)
  const accessOr = [
    { scope: PresetScope.SYSTEM, tenantId: SYSTEM_TENANT_ID },
    { scope: PresetScope.TENANT, tenantId },
  ];

  // ✅ общие фильтры (они одинаковы и для list, и для counts)
  const common: any[] = [];
  if (status) common.push({ status: status as PresetStatus });
  if (format) common.push({ format });
  if (access) common.push({ access: access as PresetAccess });
  if (typeof swapDishEnabled === "boolean") common.push({ swapDishEnabled });
  if (dishType) common.push({ dishType });

  if (q) {
    common.push({
      OR: [
        { title: { contains: q, mode: "insensitive" } },
        { subtitle: { contains: q, mode: "insensitive" } },
      ],
    });
  }

  // ✅ counts НЕ зависят от вкладки scope — считаем всегда system + mine + all
  const whereSystem = {
    AND: [{ scope: PresetScope.SYSTEM, tenantId: SYSTEM_TENANT_ID }, ...common],
  };
  const whereMine = {
    AND: [{ scope: PresetScope.TENANT, tenantId }, ...common],
  };

  // ✅ where для list зависит от выбранной вкладки scope
  const listAnd: any[] = [...common];

  if (scope === "SYSTEM") {
    listAnd.unshift({ scope: PresetScope.SYSTEM, tenantId: SYSTEM_TENANT_ID });
  } else if (scope === "TENANT") {
    listAnd.unshift({ scope: PresetScope.TENANT, tenantId });
  } else {
    listAnd.unshift({ OR: accessOr });
  }

  const where = { AND: listAnd };

  const [rows, systemCount, mineCount] = await Promise.all([
    prisma.preset.findMany({
      where,
      orderBy: [{ sortOrder: "asc" }, { updatedAt: "desc" }, { id: "asc" }],
      take: take + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: {
        id: true,
        scope: true,
        access: true,
        status: true,
        title: true,
        subtitle: true,
        tags: true,
        sortOrder: true,
        format: true,
        style: true,
        thumbnailUrl: true,
        thumbnailW: true,
        thumbnailH: true,
        updatedAt: true,
        imageOrigin: true,
        baseImageUrl: true,
        baseWidth: true,
        baseHeight: true,
        baseTransformJson: true,
        imageAdjustmentsJson: true,

        backgroundImageUrl: true,
        backgroundTransformJson: true,
        foregroundImageUrl: true,
        foregroundTransformJson: true,
        swapDishEnabled: true,
        dishType: true,
      },
    }),
    prisma.preset.count({ where: whereSystem }),
    prisma.preset.count({ where: whereMine }),
  ]);

  const hasMore = rows.length > take;
  const items = hasMore ? rows.slice(0, take) : rows;
  const nextCursor = hasMore ? items[items.length - 1]!.id : null;

  const counts = {
    system: systemCount,
    mine: mineCount,
    all: systemCount + mineCount,
  };

  return res.json({
    items: items.map(toListDto),
    nextCursor,
    counts,
  });
});

presetsRouter.get("/:id", requireAuth, withTenant, async (req, res) => {
  const { tenantId } = (req as any).auth;
  const { id } = req.params;

  const preset = await prisma.preset.findFirst({
    where: {
      id,
      OR: [
        { scope: PresetScope.SYSTEM, tenantId: SYSTEM_TENANT_ID },
        { scope: PresetScope.TENANT, tenantId },
      ],
    },
  });

  if (!preset) return res.status(404).json({ error: "Preset not found" });

  // ✅ ВАЖНО: отправляем ответ, а не просто return объект
  return res.json(toDetailDto(preset));
});

presetsRouter.post("/", requireAuth, withTenant, async (req, res) => {

  const parsed = createBodySchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid body", details: parsed.error.issues });
  }

  const auth = (req as any).auth as { userId: string; tenantId: string; role?: "USER" | "SUPERADMIN" };
  const body = parsed.data;

  const normNullable = (v: unknown): string | null => {
    if (typeof v !== "string") return null;
    const s = v.trim();
    return s ? normalizeUploadsUrl(s) : null;
  };

  const normRequired = (v: unknown, field: string): string => {
    const s = normNullable(v);
    if (!s) throw new Error(`${field} is required`);
    return s;
  };

  const thumbnailUrl = normNullable(body.thumbnailUrl);
  const backgroundImageUrl = normNullable(body.backgroundImageUrl);

  const baseImageUrl = normNullable(body.baseImageUrl); // ✅ optional
  const foregroundImageUrl = normNullable(body.foregroundImageUrl); // optional

  const isSuper = auth.role === "SUPERADMIN";
  const requestedScope = (body.scope ?? "TENANT") as "TENANT" | "SYSTEM";

  const finalScope = isSuper && requestedScope === "SYSTEM" ? PresetScope.SYSTEM : PresetScope.TENANT;

  const finalTenantId = finalScope === PresetScope.SYSTEM ? SYSTEM_TENANT_ID : auth.tenantId;

  // защита: обычным юзерам нельзя SYSTEM
  if (requestedScope === "SYSTEM" && !isSuper) {
    return res.status(403).json({ error: "Only SUPERADMIN can create SYSTEM presets" });
  }

  const overlayInput = body.overlay ?? null;

  const overlayForCreate: Prisma.NullableJsonNullValueInput | Prisma.InputJsonValue =
    overlayInput ? remapOverlayIds(overlayInput) : Prisma.JsonNull;

  const created = await prisma.preset.create({
    data: {
      tenantId: finalTenantId,
      scope: finalScope,

      access: (body.access ?? "PRO") as PresetAccess,
      status: (body.status ?? "DRAFT") as PresetStatus,

      title: body.title,
      subtitle: body.subtitle ?? null,
      tags: body.tags ?? [],
      sortOrder: body.sortOrder ?? 0,

      format: body.format,
      imageOrigin: (body.imageOrigin ?? "AI") as ImageOrigin,
      prompt: body.prompt?.trim() || null,
      style: body.style ?? null,

      thumbnailUrl,
      thumbnailW: body.thumbnailW ?? null,
      thumbnailH: body.thumbnailH ?? null,

      baseImageUrl,
      baseWidth: body.baseWidth ?? null,
      baseHeight: body.baseHeight ?? null,
      baseTransformJson: body.baseTransformJson as any,
      imageAdjustmentsJson: (body.imageAdjustmentsJson ?? null) as any,

      backgroundImageUrl,
      backgroundTransformJson: body.backgroundTransformJson as any,

      foregroundImageUrl,
      foregroundTransformJson: body.foregroundTransformJson as any,

      swapDishEnabled: body.swapDishEnabled ?? false,
      dishType: body.dishType ?? null,


      //overlay: body.overlay as any,
      overlay: overlayForCreate,
      createdById: auth.userId,
    },
  });

  // ✅ Step 5: link assets used by this preset (best-effort)
  // try {
  //   const candidateUrls = new Set<string>();

  //   if (thumbnailUrl && thumbnailUrl.startsWith("/uploads/")) candidateUrls.add(thumbnailUrl);
  //   if (backgroundImageUrl && backgroundImageUrl.startsWith("/uploads/")) candidateUrls.add(backgroundImageUrl);

  //   if (baseImageUrl && baseImageUrl.startsWith("/uploads/")) candidateUrls.add(baseImageUrl);
  //   if (foregroundImageUrl && foregroundImageUrl.startsWith("/uploads/")) candidateUrls.add(foregroundImageUrl);

  //   for (const u of extractUploadUrlsFromOverlay(body.overlay)) {
  //     candidateUrls.add(u);
  //   }

  //   const urls = Array.from(candidateUrls);
  //   if (urls.length > 0) {
  //     // find matching assets for this tenant + those paths
  //     const assets = await prisma.asset.findMany({
  //       where: {
  //         tenantId: finalTenantId,
  //         status: "ACTIVE",
  //         storagePath: { in: urls },
  //       },
  //       select: { id: true, kind: true },
  //     });

  //     if (assets.length > 0) {
  //       await prisma.presetAsset.createMany({
  //         data: assets.map((a) => ({
  //           presetId: created.id,
  //           assetId: a.id,
  //           kind: a.kind, // опционально, но удобно
  //         })),
  //         skipDuplicates: true,
  //       });

  //       // optional: update lastUsedAt
  //       await prisma.asset.updateMany({
  //         where: { id: { in: assets.map((a) => a.id) } },
  //         data: { lastUsedAt: new Date() },
  //       });
  //     }
  //   }
  // } 

  try {
    const candidateUrls = new Set<string>();

    if (thumbnailUrl?.startsWith("/uploads/")) candidateUrls.add(thumbnailUrl);
    if (backgroundImageUrl?.startsWith("/uploads/")) candidateUrls.add(backgroundImageUrl);
    if (baseImageUrl?.startsWith("/uploads/")) candidateUrls.add(baseImageUrl);
    if (foregroundImageUrl?.startsWith("/uploads/")) candidateUrls.add(foregroundImageUrl);

    for (const u of extractUploadUrlsFromOverlay(body.overlay)) {
      if (u.startsWith("/uploads/")) candidateUrls.add(u);
    }

    for (const u of candidateUrls) {
      const kind: AssetKind =
        u === thumbnailUrl ? "PRESET_THUMBNAIL" :
          // base/background/foreground — это “base images” дизайна/шаблона
          (u === baseImageUrl || u === backgroundImageUrl || u === foregroundImageUrl) ? "DESIGN_BASE_IMAGE" :
            // pics из overlay
            "DESIGN_OVERLAY_PIC";

      const asset = await ensureAssetForUploadsUrl({
        tenantId: finalTenantId,
        uploadsUrl: u,
        kind,
      });

      await linkAssetToPreset({
        presetId: created.id,
        assetId: asset.id,
        kind: asset.kind,
      });
    }
  } catch (e) {
    console.warn("[POST /presets] preset asset linking failed (ignored):", e);
  }
  return res.status(201).json(toListDto(created));
});

presetsRouter.patch("/:id", requireAuth, withTenant, async (req, res) => {
  const parsed = patchBodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid body", details: parsed.error.issues });
  }

  const { tenantId } = (req as any).auth;
  const { id } = req.params;
  const body = parsed.data;

  const existing = await prisma.preset.findFirst({
    where: { id, tenantId, scope: PresetScope.TENANT },
    select: { id: true, thumbnailUrl: true, baseImageUrl: true },
  });

  if (!existing) return res.status(404).json({ error: "Preset not found (tenant preset)" });

  // --- helpers ---
  const normNullable = (v: unknown): string | null => {
    if (typeof v !== "string") return null;
    const s = v.trim();
    return s ? normalizeUploadsUrl(s) : null;
  };

  const normPatchUrl = (v: unknown): string | null | undefined => {
    // undefined => do not change
    if (v === undefined) return undefined;
    // null / "" / "  " => set null
    if (v === null) return null;
    return normNullable(v); // returns string|null
  };

  const nextThumbRel = (() => {
    const v = body.thumbnailUrl;
    if (v === undefined) return undefined;
    if (v === null) return null;

    if (typeof v !== "string") return null;
    const s = v.trim();
    if (!s) return null;

    // если уже /uploads/... оставим, иначе normalizeUploadsUrl приведет к /uploads/...
    return extractRelativeUploadPath(s) ?? normalizeUploadsUrl(s);
  })();

  const nextBaseImageUrl = normPatchUrl(body.baseImageUrl);
  const nextBgImageUrl = normPatchUrl(body.backgroundImageUrl);
  const nextFgImageUrl = normPatchUrl(body.foregroundImageUrl);

  const updated = await prisma.preset.update({
    where: { id },
    data: {
      ...(body.title !== undefined ? { title: body.title } : {}),
      ...(body.subtitle !== undefined ? { subtitle: body.subtitle ?? null } : {}),
      ...(body.tags !== undefined ? { tags: body.tags ?? [] } : {}),
      ...(body.sortOrder !== undefined ? { sortOrder: body.sortOrder ?? 0 } : {}),

      ...(body.format !== undefined ? { format: body.format } : {}),
      ...(body.prompt !== undefined ? { prompt: body.prompt ?? null } : {}),
      ...(body.style !== undefined ? { style: body.style ?? null } : {}),
      ...(body.imageOrigin !== undefined ? { imageOrigin: body.imageOrigin as ImageOrigin } : {}),

      ...(body.thumbnailUrl !== undefined ? { thumbnailUrl: nextThumbRel } : {}),
      ...(body.thumbnailW !== undefined ? { thumbnailW: body.thumbnailW ?? null } : {}),
      ...(body.thumbnailH !== undefined ? { thumbnailH: body.thumbnailH ?? null } : {}),

      ...(body.overlay !== undefined ? { overlay: body.overlay as any } : {}),

      ...(body.baseImageUrl !== undefined ? { baseImageUrl: nextBaseImageUrl ?? null } : {}),
      ...(body.baseWidth !== undefined ? { baseWidth: body.baseWidth ?? null } : {}),
      ...(body.baseHeight !== undefined ? { baseHeight: body.baseHeight ?? null } : {}),
      ...(body.baseTransformJson !== undefined ? { baseTransformJson: body.baseTransformJson as any } : {}),
      ...(body.imageAdjustmentsJson !== undefined ? { imageAdjustmentsJson: (body.imageAdjustmentsJson ?? null) as any } : {}),

      ...(body.backgroundImageUrl !== undefined ? { backgroundImageUrl: nextBgImageUrl ?? null } : {}),
      ...(body.backgroundTransformJson !== undefined ? { backgroundTransformJson: body.backgroundTransformJson as any } : {}),

      ...(body.foregroundImageUrl !== undefined ? { foregroundImageUrl: nextFgImageUrl ?? null } : {}),
      ...(body.foregroundTransformJson !== undefined ? { foregroundTransformJson: body.foregroundTransformJson as any } : {}),

      ...(body.swapDishEnabled !== undefined ? { swapDishEnabled: body.swapDishEnabled } : {}),
      ...(body.dishType !== undefined ? { dishType: body.dishType ?? null } : {}),

      ...(body.access !== undefined ? { access: body.access as PresetAccess } : {}),
      ...(body.status !== undefined ? { status: body.status as PresetStatus } : {}),
    },
  });

  // --- storage hygiene: delete old thumbnail file if changed ---
  if (body.thumbnailUrl !== undefined) {
    const oldThumbRel = extractRelativeUploadPath(existing.thumbnailUrl ?? "");
    const oldBaseRel = extractRelativeUploadPath(existing.baseImageUrl ?? "");
    const newThumbRelUploads = extractRelativeUploadPath(updated.thumbnailUrl ?? "");

    // удаляем только если:
    // - старый thumb был uploads
    // - новый тоже uploads (иначе непонятно что удалять)
    // - реально изменился
    // - не совпадает с baseImageUrl
    if (
      oldThumbRel &&
      newThumbRelUploads &&
      oldThumbRel !== newThumbRelUploads &&
      oldThumbRel !== oldBaseRel
    ) {
      const abs = relUploadToAbs(oldThumbRel);
      fs.unlink(abs, (err) => {
        if (!err) return;
        if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
          console.warn("[PATCH /presets/:id] failed to unlink old thumb:", oldThumbRel, err);
        }
      });
    }
  }

  return res.json(toDetailDto(updated));
});


presetsRouter.post("/:id/render-thumbnail", requireAuth, withTenant, async (req, res) => {
  try {
    const { tenantId } = (req as any).auth;
    const { id } = req.params;

    const preset = await prisma.preset.findFirst({
      where: {
        id,
        OR: [
          { scope: PresetScope.SYSTEM, tenantId: SYSTEM_TENANT_ID },
          { scope: PresetScope.TENANT, tenantId },
        ],
      },
      select: {
        id: true,
        scope: true,
        tenantId: true,

        thumbnailUrl: true,
        overlay: true,
        format: true,

        // важно: фон пресета
        backgroundImageUrl: true,     
        baseImageUrl: true,           

        baseTransformJson: true,
        baseWidth: true,
        baseHeight: true,
        imageAdjustmentsJson: true,
      },
    });

    if (!preset) return res.status(404).json({ error: "Preset not found" });

    const { outW, outH } = getThumbSizeByRatio(preset.format, 512);

    const baseW = preset.baseWidth ?? 1024;
    const baseH = preset.baseHeight ?? 1024;

    const uploadsDir = ensureUploadsImagesDir();
    const overlay = (preset.overlay as any) ?? undefined;

    // 1) выбираем лучший источник base image (в правильном порядке)
    const baseRel =
      extractRelativeUploadPath(preset.backgroundImageUrl ?? "") ||
      extractRelativeUploadPath(preset.baseImageUrl ?? "") ||
      extractRelativeUploadPath(preset.thumbnailUrl ?? "");

    let pngBuffer: Buffer;

    if (baseRel) {
      const basePath = relUploadToAbs(baseRel);

      if (fs.existsSync(basePath)) {
        // только если реально есть base image — считаем transform и рисуем композит
        const rawT = (preset.baseTransformJson as Record<string, unknown> | null) ?? {};
        const rawOffsetX = Number(rawT.offsetX ?? 0);
        const rawOffsetY = Number(rawT.offsetY ?? 0);
        const rawScale = Number(rawT.scale ?? 1);
        const rawFitMode = rawT.fitMode === "contain" ? "contain" : "cover";

        const baseTransform = {
          offsetX: rawOffsetX * (outW / baseW),
          offsetY: rawOffsetY * (outH / baseH),
          scale: rawScale,
          fitMode: rawFitMode as "cover" | "contain",
        };

        pngBuffer = await renderCompositeImage({
          baseImagePath: basePath,
          outW,
          outH,
          baseW,
          baseH,
          baseTransform,
          imageAdjustments: (preset.imageAdjustmentsJson ?? undefined) as any,
          overlay,
          uploadsDir,
          watermark: false,
        });
      } else {
        // baseRel был, но файла нет — не падаем, делаем overlay-only thumb
        pngBuffer = await renderOverlayOnlyImage({
          outW,
          outH,
          baseW,
          baseH,
          overlay,
          uploadsDir,
          watermark: false,
          backgroundColor: "#0b1220",
        });
      }
    } else {
      // вообще нет base image — overlay-only thumb
      pngBuffer = await renderOverlayOnlyImage({
        outW,
        outH,
        baseW,
        baseH,
        overlay,
        uploadsDir,
        watermark: false,
        backgroundColor: "#0b1220",
      });
    }

    // 2) save new thumbnail
    const fileId = `preset_thumb_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const filename = `${fileId}.png`;
    const absPath = path.join(uploadsDir, filename);

    fs.writeFileSync(absPath, pngBuffer);

    const newThumbRel = `/uploads/images/${filename}`;

    // 3) delete old thumbnail (ONLY TENANT presets, and ONLY if it was uploads path)
    const isTenantPreset = preset.scope === PresetScope.TENANT;
    const oldThumbRel = extractRelativeUploadPath(preset.thumbnailUrl ?? "");

    if (isTenantPreset && oldThumbRel) {
      const oldAbs = relUploadToAbs(oldThumbRel);

      // ⚠️ не удаляем, если вдруг совпало с тем, что использовали как baseRel
      if (oldThumbRel !== baseRel) {
        fs.unlink(oldAbs, (err) => {
          if (err && (err as any).code !== "ENOENT") {
            console.warn("[render-thumbnail] failed to unlink old thumb:", oldThumbRel, err);
          }
        });
      }
    }

    // 4) update preset record
    const updated = await prisma.preset.update({
      where: { id: preset.id },
      data: {
        thumbnailUrl: newThumbRel,
        thumbnailW: outW,
        thumbnailH: outH,
      },
      select: { id: true, thumbnailUrl: true, thumbnailW: true, thumbnailH: true },
    });

    return res.json(updated);
  } catch (e) {
    console.error("[POST /presets/:id/render-thumbnail] error", e);
    return res.status(500).json({ error: "Internal server error" });
  }
});


presetsRouter.delete("/:id", requireAuth, withTenant, async (req, res) => {
  try {
    const { tenantId } = (req as any).auth;
    const { id } = req.params;

    const preset = await prisma.preset.findFirst({
      where: { id, scope: PresetScope.TENANT, tenantId },
      select: { id: true, scope: true, tenantId: true, thumbnailUrl: true, },
    });

    if (!preset) return res.status(404).json({ error: "Preset not found" });

    // 1) забираем assetIds, привязанные к этому preset
    const links = await prisma.presetAsset.findMany({
      where: { presetId: preset.id },
      select: { assetId: true },
    });

    const assetIds = Array.from(new Set(links.map((x) => x.assetId)));

    // 2) удаляем preset + его links (лучше в транзакции)
    await prisma.$transaction([
      prisma.presetAsset.deleteMany({ where: { presetId: preset.id } }),
      prisma.preset.delete({ where: { id: preset.id } }),
    ]);

    const deletedAssets: string[] = [];
    const keptAssets: string[] = [];

    // 🔥 Always delete preset thumbnail (owned file)
    if (preset.thumbnailUrl?.startsWith("/uploads/")) {
      try {
        const abs = uploadsUrlToAbsPath(preset.thumbnailUrl);
        fs.unlink(abs, (err) => {
          if (!err) return;
          if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
            console.warn("[DELETE /presets/:id] unlink thumb failed:", err);
          }
        });
      } catch {
        // ignore
      }
    }


    // 3) для каждого assetId проверяем refcount: PresetAsset + ProDesignAsset
    for (const assetId of assetIds) {
      const [presetRefs, designRefs] = await Promise.all([
        prisma.presetAsset.count({ where: { assetId } }),
        prisma.proDesignAsset.count({ where: { assetId } }),
      ]);

      if (presetRefs > 0 || designRefs > 0) {
        keptAssets.push(assetId);
        continue;
      }

      // 4) orphan: помечаем DELETED (физически удалит purge job)
      const a = await prisma.asset.update({
        where: { id: assetId },
        data: { status: "DELETED" },
        select: { storagePath: true },
      });

      deletedAssets.push(assetId);

      if (a.storagePath?.startsWith("/uploads/")) {
        try {
          const abs = uploadsUrlToAbsPath(a.storagePath);
          fs.unlink(abs, (err) => {
            if (!err) return;
            if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
              console.warn("[DELETE /presets/:id] unlink failed:", a.storagePath, err);
            }
          });
        } catch {
          // ignore
        }
      }

    }

    return res.json({ ok: true, deletedAssets, keptAssets });
  } catch (e) {
    console.error("[DELETE /presets/:id] error", e);
    return res.status(500).json({ error: "Internal server error" });
  }
});
// presetsRouter.delete("/:id", requireAuth, withTenant, async (req, res) => {
//   try {
//     const { tenantId } = (req as any).auth;
//     const { id } = req.params;

//     // Ищем только TENANT preset текущего tenant
//     const preset = await prisma.preset.findFirst({
//       where: {
//         id,
//         scope: PresetScope.TENANT,
//         tenantId,
//       },
//       select: {
//         id: true,
//         scope: true,
//         tenantId: true,
//         thumbnailUrl: true,
//         baseImageUrl: true,
//         backgroundImageUrl: true,
//         foregroundImageUrl: true,
//         overlay: true, // or overlayJson — whichever you use in schema
//       },
//     });

//     if (!preset) return res.status(404).json({ error: "Preset not found" });

//     // SYSTEM тут уже невозможен (мы scope=TENANT), но оставлю защиту:
//     if (preset.scope === PresetScope.SYSTEM) {
//       return res.status(403).json({ error: "SYSTEM presets cannot be deleted" });
//     }

//     // ✅ 1) collect all candidate upload paths
//     // make sure collectPresetUploadPaths uses extractRelativeUploadPath internally
//     const usedPaths = collectPresetUploadPaths(preset);

//     // ✅ 2) delete preset row first (recommended)
//     await prisma.preset.delete({ where: { id: preset.id } });

//     const deleted: string[] = [];
//     const skipped: string[] = [];

//     // ✅ 3) try deleting files that are not referenced elsewhere
//     for (const rel of usedPaths) {
//       if (!rel) continue;

//       // only our uploads
//       if (!rel.startsWith("/uploads/")) {
//         skipped.push(rel);
//         continue;
//       }

//       // if referenced by another preset — do not delete
//       const stillUsed = await isFileReferencedByOtherPresets(prisma, tenantId, preset.id, rel);
//       if (stillUsed) {
//         skipped.push(rel);
//         continue;
//       }

//       const abs = relUploadToAbs(rel);

//       // do not block request on unlink
//       fs.unlink(abs, (err) => {
//         if (!err) return;
//         if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
//           console.warn("[DELETE /presets/:id] failed to unlink:", rel, err);
//         }
//       });

//       deleted.push(rel);
//     }

//     return res.json({ ok: true, deleted, skipped });
//   } catch (e) {
//     console.error("[DELETE /presets/:id] error", e);
//     return res.status(500).json({ error: "Internal server error" });
//   }
// });

presetsRouter.post("/:id/apply-preset", requireAuth, withTenant, async (req, res) => {
  try {
    if (!req.auth) return res.status(401).json({ error: "Unauthorized" });

    const { userId, tenantId } = req.auth;
    const proDesignId = (req.params.id || "").trim();

    const parsed = applyPresetBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid body", details: parsed.error.issues });
    }

    const { presetId, overlayMode, imageMode, zOffset = 100 } = parsed.data;

    const design = await prisma.proDesign.findFirst({
      where: { id: proDesignId, tenantId, userId },
    });
    if (!design) return res.status(404).json({ error: "ProDesign not found" });

    const preset = await prisma.preset.findFirst({
      where: {
        id: presetId,
        OR: [
          { scope: "SYSTEM", tenantId: SYSTEM_TENANT_ID },
          { scope: "TENANT", tenantId },
        ],
      },
    });
    if (!preset) return res.status(404).json({ error: "Template not found" });

    if (design.presetId && design.presetId === preset.id) {
      return res.status(409).json({ error: "TEMPLATE_ALREADY_APPLIED" });
    }

    //const currentOverlay = (design.overlayJson ?? Prisma.JsonNull) as Prisma.InputJsonValue;
    const currentOverlayFromClient =
      req.body?.currentOverlay && typeof req.body.currentOverlay === "object"
        ? (req.body.currentOverlay as Prisma.InputJsonValue)
        : null;

    const currentOverlay =
      overlayMode === "MERGE"
        ? (currentOverlayFromClient ?? (design.overlayJson ?? Prisma.JsonNull) as Prisma.InputJsonValue)
        : (design.overlayJson ?? Prisma.JsonNull) as Prisma.InputJsonValue;

    const incomingOverlayRaw = preset.overlay ?? Prisma.JsonNull;

    // ✅ если MERGE — клонируем incoming с новыми id, чтобы не было конфликтов
    const incomingOverlayForMerge = overlayMode === "MERGE"
      ? remapOverlayIds(incomingOverlayRaw)
      : incomingOverlayRaw;

    // дальше — merge / replace
    const nextOverlay =
      overlayMode === "MERGE"
        ? mergeOverlayJson(
          currentOverlay,
          incomingOverlayForMerge as unknown as Prisma.InputJsonValue,
          zOffset
        )
        : (incomingOverlayForMerge as unknown as Prisma.InputJsonValue);
    // ✅ ВАЖНО: в пресетах реальная картинка — backgroundImageUrl
    const presetImageUrl = preset.backgroundImageUrl ?? preset.baseImageUrl ?? null;

    // ✅ REPLACE должен менять baseImageUrl (потому что редактор рисует base)
    const nextBaseImageUrl =
      imageMode === "REPLACE"
        ? (presetImageUrl ?? design.baseImageUrl)
        : design.baseImageUrl;

    // Если юзер выбрал REPLACE, а у пресета нет картинки — лучше явно сообщить
    if (imageMode === "REPLACE" && !presetImageUrl) {
      return res.status(400).json({ error: "Preset has no image to replace with" });
    }

    const updated = await prisma.proDesign.update({
      where: { id: design.id },
      data: {
        presetId: preset.id,
        baseImageUrl: nextBaseImageUrl,

        overlayJson: nextOverlay,

        // ⚠️ спорный момент: эти поля ты сейчас всегда затираешь пресетом
        // оставляю как есть, но ниже скажу как лучше
        baseTransformJson: preset.baseTransformJson ?? Prisma.DbNull,
        imageAdjustmentsJson: preset.imageAdjustmentsJson ?? Prisma.DbNull,

        status: "DRAFT",
      },
      select: {
        id: true,
        presetId: true,
        baseImageUrl: true,
        overlayJson: true,
        baseTransformJson: true,
        imageAdjustmentsJson: true,
      },
    });

    return res.json(updated);
  } catch (err) {
    console.error("[apply-preset] error", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});



presetsRouter.post("/load-image",
  requireAuth,
  withTenant,
  async (req, res) => {
    try {
      if (!req.auth) return res.status(401).json({ error: "Unauthorized" });

      const { tenantId, userId } = (req as any).auth;

      const baseImageUrl = String(req.body?.baseImageUrl ?? "").trim();

      // строгая защита: только /uploads/...
      if (!baseImageUrl.startsWith("/uploads/")) {
        return res.status(400).json({ error: "baseImageUrl must be a /uploads/... path" });
      }

      // размеры можно оставить null или передавать позже
      const design = await prisma.proDesign.create({
        data: {
          tenantId,
          userId,
          baseImageUrl,
          width: Number(req.body?.width ?? 0) || 1024,
          height: Number(req.body?.height ?? 0) || 1024,

          // если у тебя есть эти поля:
          baseWidth: Number(req.body?.baseWidth ?? 0) || null,
          baseHeight: Number(req.body?.baseHeight ?? 0) || null,
          overlayJson: null,
          baseTransformJson: req.body?.baseTransform ?? null,

          imageAdjustmentsJson: req.body?.imageAdjustments ?? null,

          prompt: "",
        } as any,
      });

      return res.json({
        id: design.id,
        baseImageUrl: design.baseImageUrl,
        width: design.width,
        height: design.height,
      });
    } catch (e) {
      console.error("[from-existing]", e);
      return res.status(500).json({ error: "Internal error" });
    }
  }
);


presetsRouter.post("/create-empty-design", requireAuth, withTenant, async (req, res) => {
  try {
    if (!req.auth) return res.status(401).json({ error: "Unauthorized" });
    const { tenantId, userId } = req.auth;

    const width = Number(req.body?.width ?? 0) || 10;
    const height = Number(req.body?.height ?? 0) || 10;

    // системная пустая картинка (ты создаёшь/кладёшь её один раз)
    const blankBaseImageUrl = "/uploads/system/blank-24.png";

    const design = await prisma.proDesign.create({
      data: {
        tenantId,
        userId,
        baseImageUrl: blankBaseImageUrl,
        width,
        height,
        baseWidth: width,
        baseHeight: height,
        overlayJson: null,
        prompt: "",
        status: "DRAFT",
      } as any, // если у тебя поля строгие — уберём any после (см. ниже)
    });

    return res.json({
      id: design.id,
      baseImageUrl: design.baseImageUrl,
      width: design.width,
      height: design.height,
    });
  } catch (e) {
    console.error("[create-empty-design]", e);
    return res.status(500).json({ error: "Internal error" });
  }
});

