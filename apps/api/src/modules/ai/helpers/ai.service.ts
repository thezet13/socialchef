import path from "path";
import fs from "fs";

type PostType =
  | 'DISH'
  | 'PROMO'
  | 'BRAND_STORY'
  | 'TEAM'
  | 'SALES'
  | 'STORY_CAPTION';



  function aspect(w: number, h: number) {
  return w > 0 && h > 0 ? w / h : 1;
}

type AiEditSize = { w: number; h: number; label: "SQUARE" | "PORTRAIT" | "LANDSCAPE" };

/**
 * Choose ONLY supported edit sizes.
 * - near-square -> 1024x1024
 * - portrait -> 1024x1536
 * - landscape -> 1536x1024
 */


// preview resize helper (как в restyle)
export function previewSize(w: number, h: number, maxSide = 512) {
  const m = Math.max(w, h);
  const k = maxSide / m;
  return {
    w: Math.max(64, Math.round(w * k)),
    h: Math.max(64, Math.round(h * k)),
  };
}

export function resolveAiEditSize(targetW: number, targetH: number): AiEditSize {
  const ar = aspect(targetW, targetH);

  // square-ish tolerance
  if (ar >= 0.92 && ar <= 1.08) return { w: 1024, h: 1024, label: "SQUARE" };

  // portrait
  if (ar < 1) return { w: 1024, h: 1536, label: "PORTRAIT" };

  // landscape
  return { w: 1536, h: 1024, label: "LANDSCAPE" };
}

export function savePngToUploads(args: { uploadsImagesDir: string; prefix: string; png: Buffer }): { url: string; absPath: string } {
  const { uploadsImagesDir, prefix, png } = args;

  const id = `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const filename = `${id}.png`;
  const absPath = path.join(uploadsImagesDir, filename);

  fs.writeFileSync(absPath, png);
  return { url: `/uploads/images/${filename}`, absPath };
}

