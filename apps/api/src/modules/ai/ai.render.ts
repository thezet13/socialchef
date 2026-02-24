import path from "path";
import fs from "fs";
import type { OverlayTextConfig, OverlayPicConfig, OverlayRectConfig } from "../ai/types/ai.types"
import { loadImage } from '@napi-rs/canvas';

type LoadedImage = Awaited<ReturnType<typeof loadImage>>;

export { drawImageContain, drawImageRenderContain, drawImageCover, drawOverlayPic, drawOverlayText, drawOverlayRect, drawWatermark, drawWatermarkImage, hexToRgba };
export const MAX_CANVAS_SIZE = 4096;
export function clampOutSize(requestedW: number, requestedH: number, max: number) {
  if (!Number.isFinite(requestedW) || !Number.isFinite(requestedH) || requestedW <= 0 || requestedH <= 0) {
    return { outW: 1024, outH: 1024, scale: 1 };
  }

  if (requestedW <= max && requestedH <= max) {
    return { outW: Math.round(requestedW), outH: Math.round(requestedH), scale: 1 };
  }

  const scale = Math.min(max / requestedW, max / requestedH);
  return {
    outW: Math.round(requestedW * scale),
    outH: Math.round(requestedH * scale),
    scale,
  };
}

function hexToRgba(hex: string, alpha?: number): string {
  const clean = hex.replace("#", "");

  const r = parseInt(clean.slice(0, 2), 16) || 0;
  const g = parseInt(clean.slice(2, 4), 16) || 0;
  const b = parseInt(clean.slice(4, 6), 16) || 0;

  // ✅ поддержка и 0..1, и 0..100
  const aRaw = Number(alpha);
  const a01 = aRaw > 1 ? aRaw / 100 : aRaw;
  const a = Math.max(0, Math.min(1, a01));

  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

export function clampSize(
  width: number,
  height: number,
  max: number
): { width: number; height: number; scale: number } {
  if (width <= max && height <= max) {
    return { width, height, scale: 1 };
  }

  const scale = Math.min(max / width, max / height);

  return {
    width: Math.round(width * scale),
    height: Math.round(height * scale),
    scale,
  };
}


function drawImageRenderContain(
    ctx: any,
    img: any,
    outW: number,
    outH: number,
    t?: { scale?: number; offsetX?: number; offsetY?: number }
    ) {
    const iw = img.width;
    const ih = img.height;

    const zoom = t?.scale ?? 1;
    const offsetX = t?.offsetX ?? 0;
    const offsetY = t?.offsetY ?? 0;

    // contain scale = min
    const s = Math.min(outW / iw, outH / ih) * zoom;

    const dw = iw * s;
    const dh = ih * s;

    const dx = (outW - dw) / 2 + offsetX;
    const dy = (outH - dh) / 2 + offsetY;

    ctx.drawImage(img, dx, dy, dw, dh);
}

function drawImageCover(
  ctx: any,
  img: { width: number; height: number },
  w: number,
  h: number,
  t?: { scale?: number; offsetX?: number; offsetY?: number }
) {
  const iw = img.width;
  const ih = img.height;

  const zoom = t?.scale ?? 1;
  const offsetX = t?.offsetX ?? 0;
  const offsetY = t?.offsetY ?? 0;

  // обычный cover-scale
  const cover = Math.max(w / iw, h / ih);

  // zoom усиливает cover
  const scale = cover * Math.max(0.2, zoom);

  // размер “окна” в source-картинке
  const sw = w / scale;
  const sh = h / scale;

  // дефолт: центр
  let sx = (iw - sw) / 2;
  let sy = (ih - sh) / 2;

  // pan: двигаем картинку вправо/вниз => окно кропа двигается влево/вверх
  sx -= offsetX / scale;
  sy -= offsetY / scale;

  // clamp
  sx = Math.max(0, Math.min(iw - sw, sx));
  sy = Math.max(0, Math.min(ih - sh, sy));

  ctx.drawImage(img as any, sx, sy, sw, sh, 0, 0, w, h);
}



function computeAnchoredRect(
  outW: number,
  outH: number,
  cfg: { align?: string; marginTop?: number; marginRight?: number; marginBottom?: number; marginLeft?: number },
  boxW: number,
  boxH: number
) {
  const align = cfg.align ?? "top-left";
  const mt = cfg.marginTop ?? 0;
  const mr = cfg.marginRight ?? 0;
  const mb = cfg.marginBottom ?? 0;
  const ml = cfg.marginLeft ?? 0;

  const dx = (ml - mr);
  const dy = (mt - mb);

  let x = ml;
  let y = mt;

  const isTop = align.startsWith("top");
  const isMiddle = align.startsWith("middle");
  const isBottom = align.startsWith("bottom");

  const isLeft = align.endsWith("left");
  const isCenter = align.endsWith("center");
  const isRight = align.endsWith("right");

  // X
  if (isLeft) x = ml;
  else if (isRight) x = outW - mr - boxW;
  else if (isCenter) x = (outW - boxW) / 2 + dx;

  // Y
  if (isTop) y = mt;
  else if (isBottom) y = outH - mb - boxH;
  else if (isMiddle) y = (outH - boxH) / 2 + dy;

  return { x, y, w: boxW, h: boxH };
}


// function drawImageContain(ctx: any, img: any, x: number, y: number, w: number, h: number) {
//   const iw = img.width;
//   const ih = img.height;
//   if (!iw || !ih) return;

//   const s = Math.min(w / iw, h / ih);
//   const dw = iw * s;
//   const dh = ih * s;

//   const dx = x + (w - dw) / 2;
//   const dy = y + (h - dh) / 2;

//   ctx.drawImage(img, dx, dy, dw, dh);
// }

function drawImageContain(
  ctx: any,
  img: any,
  w: number,
  h: number
) {
  const iw = img.width;
  const ih = img.height;
  const s = Math.min(w / iw, h / ih);
  const dw = Math.round(iw * s);
  const dh = Math.round(ih * s);
  const dx = Math.round((w - dw) / 2);
  const dy = Math.round((h - dh) / 2);

  // заполняем фон (если нужно)
  ctx.fillStyle = "#000"; // или прозрачный/цвет фона
  ctx.fillRect(0, 0, w, h);

  ctx.drawImage(img, dx, dy, dw, dh);
}



async function drawOverlayPic(
  ctx: any,
  canvasWidth: number,
  canvasHeight: number,
  uploadsDir: string,
  cfg: OverlayPicConfig
) {
  const num = (v: unknown, fallback = 0) => {
    const n = parseFloat(String(v));
    return Number.isFinite(n) ? n : fallback;
  };

  const align = cfg.align ?? "top-left";

  const width = num(cfg.width, 0);
  const height = num(cfg.height, 0);
  if (width <= 0 || height <= 0) return;

  const mTop = num(cfg.marginTop, 0);
  const mRight = num(cfg.marginRight, 0);
  const mBottom = num(cfg.marginBottom, 0);
  const mLeft = num(cfg.marginLeft, 0);

  // --- global top-left
  let x = 0;
  let y = 0;

  if (align.endsWith("left")) x = mLeft;
  else if (align.endsWith("center")) x = (canvasWidth - width) / 2 + (mLeft - mRight);
  else if (align.endsWith("right")) x = canvasWidth - width - mRight;

  if (align.startsWith("top")) y = mTop;
  else if (align.startsWith("middle")) y = (canvasHeight - height) / 2 + (mTop - mBottom);
  else if (align.startsWith("bottom")) y = canvasHeight - height - mBottom;

  const opacity01 = Math.max(0, Math.min(1, num(cfg.opacity, 1)));

  // ✅ rotation
  const rotDeg = num((cfg as any).rotationDeg ?? 0, 0); // если rotationDeg есть в типе — убери any
  const theta = (rotDeg * Math.PI) / 180;

  const cx = x + width / 2;
  const cy = y + height / 2;

  const x0 = -width / 2;
  const y0 = -height / 2;

  // ✅ resolve image path
  // cfg.url у тебя часто "/uploads/images/xxx.png"
  const rel = String(cfg.url ?? "");
  const filename = rel.split("/").pop();
  if (!filename) return;

  const imgPath = path.join(uploadsDir, filename);
  if (!fs.existsSync(imgPath)) return;

  const buf = fs.readFileSync(imgPath);
  const img = await loadImage(buf);

  ctx.save();
  try {
    ctx.globalAlpha = opacity01;

    ctx.translate(cx, cy);
    if (theta !== 0) ctx.rotate(theta);

    ctx.drawImage(img, x0, y0, width, height);
  } finally {
    ctx.restore();
  }
}

function wrapText(ctx: any, text: string, maxWidth: number, fontSize: number) {
    const words = text.split(" ");
    const lines: string[] = [];
    let current = "";

    for (const word of words) {
        const testLine = current ? current + " " + word : word;
        const metrics = ctx.measureText(testLine);
        if (metrics.width > maxWidth) {
        lines.push(current);
        current = word;
        } else {
        current = testLine;
        }
    }
    if (current) lines.push(current);
    return lines;
}
function drawOverlayText(
  ctx: any,
  canvasWidth: number,
  canvasHeight: number,
  cfg: OverlayTextConfig
) {
  const {
    text,
    color = "#ffffff",
    fontSize = 50,
    fontWeight,
    align = "top-left",
    textAlign = "left",
    lineHeight,
    textOpacity,

    plaqueColor,
    plaqueBorderColor,
    plaqueBorderOpacity,
    plaqueBorderWidth,
    borderRadius,

    paddingTop,
    paddingRight,
    paddingBottom,
    paddingLeft,

    marginTop,
    marginRight,
    marginBottom,
    marginLeft,

    plaqueWidth,


  } = cfg;

  if (!text?.trim()) return;

 function normalizeFamily(f?: string) {
  if (!f) return "Inter";
  return f.startsWith("custom:") ? f.slice("custom:".length) : f;
}

    const family = normalizeFamily(cfg.fontFamily);

    const weightValue = Number(cfg.fontWeight ?? 400);
    const w = Math.min(900, Math.max(100, weightValue));

    const isItalic = cfg.fontStyle === "italic";
    ctx.font = `${isItalic ? "italic " : ""}${w} ${fontSize}px "${family}"`;


    ctx.textBaseline = "alphabetic"; // теперь работаем в базовой системе baseline
    ctx.fillStyle = color;


 
  const padTop = paddingTop ?? 0;
  const padRight = paddingRight ?? 0;
  const padBottom = paddingBottom ?? 0;
  const padLeft = paddingLeft ?? 0;

  // --- Разбивка на строки (как было)
  let lines: string[] = [];
  let maxLineWidth = 0;

  if (plaqueWidth && plaqueWidth > 0) {
    const innerWidth = plaqueWidth - padLeft - padRight;
    lines = wrapText(ctx, text, innerWidth, fontSize);
  } else {
    lines = [text];
  }

  // --- Реальные метрики строк
  let maxAscent = 0;
  let maxDescent = 0;

  for (const line of lines) {
    const metrics = ctx.measureText(line);
    const ascent =
      (metrics.actualBoundingBoxAscent as number | undefined) ??
      fontSize * 0.8;
    const descent =
      (metrics.actualBoundingBoxDescent as number | undefined) ??
      fontSize * 0.2;
    const lineWidth = metrics.width;

    if (lineWidth > maxLineWidth) {
      maxLineWidth = lineWidth;
    }
    if (ascent > maxAscent) maxAscent = ascent;
    if (descent > maxDescent) maxDescent = descent;
  }

// Высота строки = ascent + descent
//   const lineBoxHeight = maxAscent + maxDescent;


// --- LINE HEIGHT -------------------------------------------------
// --- LINE HEIGHT (CSS-like) ---------------------------------------
const userLineHeight = lineHeight ?? 1.2;

// как в CSS: line-height (number) => множитель от font-size
const lineHeightPx = fontSize * userLineHeight;

// фактическая высота глифов
const glyphBox = maxAscent + maxDescent;

// свободное место (leading), которое CSS распределяет сверху/снизу
const leading = Math.max(0, lineHeightPx - glyphBox);
const halfLeading = leading / 2;

// высота контента плашки — строго по CSS line-height
const contentHeight =
  lines.length * lineHeightPx +
  padTop +
  padBottom;

  const contentWidth =
    plaqueWidth && plaqueWidth > 0
      ? plaqueWidth
      : maxLineWidth + padLeft + padRight;
  //const contentHeight = lines.length * lineBoxHeight + padTop + padBottom;

  // --- Margin
    const mTop = marginTop ?? 0;
    const mRight = marginRight ?? 0;
    const mBottom = marginBottom ?? 0;
    const mLeft = marginLeft ?? 0;

    let x = 0;
    let y = 0;

    // Горизонталь
    if (align.endsWith("left")) {
    x = mLeft;
    } else if (align.endsWith("center")) {
    // center + offset (mLeft вправо, mRight влево)
    x = (canvasWidth - contentWidth) / 2 + (mLeft - mRight);
    } else if (align.endsWith("right")) {
    x = canvasWidth - contentWidth - mRight;
    }

    // Вертикаль
    if (align.startsWith("top")) {
    y = mTop;
    } else if (align.startsWith("middle")) {
    // middle + offset (mTop вниз, mBottom вверх)
    y = (canvasHeight - contentHeight) / 2 + (mTop - mBottom);
    } else if (align.startsWith("bottom")) {
    y = canvasHeight - contentHeight - mBottom;
    }

    // ✅ ROTATION (Render)
    const rotDeg =
      typeof (cfg as any).rotationDeg === "number"
        ? (cfg as any).rotationDeg
        : 0;

    const theta = (rotDeg * Math.PI) / 180;

    // pivot = center of content box in GLOBAL coords
    const cx = x + contentWidth / 2;
    const cy = y + contentHeight / 2;

    // switch to LOCAL coords (0,0 = center)
    const xLocal = -contentWidth / 2;
    const yLocal = -contentHeight / 2;

    // enter rotated coordinate system
    ctx.save();
    ctx.translate(cx, cy);
    if (theta !== 0) ctx.rotate(theta);

    // IMPORTANT: from now on use local x/y
    x = xLocal;
    y = yLocal;

    // helpers
    const clamp01 = (v: unknown, d = 1) => {
        const n = typeof v === "number" ? v : d;
        return Math.max(0, Math.min(1, n));
        };

    // заранее посчитаем альфы
    const plaqueAlpha = clamp01(cfg.plaqueOpacity, 1);
    const borderAlpha = clamp01(plaqueBorderOpacity, 1);
    const textAlpha = clamp01(textOpacity, 1);

    // --- Рисуем плашку (если есть заливка или бордер)
    const doFill = !!plaqueColor;
    const doStroke = !!plaqueBorderColor && (plaqueBorderWidth ?? 0) > 0;

    if (doFill || doStroke) {
    const maxR = Math.min(contentWidth, contentHeight) / 2;
    const radius = Math.min(Math.max(0, borderRadius ?? 0), maxR);

    const x2 = x + contentWidth;
    const y2 = y + contentHeight;

    // строим path 1 раз
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x2 - radius, y);
    ctx.quadraticCurveTo(x2, y, x2, y + radius);
    ctx.lineTo(x2, y2 - radius);
    ctx.quadraticCurveTo(x2, y2, x2 - radius, y2);
    ctx.lineTo(x + radius, y2);
    ctx.quadraticCurveTo(x, y2, x, y2 - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();

    // fill (plaqueOpacity)
    if (doFill) {
        ctx.save();
        ctx.globalAlpha = plaqueAlpha;
        ctx.fillStyle = plaqueColor!;
        ctx.fill();
        ctx.restore();
    }

    // stroke (plaqueBorderOpacity)
    if (doStroke) {
        ctx.save();
        ctx.globalAlpha = borderAlpha;
        ctx.lineWidth = plaqueBorderWidth!;
        ctx.strokeStyle = plaqueBorderColor!;
        ctx.stroke();
        ctx.restore();
    }

    ctx.restore();
    }


 ctx.save();
  try {
    ctx.globalAlpha = textAlpha;
    ctx.fillStyle = color;


function clamp01(v: unknown, d = 0) {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : d;
}

// принимает "#rrggbb" или "rgba(...)" или "rgb(...)"
function applyAlphaToColor(color: string, alpha01: number) {
  const s = (color ?? "").trim();

  // rgba(...)
  const mRgba = s.match(/^rgba?\(\s*([0-9.]+)\s*,\s*([0-9.]+)\s*,\s*([0-9.]+)(?:\s*,\s*([0-9.]+))?\s*\)$/i);
  if (mRgba) {
    const r = Number(mRgba[1]);
    const g = Number(mRgba[2]);
    const b = Number(mRgba[3]);
    return `rgba(${r}, ${g}, ${b}, ${alpha01})`;
  }

  // #rgb / #rrggbb
  if (s.startsWith("#")) {
    const hex = s.replace("#", "");
    const clean = hex.length === 3
      ? hex.split("").map((c) => c + c).join("")
      : hex.padEnd(6, "0").slice(0, 6);

    const r = parseInt(clean.slice(0, 2), 16) || 0;
    const g = parseInt(clean.slice(2, 4), 16) || 0;
    const b = parseInt(clean.slice(4, 6), 16) || 0;
    return `rgba(${r}, ${g}, ${b}, ${alpha01})`;
  }

  // fallback: если пришло "transparent" — оставим
  if (s === "transparent") return "rgba(0,0,0,0)";

  // последний шанс — как есть (но лучше не надо)
  return s;
}




    // ✅ shadow ONLY for text — robust
    const scRaw = (cfg.shadowColor ?? "").toString().trim();
    const hasShadow =
    scRaw.length > 0 &&
    scRaw !== "rgba(0,0,0,0)" &&
    scRaw !== "transparent";

const shadowA = clamp01(cfg.shadowOpacity ?? 0, 0);

if (shadowA <= 0) {
  ctx.shadowColor = "rgba(0,0,0,0)";
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
} else {
  const sc = (cfg.shadowColor ?? "#000000").toString();
  ctx.shadowColor = applyAlphaToColor(sc, shadowA);
  ctx.shadowBlur = Number(cfg.shadowBlur ?? 0);
  ctx.shadowOffsetX = Number(cfg.shadowOffsetX ?? 0);
  ctx.shadowOffsetY = Number(cfg.shadowOffsetY ?? 0);
}


    const innerWidth = contentWidth - padLeft - padRight;
    let currentBaselineY = y + padTop + halfLeading + maxAscent;

    for (const line of lines) {
    const metrics = ctx.measureText(line);
    const lineWidth = metrics.width;

    let lineX = x + padLeft; // left
    if (textAlign === "center") {
        lineX = x + padLeft + (innerWidth - lineWidth) / 2;
    } else if (textAlign === "right") {
        lineX = x + padLeft + (innerWidth - lineWidth);
    }

    ctx.fillText(line, lineX, currentBaselineY);
    currentBaselineY += lineHeightPx;
    }

} finally {
  ctx.restore();
}
ctx.restore();
}

function drawOverlayRect(
  ctx: any,
  canvasWidth: number,
  canvasHeight: number,
  cfg: OverlayRectConfig
) {
  const num = (v: unknown, fallback = 0) => {
    const n = parseFloat(String(v));
    return Number.isFinite(n) ? n : fallback;
  };

  const align = cfg.align ?? "top-left";

  const width = num(cfg.width, 0);
  const height = num(cfg.height, 0);
  if (width <= 0 || height <= 0) return;

  const mTop = num(cfg.marginTop, 0);
  const mRight = num(cfg.marginRight, 0);
  const mBottom = num(cfg.marginBottom, 0);
  const mLeft = num(cfg.marginLeft, 0);

  // --- top-left (global)
  let x = 0;
  let y = 0;

  if (align.endsWith("left")) x = mLeft;
  else if (align.endsWith("center")) x = (canvasWidth - width) / 2 + (mLeft - mRight);
  else if (align.endsWith("right")) x = canvasWidth - width - mRight;

  if (align.startsWith("top")) y = mTop;
  else if (align.startsWith("middle")) y = (canvasHeight - height) / 2 + (mTop - mBottom);
  else if (align.startsWith("bottom")) y = canvasHeight - height - mBottom;

  

  const opacity01 = Math.max(0, Math.min(1, num(cfg.opacity, 1)));
  const bw = Math.max(0, num(cfg.borderWidth, 0));
  const radiusRaw = Math.max(0, num(cfg.borderRadius, 0));
  const radius = Math.min(radiusRaw, Math.min(width, height) / 2);

  const rotDeg = num(cfg.rotationDeg, 0);
  const theta = (rotDeg * Math.PI) / 180;

  const cx = x + width / 2;
  const cy = y + height / 2;

  const x0 = -width / 2;
  const y0 = -height / 2;
  const x1 = x0 + width;
  const y1 = y0 + height;

  ctx.save();
  try {
    ctx.globalAlpha = opacity01;

    ctx.translate(cx, cy);
    if (theta !== 0) ctx.rotate(theta);

    // path in LOCAL coords
    ctx.beginPath();
    if (radius > 0) {
      ctx.moveTo(x0 + radius, y0);
      ctx.lineTo(x1 - radius, y0);
      ctx.quadraticCurveTo(x1, y0, x1, y0 + radius);
      ctx.lineTo(x1, y1 - radius);
      ctx.quadraticCurveTo(x1, y1, x1 - radius, y1);
      ctx.lineTo(x0 + radius, y1);
      ctx.quadraticCurveTo(x0, y1, x0, y1 - radius);
      ctx.lineTo(x0, y0 + radius);
      ctx.quadraticCurveTo(x0, y0, x0 + radius, y0);
    } else {
      ctx.rect(x0, y0, width, height);
    }
    ctx.closePath();

    // fill
    if (cfg.fill?.kind === "solid") {
      ctx.fillStyle = cfg.fill.color;
      ctx.fill();
    } else if (cfg.fill?.kind === "linear") {
      const angleDeg = num(cfg.fill.angle, 90);
      const rad = ((angleDeg - 90) * Math.PI) / 180;
      const vx = Math.cos(rad);
      const vy = Math.sin(rad);

      const halfW = width / 2;
      const halfH = height / 2;

      const gx0 = -vx * halfW;
      const gy0 = -vy * halfH;
      const gx1 = vx * halfW;
      const gy1 = vy * halfH;

      const g = ctx.createLinearGradient(gx0, gy0, gx1, gy1);
      g.addColorStop(0, cfg.fill.from);
      g.addColorStop(1, cfg.fill.to);

      ctx.fillStyle = g;
      ctx.fill();
    }

    // border
    const borderOpacity01 =
      "borderOpacity" in cfg && typeof (cfg as any).borderOpacity === "number"
        ? (cfg as any).borderOpacity
        : 1;

    const stroke =
      cfg.borderColor && bw > 0 && borderOpacity01 > 0
        ? hexToRgba(cfg.borderColor, borderOpacity01)
        : undefined;

    if (bw > 0 && stroke) {
      ctx.lineWidth = bw;
      ctx.strokeStyle = stroke;
      ctx.stroke();
    }
  } finally {
    ctx.restore();
  }
}


function drawWatermark(ctx: any, outW: number, outH: number, text: string) {
  ctx.save();

  const pad = Math.max(24, Math.round(Math.min(outW, outH) * 0.03));
  const fontSize = Math.max(18, Math.round(Math.min(outW, outH) * 0.045));

  ctx.globalAlpha = 0.22; // 🔥 прозрачность
  ctx.fillStyle = "#ffffff";
  ctx.strokeStyle = "#000000";
  ctx.lineWidth = Math.max(2, Math.round(fontSize * 0.12));

  ctx.font = `700 ${fontSize}px "Inter"`;
  ctx.textBaseline = "middle";
  ctx.textAlign = "center";

  // диагональ по центру
  ctx.translate(outW / 2, outH / 2);
  ctx.rotate((-18 * Math.PI) / 180);

  // лёгкая обводка + заливка (читаемо на любом фоне)
  ctx.strokeText(text, 0, 0);
  ctx.fillText(text, 0, 0);

  // маленькая подпись снизу-справа (не обязательно, но красиво)
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 0.35;
  ctx.textAlign = "right";
  ctx.textBaseline = "bottom";
  ctx.font = `600 ${Math.max(12, Math.round(fontSize * 0.55))}px "Inter"`;
  ctx.strokeText(text, outW - pad, outH - pad);
  ctx.fillText(text, outW - pad, outH - pad);

  ctx.restore();
}


let watermarkCache: LoadedImage | null = null;

async function getWatermarkImage(): Promise<LoadedImage> {
  if (watermarkCache) return watermarkCache;

  

  const watermarkPath = path.resolve(__dirname, "../../assets/watermark.png");

  if (!fs.existsSync(watermarkPath)) {
    throw new Error(`[watermark] file not found: ${watermarkPath}`);
  }

  const buf = fs.readFileSync(watermarkPath);
  watermarkCache = await loadImage(buf);
  return watermarkCache;
}

async function drawWatermarkImage(ctx: any, outW: number, outH: number) {
  const img = await getWatermarkImage();
  if (!img) return; 

  ctx.save();

  ctx.globalAlpha = 1;

  // размеры исходника
  const iw = img.width;
  const ih = img.height;

  // ✅ отступы от края (масштабируемые под размер)
  const pad = Math.round(Math.min(outW, outH) * 0.03); // ~3% от меньшей стороны

  // ✅ базовая цель: watermark ~22% ширины картинки
  const targetW = outW * 0.22;

  // ✅ но ограничиваем, чтобы на узких форматах не был огромным:
  const maxW = outW * 0.35;
  const finalTargetW = Math.min(targetW, maxW);

  const scale = finalTargetW / iw;
  const w = iw * scale;
  const h = ih * scale;

  // ✅ позиция: правый верх
  const x = outW - pad - w;
  const y = pad;
  

  ctx.drawImage(img, x, y, w, h);

  ctx.restore();
}


