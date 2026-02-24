import path from "path";
import fs from "fs";
import { z } from "zod";
import type { ImageAdjustments, BaseTransform } from "./renderCompositeImage";
import { renderCompositeImage } from "./renderCompositeImage";

// ⚠️ подгони путь, если у тебя BaseTransform лежит в другом месте
import type { OverlayTextConfig, OverlayPicConfig, OverlayRectConfig } from "./types/ai.types";

export type OverlayConfig = {
  texts?: OverlayTextConfig[];
  pics?: OverlayPicConfig[];
  rects?: OverlayRectConfig[];
};

const overlaySchema = z.looseObject({
  texts: z.array(z.any()).optional(),
  pics: z.array(z.any()).optional(),
  rects: z.array(z.any()).optional(),
});


function stripHidden(overlay: OverlayConfig | undefined): OverlayConfig | undefined {
  if (!overlay) return undefined;

  const next: OverlayConfig = { ...overlay };

  if (Array.isArray(next.texts)) {
    next.texts = next.texts.filter((t) => t?.visible !== false);
  }
  if (Array.isArray(next.pics)) {
    next.pics = next.pics.filter((p) => p?.visible !== false);
  }
  if (Array.isArray(next.rects)) {
    next.rects = next.rects.filter((r) => r?.visible !== false);
  }

  return next;
}

export function extractRelativeUploadPath(url: string): string | null {
  const s = (url || "").trim();
  if (!s.startsWith("/uploads/")) return null;
  return s;
}

export function relUploadToAbs(rel: string): string {
  // у тебя в коде uploads/images — сохраняем этот контракт
  const uploadsDir = path.join(process.cwd(), "uploads");
  return path.join(uploadsDir, rel.replace(/^\/uploads\//, ""));
}

export type RenderSceneArgs = {
  backgroundImageUrl: string; // /uploads/images/...
  outW: number;
  outH: number;

  // координатная система оверлея (editor base size)
  baseW: number;
  baseH: number;

  // как рисовать background
  backgroundTransform: BaseTransform;

  overlay?: unknown; // из Prisma Json
  imageAdjustments?: ImageAdjustments;
  uploadsDirAbs: string; // .../uploads/images
};

export async function renderSceneWithOverlay(args: RenderSceneArgs): Promise<Buffer> {
  const rel = extractRelativeUploadPath(args.backgroundImageUrl);
  if (!rel) {
    throw new Error("backgroundImageUrl must be an /uploads path");
  }

  const absBg = relUploadToAbs(rel);
  if (!fs.existsSync(absBg)) {
    throw new Error(`Background file not found: ${rel}`);
  }

  const overlayParsed = args.overlay == null
    ? undefined
    : typeof args.overlay === "string"
      ? overlaySchema.parse(JSON.parse(args.overlay))
      : overlaySchema.parse(args.overlay);

  const overlayClean = stripHidden(overlayParsed as unknown as OverlayConfig);

  return renderCompositeImage({
    baseImagePath: absBg,
    outW: args.outW,
    outH: args.outH,
    baseW: args.baseW,
    baseH: args.baseH,
    baseTransform: args.backgroundTransform,
    imageAdjustments: args.imageAdjustments,
    overlay: overlayClean,
    uploadsDir: args.uploadsDirAbs,
    watermark: false,
  });
}
