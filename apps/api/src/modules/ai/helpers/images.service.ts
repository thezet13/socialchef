import path from "path";
import fs from "fs";
import fsp from "fs/promises";
import { uploadsImagesDir, UPLOADS_DIR_ABS } from "@/lib/uploadsPaths";

export const EXPORT_CAP = 10;

export function guessMimeByExt(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".webp") return "image/webp";
  return "image/png";
}

import { createCanvas, loadImage } from '@napi-rs/canvas';



export function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

export function makeInpaintMaskPng(
  w: number,
  h: number,
  boxes: Array<{ x: number; y: number; width: number; height: number }>,
  pad: number
): Buffer {
  const canvas = createCanvas(w, h);
  const ctx = canvas.getContext("2d");

  // Start fully opaque (keep everywhere)
  ctx.fillStyle = "rgba(0,0,0,1)";
  ctx.fillRect(0, 0, w, h);

  // Make text regions transparent => editable
  ctx.globalCompositeOperation = "destination-out";
  ctx.fillStyle = "rgba(0,0,0,1)";

  for (const b of boxes) {
    const x = clamp(Math.floor(b.x - pad), 0, w);
    const y = clamp(Math.floor(b.y - pad), 0, h);
    const ww = clamp(Math.ceil(b.width + pad * 2), 1, w - x);
    const hh = clamp(Math.ceil(b.height + pad * 2), 1, h - y);
    ctx.fillRect(x, y, ww, hh);
  }

  return canvas.toBuffer("image/png");
}

export function guessMimeFromPath(p: string): "image/png" | "image/jpeg" | "image/webp" {
  const ext = (path.extname(p) || "").toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".webp") return "image/webp";
  // default (safe): encode to PNG before sending (см. ниже)
  return "image/png";
}


export function safeToDataUrl(filePath: string): string {
  const mime = guessMimeByExt(filePath);
  const buf = fs.readFileSync(filePath);
  const b64 = buf.toString("base64");
  return `data:${mime};base64,${b64}`;
}

export async function readAsPngBuffer(filePath: string): Promise<Buffer> {
  const img = await loadImage(fs.readFileSync(filePath));
  const w = (img as any).width;
  const h = (img as any).height;

  const canvas = createCanvas(w, h);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img as any, 0, 0, w, h);

  return canvas.toBuffer("image/png");
}

export async function callOpenAIImageEditViaFetch(opts: {
  apiKey: string;
  model: string; // gpt-image-1
  prompt: string;
  imagePng: Buffer;
  maskPng: Buffer;
}): Promise<Buffer> {
  const form = new FormData();
  form.append("model", opts.model);
  form.append("prompt", opts.prompt);

  // ВАЖНО: передаём Blob с type и filename
  form.append(
    "image",
    new Blob([new Uint8Array(opts.imagePng)], { type: "image/png" }),
    "image.png"
  );

  form.append(
    "mask",
    new Blob([new Uint8Array(opts.maskPng)], { type: "image/png" }),
    "mask.png"
  );
  const r = await fetch("https://api.openai.com/v1/images/edits", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${opts.apiKey}`,
    },
    body: form,
  });

  const json = await r.json().catch(() => null);

  if (!r.ok) {
    throw new Error(`OpenAI images/edits failed: ${r.status} ${JSON.stringify(json)}`);
  }

  const b64 = json?.data?.[0]?.b64_json;
  if (!b64) throw new Error("OpenAI edit returned no b64_json");

  return Buffer.from(b64, "base64");
}

// загрузка картинки /uploads/images/* с диска
export function loadUploadsImageBuffer(uploadsDir: string, relUrl: string): Buffer {
  const filename = relUrl.split("/").pop();
  if (!filename) throw new Error("Invalid image url");
  const abs = path.join(uploadsDir, filename);
  if (!fs.existsSync(abs)) throw new Error(`File not found on disk: ${relUrl}`);
  return fs.readFileSync(abs);
}


function uploadsAbsPathWithFolder(input: string) {
  if (!input) throw new Error("Empty uploads url");

  let p = input.trim();

  // ✅ if absolute URL -> take pathname
  if (p.startsWith("http://") || p.startsWith("https://")) {
    try {
      const u = new URL(p);
      p = u.pathname;
    } catch {
    }
  }

  // normalize to "/uploads/..."
  const clean = p.startsWith("/") ? p : `/${p}`;

  if (!clean.startsWith("/uploads/")) {
    throw new Error(`Not an uploads url: ${input}`);
  }

  const subPath = clean.slice("/uploads/".length); // "images/asset.png"
  return path.join(UPLOADS_DIR_ABS, subPath);
}

export async function loadUploadsAnyAsPng(relUrl: string): Promise<Buffer> {
  // поддерживаем /uploads/images, /uploads/image-styles, /uploads/brand-styles и т.д.
  const abs = uploadsAbsPathWithFolder(relUrl);
  if (!fs.existsSync(abs)) throw new Error(`File not found on disk: ${relUrl}`);
  // если это не PNG — перекодируем в PNG (самый стабильный формат для OpenAI edits)
  return await readAsPngBuffer(abs);
}

export function fileFromPng(png: Buffer, name: string) {
  return new File([new Uint8Array(png)], name, { type: "image/png" });
}




function isFinalUploadsImageUrl(u: string) {
  return typeof u === "string" && u.startsWith("/uploads/images/final_");
}

function uploadsImagesUrlToAbsPath(imageUrl: string) {
  const file = imageUrl.split("/").pop();
  if (!file) throw new Error("Invalid imageUrl");
  const abs = path.join(uploadsImagesDir, file);

  // safety
  const root = path.resolve(uploadsImagesDir);
  const resolved = path.resolve(abs);
  if (!resolved.startsWith(root + path.sep) && resolved !== root) {
    throw new Error("Unsafe path");
  }
  return abs;
}

async function unlinkBestEffort(absPath: string) {
  try {
    await fsp.unlink(absPath);
  } catch {
    // ignore
  }
}

/**
 * Keep only latest `cap` exports (GeneratedImage with final_*) per tenant.
 * Deletes DB rows + physical files.
 */
export async function enforceExportHistory(prisma: any, tenantId: string, cap = EXPORT_CAP) {
  const extras = await prisma.generatedImage.findMany({
    where: {
      tenantId,
      imageUrl: { startsWith: "/uploads/images/final_" },
    },
    orderBy: { createdAt: "desc" },
    skip: cap,
    take: 1000,
    select: { id: true, imageUrl: true },
  });

  if (extras.length === 0) return { deleted: 0 };

  // 1) delete DB rows first (so UI/API is consistent even if file delete fails)
  await prisma.generatedImage.deleteMany({
    where: { id: { in: extras.map((x: any) => x.id) } },
  });

  // 2) delete files best-effort
  for (const x of extras) {
    if (!isFinalUploadsImageUrl(x.imageUrl)) continue;
    try {
      const abs = uploadsImagesUrlToAbsPath(x.imageUrl);
      await unlinkBestEffort(abs);
    } catch {}
  }

  return { deleted: extras.length };
}