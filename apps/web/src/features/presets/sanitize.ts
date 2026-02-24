// apps/web/src/features/presets/sanitize.ts
import type { OverlayTextItem, OverlayPicItem, OverlayRectConfig, OverlayRectItem, OverlayRectFill } from "@/features/editor/editor.types"; 

export const ALIGN_VALUES = new Set([
  "top-left","top-center","top-right",
  "middle-left","middle-center","middle-right",
  "bottom-left","bottom-center","bottom-right",
] as const);

export type AlignValue =
  | "top-left" | "top-center" | "top-right"
  | "middle-left" | "middle-center" | "middle-right"
  | "bottom-left" | "bottom-center" | "bottom-right";

export function normalizeAlign(raw: unknown): AlignValue {
  const v = String(raw ?? "").trim();
  if (ALIGN_VALUES.has(v as AlignValue)) return v as AlignValue;

  const map: Record<string, AlignValue> = {
    TOP_LEFT: "top-left",
    TOP_CENTER: "top-center",
    TOP_RIGHT: "top-right",
    MIDDLE_LEFT: "middle-left",
    MIDDLE_CENTER: "middle-center",
    MIDDLE_RIGHT: "middle-right",
    BOTTOM_LEFT: "bottom-left",
    BOTTOM_CENTER: "bottom-center",
    BOTTOM_RIGHT: "bottom-right",

    top_left: "top-left",
    top_center: "top-center",
    top_right: "top-right",
    middle_left: "middle-left",
    middle_center: "middle-center",
    middle_right: "middle-right",
    bottom_left: "bottom-left",
    bottom_center: "bottom-center",
    bottom_right: "bottom-right",

    center: "middle-center",
    centre: "middle-center",
  };

  return map[v] ?? "top-left";
}

export function toNum(v: unknown, fallback = 0): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export type PresetTextRaw = Partial<OverlayTextItem> & Record<string, unknown>;

export function presetTextToItem(raw: PresetTextRaw, idx: number): OverlayTextItem {
  return {
    id: typeof raw.id === "string" && raw.id ? raw.id : crypto.randomUUID(),
    name: typeof raw.name === "string" && raw.name ? raw.name : `Text ${idx + 1}`,
    text: typeof raw.text === "string" ? raw.text : `Text ${idx + 1}`,

    alwaysOnTop: Boolean(raw.alwaysOnTop),

    color: typeof raw.color === "string" ? raw.color : "#ffffff",
    fontFamily: typeof raw.fontFamily === "string" ? raw.fontFamily : "Inter",
    fontSize: toNum(raw.fontSize, 60),
    fontWeight: toNum(raw.fontWeight, 400),
    fontStyle: raw.fontStyle === "italic" ? "italic" : "normal",

    align: normalizeAlign(raw.align),
    textAlign: raw.textAlign === "center" || raw.textAlign === "right" ? raw.textAlign : "left",
    lineHeight: toNum(raw.lineHeight, 1.2),
    textOpacity: toNum(raw.textOpacity, 1),

    plaqueWidth: toNum(raw.plaqueWidth, 0),
    plaqueColor: typeof raw.plaqueColor === "string" ? raw.plaqueColor : "#ffffff",
    plaqueOpacity: toNum(raw.plaqueOpacity, 0),

    plaqueBorderColor: typeof raw.plaqueBorderColor === "string" ? raw.plaqueBorderColor : "#ffffff",
    plaqueBorderOpacity: toNum(raw.plaqueBorderOpacity, 1),
    plaqueBorderWidth: toNum(raw.plaqueBorderWidth, 0),

    borderRadius: toNum(raw.borderRadius, 0),

    paddingTop: toNum(raw.paddingTop, 0),
    paddingRight: toNum(raw.paddingRight, 0),
    paddingBottom: toNum(raw.paddingBottom, 0),
    paddingLeft: toNum(raw.paddingLeft, 0),

    marginTop: toNum(raw.marginTop, 0),
    marginRight: toNum(raw.marginRight, 0),
    marginBottom: toNum(raw.marginBottom, 0),
    marginLeft: toNum(raw.marginLeft, 0),

    shadowColor: typeof raw.shadowColor === "string" ? raw.shadowColor : "rgba(0,0,0,1)",
    shadowOpacity: toNum(raw.shadowOpacity, 0),
    shadowBlur: toNum(raw.shadowBlur, 0),
    shadowOffsetX: toNum(raw.shadowOffsetX, 0),
    shadowOffsetY: toNum(raw.shadowOffsetY, 0),

    rotationDeg: toNum(raw.rotationDeg, 0),
  };
}

