import { PresetDetailDto, PresetForCleanup, PresetListDto, PresetOverlay } from "./presets.types";
import path from "path";
import fs from "fs";
import { type ImageAdjustments } from "../ai/renderCompositeImage";
import { Prisma } from "@prisma/client";
import crypto from "crypto";

export function toListDto(p: any): PresetListDto {
  return {
    id: p.id,
    scope: p.scope,
    access: p.access,
    status: p.status,

    title: p.title,
    subtitle: p.subtitle ?? null,
    tags: p.tags ?? [],
    sortOrder: p.sortOrder ?? 0,

    format: p.format,
    style: p.style ?? null,

    thumbnailUrl: p.thumbnailUrl,
    thumbnailW: p.thumbnailW ?? null,
    thumbnailH: p.thumbnailH ?? null,

    baseImageUrl: p.baseImageUrl,

    baseWidth: p.baseWidth ?? null,
    baseHeight: p.baseHeight ?? null,
    baseTransformJson: p.baseTransformJson ?? null,
    imageAdjustmentsJson: (p.imageAdjustmentsJson ?? null) as ImageAdjustments | null,

    backgroundImageUrl: p.backgroundImageUrl,
    backgroundTransformJson: p.backgroundTransformJson ?? null,

    foregroundImageUrl: p.foregroundImageUrl ?? null,
    foregroundTransformJson: p.foregroundTransformJson ?? null,

    swapDishEnabled: !!p.swapDishEnabled,
    dishType: p.dishType ?? null,

    updatedAt: new Date(p.updatedAt).toISOString(),
  };
}

export function toDetailDto(p: any): PresetDetailDto {
  return {
    ...toListDto(p),
    prompt: p.prompt,
    overlay: (p.overlay ?? {}) as PresetOverlay,
  };
}

export function getThumbSizeByRatio(format: string | null | undefined, maxSide = 512) {
  const f = (format ?? "1:1").trim();

  const [a, b] = f.split(":").map((x) => Number(x));
  const r = a > 0 && b > 0 ? a / b : 1; // width/height

  let outW = maxSide;
  let outH = Math.round(maxSide / r);

  // если вышло выше maxSide — перевернём расчёт
  if (outH > maxSide) {
    outH = maxSide;
    outW = Math.round(maxSide * r);
  }

  return { outW, outH };
}

export function normalizeUploadsUrl(url: string) {
  try {
    const u = new URL(url);
    if (u.pathname.startsWith("/uploads/")) return u.pathname;
    return url;
  } catch {
    return url;
  }
}


export function extractUploadUrlsFromOverlay(overlay: unknown): string[] {
  if (!overlay || typeof overlay !== "object") return [];

  const o = overlay as Record<string, unknown>;
  const pics = o.pics;

  if (!Array.isArray(pics)) return [];

  const urls: string[] = [];
  for (const p of pics) {
    if (p && typeof p === "object") {
      const url = (p as Record<string, unknown>).url;
      if (typeof url === "string" && url.startsWith("/uploads/")) {
        urls.push(url);
      }
    }
  }
  return urls;
}

export function extractRelativeUploadPath(urlOrPath: string): string | null {
  const s = (urlOrPath || "").trim();
  if (!s) return null;

  const idx = s.indexOf("/uploads/");
  if (idx === -1) return null;

  const rel = s.slice(idx); // "/uploads/...."
  if (rel.includes("..")) return null;
  return rel;
}

export function relUploadToAbs(rel: string) {
  return path.join(process.cwd(), rel.replace(/^\//, "")); // "uploads/images/xxx.png"
}

export function ensureUploadsImagesDir(): string {
  const dir = path.join(process.cwd(), "uploads", "images");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function collectPresetUploadPaths(preset: PresetForCleanup) {
  const out = new Set<string>();

  const push = (v?: string | null) => {
    if (!v) return;
    const rel = extractRelativeUploadPath(v);
    if (rel) out.add(rel);
  };

  // главные поля
  push(preset.thumbnailUrl);
  push(preset.baseImageUrl);

  push(preset.backgroundImageUrl);
  push(preset.foregroundImageUrl);

  const walk = (x: unknown) => {
    if (!x) return;
    if (typeof x === "string") {
      push(x);
      return;
    }
    if (Array.isArray(x)) {
      for (const it of x) walk(it);
      return;
    }
    if (typeof x === "object") {
      for (const v of Object.values(x as Record<string, unknown>)) walk(v);
    }
  };

  try {
    walk(preset.overlay as unknown);
  } catch {
    // ignore
  }

  return [...out];
}

export async function isFileReferencedByOtherPresets(prisma: any, tenantId: string, presetId: string, relUploadPath: string) {
  const count = await prisma.preset.count({
    where: {
      tenantId,
      id: { not: presetId },
      OR: [
        { thumbnailUrl: { contains: relUploadPath } },
        { baseImageUrl: { contains: relUploadPath } },
        { backgroundImageUrl: { contains: relUploadPath } },
        { foregroundImageUrl: { contains: relUploadPath } },
        // overlay здесь нормально не поищешь без raw SQL — оставляем, как есть
      ],
    },
  });

  return count > 0;
}

type JsonObj = Record<string, Prisma.InputJsonValue>;

function isObj(v: Prisma.InputJsonValue): v is JsonObj {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isArr(v: Prisma.InputJsonValue): v is Prisma.InputJsonValue[] {
  return Array.isArray(v);
}

function bumpZ(arr: Prisma.InputJsonValue, zOffset: number): Prisma.InputJsonValue[] {
  if (!isArr(arr)) return [];
  return arr.map((it) => {
    if (!isObj(it)) return it;
    const zRaw = it["z"];
    const zNum = typeof zRaw === "number" ? zRaw : Number(zRaw);
    const z = Number.isFinite(zNum) ? zNum : 10;
    return { ...it, z: z + zOffset } as JsonObj;
  });
}

export function mergeOverlayJson(
  current: Prisma.InputJsonValue,
  incoming: Prisma.InputJsonValue,
  zOffset: number
): Prisma.InputJsonValue {
  const c = isObj(current) ? current : {};
  const p = isObj(incoming) ? incoming : {};

  const texts = (isArr(c["texts"]) ? (c["texts"] as Prisma.InputJsonValue[]) : []).concat(
    bumpZ(p["texts"] ?? [], zOffset)
  );

  const pics = (isArr(c["pics"]) ? (c["pics"] as Prisma.InputJsonValue[]) : []).concat(
    bumpZ(p["pics"] ?? [], zOffset)
  );

  const rects = (isArr(c["rects"]) ? (c["rects"] as Prisma.InputJsonValue[]) : []).concat(
    bumpZ(p["rects"] ?? [], zOffset)
  );

  return { texts, pics, rects } as JsonObj;
}



type OverlayItem = { id?: string } & Record<string, unknown>;
type OverlayShape = {
  texts?: OverlayItem[];
  pics?: OverlayItem[];
  rects?: OverlayItem[];
} & Record<string, unknown>;

function newId(): string {
  return crypto.randomUUID();
}

export function remapOverlayIds(overlay: unknown): Prisma.InputJsonValue {
  if (!overlay || typeof overlay !== "object") {
    // важно: НЕ JsonNull, а пустой объект (или кинуть ошибку)
    return { texts: [], pics: [], rects: [] } as unknown as Prisma.InputJsonValue;
  }

  const o = overlay as OverlayShape;

  const texts = Array.isArray(o.texts) ? o.texts : [];
  const pics = Array.isArray(o.pics) ? o.pics : [];
  const rects = Array.isArray(o.rects) ? o.rects : [];

  const remapArr = (arr: OverlayItem[]): OverlayItem[] =>
    arr.map((x) => ({ ...x, id: newId() }));

  const out: OverlayShape = {
    ...o,
    texts: remapArr(texts),
    pics: remapArr(pics),
    rects: remapArr(rects),
  };

  return out as unknown as Prisma.InputJsonValue;
}

function normalizeOverlay(x: unknown): OverlayShape {
  if (!x || typeof x !== "object") return { texts: [], pics: [], rects: [] };
  const o = x as OverlayShape;
  return {
    ...o,
    texts: Array.isArray(o.texts) ? o.texts : [],
    pics: Array.isArray(o.pics) ? o.pics : [],
    rects: Array.isArray(o.rects) ? o.rects : [],
  };
}

// ремапим ids ВСЕХ элементов (только для MERGE)
function remapOverlayIdsObj(x: unknown): OverlayShape {
  const o = normalizeOverlay(x);
  const remapArr = (arr: OverlayItem[]) => arr.map((it) => ({ ...it, id: newId() }));
  return { ...o, texts: remapArr(o.texts!), pics: remapArr(o.pics!), rects: remapArr(o.rects!) };
}