// ---- PICS ----
function normalizeAssetUrl(raw: unknown): string {
  const s = String(raw ?? "").trim();
  if (!s) return "";

  // уже абсолютный
  if (s.startsWith("http://") || s.startsWith("https://")) return s;

  const apiBase = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:4001";

  // относительный от корня API
  if (s.startsWith("/")) return `${apiBase}${s}`;

  // относительный без /
  return `${apiBase}/${s}`;
}
function denormalizeAssetUrl(url: string): string {
  if (!url) return "";

  const apiBase = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:4001";

  // если абсолютный URL начинается с apiBase → режем
  if (url.startsWith(apiBase)) {
    return url.slice(apiBase.length);
  }

  // уже относительный
  if (url.startsWith("/")) return url;

  // fallback — оставляем как есть
  return url;
}


// raw preset pic item can be messy too
export type PresetPicRaw = Partial<OverlayPicItem> & Record<string, unknown>;

export function presetPicToItem(raw: PresetPicRaw, idx: number): OverlayPicItem {
  return {
    id: typeof raw.id === "string" && raw.id ? raw.id : crypto.randomUUID(),
    name: typeof raw.name === "string" && raw.name ? raw.name : `Pic ${idx + 1}`,

    role: raw.role,

    url: normalizeAssetUrl(raw.url),

    alwaysOnTop: Boolean(raw.alwaysOnTop),

    width: toNum(raw.width, 300),
    height: toNum(raw.height, 300),

    opacity: toNum(raw.opacity, 1),

    align: normalizeAlign(raw.align),

    marginTop: toNum(raw.marginTop, 0),
    marginRight: toNum(raw.marginRight, 0),
    marginBottom: toNum(raw.marginBottom, 0),
    marginLeft: toNum(raw.marginLeft, 0),

    rotationDeg: toNum(raw.rotationDeg, 0),
  

    z: raw.z === undefined ? undefined : toNum(raw.z, 10),
  };
}




export type PresetRectRaw = Partial<OverlayRectConfig> & Record<string, unknown>;

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null;
}
function isString(x: unknown): x is string {
  return typeof x === "string";
}
function isNumber(x: unknown): x is number {
  return typeof x === "number" && Number.isFinite(x);
}


export function sanitizeBoxFill(raw: unknown): OverlayRectFill {
  if (!isRecord(raw)) {
    return { kind: "solid", color: "rgba(0,0,0,0.35)" };
  }

  const kindRaw = raw.kind;
  const kind = isString(kindRaw) ? kindRaw.trim() : "";

  if (kind === "solid") {
    const color = isString(raw.color) ? raw.color : "rgba(0,0,0,0.35)";
    return { kind: "solid", color };
  }

  if (kind === "linear") {
    const from = isString(raw.from) ? raw.from : "rgba(0,0,0,0.35)";
    const to = isString(raw.to) ? raw.to : "rgba(0,0,0,0.00)";

    const angleRaw = raw.angle;
    const angle =
      angleRaw === undefined ? undefined :
      isNumber(angleRaw) ? angleRaw :
      toNum(angleRaw, 0);

    return { kind: "linear", from, to, angle };
  }

  return { kind: "solid", color: "rgba(0,0,0,0.35)" };
}


export function presetRectToItem(raw: PresetRectRaw, idx: number): OverlayRectItem {
  const safeName =
    typeof raw.name === "string" && raw.name.trim() ? raw.name.trim() : `Rect ${idx + 1}`;

  return {
    id: typeof raw.id === "string" && raw.id ? raw.id : crypto.randomUUID(),
    name: safeName,

    width: toNum(raw.width, 400),
    height: toNum(raw.height, 200),

    opacity: toNum(raw.opacity, 1),

    align: normalizeAlign(raw.align),

    marginTop: toNum(raw.marginTop, 0),
    marginRight: toNum(raw.marginRight, 0),
    marginBottom: toNum(raw.marginBottom, 0),
    marginLeft: toNum(raw.marginLeft, 0),

    fill: sanitizeBoxFill(raw.fill),

    borderColor: typeof raw.borderColor === "string" ? raw.borderColor : "#ffffff",
    borderWidth: toNum(raw.borderWidth, 0),
    borderRadius: toNum(raw.borderRadius, 0),

    alwaysOnTop: Boolean(raw.alwaysOnTop),

    rotationDeg: toNum(raw.rotationDeg, 0),

    z: raw.z === undefined ? undefined : toNum(raw.z, 10),
  };
}


