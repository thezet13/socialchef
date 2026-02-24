// apps/api/src/modules/ai/renderCompositeImage.ts

import { createCanvas, loadImage } from "@napi-rs/canvas";
import fs from "fs";

import type {
  OverlayTextConfig,
  OverlayPicConfig,
  OverlayRectConfig,
} from "./types/ai.types";

import {
  drawImageCover,
  drawImageRenderContain,
  drawOverlayText,
  drawOverlayPic,
  drawOverlayRect,
  drawWatermarkImage,
} from "./ai.render";

// Server-side image adjustments (final render).
// UI range recommendation: -100..100 (0 = default)
export type ImageAdjustments = {
  brightness?: number;
  contrast?: number;
  saturation?: number;
  vibrance?: number; // approximate
  highlights?: number;
  shadows?: number;
  temperature?: number; // warm/cool overlay approx
  tint?: number; // green/magenta overlay approx
  sharpness?: number;
  clarity?: number;
  texture?: number;
  vignette?: number;
  grain?: number;
};

/**
 * Base image transform (already computed in route)
 */
export type BaseTransform = {
  scale?: number;
  offsetX?: number;
  offsetY?: number;
  fitMode?: "cover" | "contain";
};

/**
 * Fully prepared render input.
 */
export type RenderCompositeInput = {
  // absolute path to base image file
  baseImagePath: string;

  // output canvas size
  outW: number;
  outH: number;

  // editor/base coordinate space
  baseW: number;
  baseH: number;

  // base image transform (zoom / pan / fitMode)
  baseTransform?: BaseTransform;

  // optional image adjustments (final render)
  imageAdjustments?: ImageAdjustments;

  // overlay config (already parsed)
  overlay?: {
    texts?: OverlayTextConfig[];
    pics?: OverlayPicConfig[];
    rects?: OverlayRectConfig[];
  };

  // absolute uploads/images dir (for pics)
  uploadsDir: string;

  // watermark toggle (already decided by plan)
  watermark?: boolean;
};

function clamp01(x: number) {
  return Math.max(0, Math.min(1, x));
}

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

function nToAlpha(n: number, maxAlpha: number) {
  // n: -100..100
  return clamp01(Math.abs(n) / 100) * maxAlpha;
}

function applyVignette(ctx: any, w: number, h: number, amount: number) {
  if (!amount) return;
  const a = nToAlpha(amount, 0.55);
  if (a <= 0) return;

  ctx.save();
  // dark vignette; stronger for positive values
  ctx.globalCompositeOperation = "multiply";
  ctx.globalAlpha = a;
  const r = Math.max(w, h) * 0.75;
  const g = ctx.createRadialGradient(w / 2, h / 2, r * 0.15, w / 2, h / 2, r);
  g.addColorStop(0, "rgba(0,0,0,0)");
  g.addColorStop(1, "rgba(0,0,0,1)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

function applyGrain(ctx: any, w: number, h: number, amount: number) {
  if (!amount) return;
  const a = nToAlpha(amount, 0.18);
  if (a <= 0) return;

  // generate noise ImageData
  const noise = ctx.createImageData(w, h);
  const data = noise.data;
  // cheap noise (no crypto)
  let seed = (w * 73856093) ^ (h * 19349663) ^ 0x9e3779b9;
  function rnd() {
    // xorshift32
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    return (seed >>> 0) / 4294967295;
  }
  for (let i = 0; i < data.length; i += 4) {
    const v = Math.floor(rnd() * 255);
    data[i] = v;
    data[i + 1] = v;
    data[i + 2] = v;
    data[i + 3] = 255;
  }

  // draw with soft-light-ish blend
  const tmp = createCanvas(w, h);
  const tctx = tmp.getContext("2d");
  tctx.putImageData(noise, 0, 0);

  ctx.save();
  ctx.globalAlpha = a;
  ctx.globalCompositeOperation = "overlay";
  ctx.drawImage(tmp as any, 0, 0);
  ctx.restore();
}

function applyColorWash(ctx: any, w: number, h: number, rgba: string, alpha: number) {
  if (alpha <= 0) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.globalCompositeOperation = "soft-light";
  ctx.fillStyle = rgba;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

function applyToneCurves(ctx: any, w: number, h: number, highlights: number, shadows: number) {
  if (!highlights && !shadows) return;
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;

  const hl = clamp(highlights ?? 0, -100, 100) / 100;
  const sh = clamp(shadows ?? 0, -100, 100) / 100;

  // simple lift/crush based on luminance
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i];
    const g = d[i + 1];
    const b = d[i + 2];
    const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;

    // shadows: affect lower half
    let sK = 0;
    if (sh !== 0) {
      const t = clamp01((0.6 - lum) / 0.6); // 1 at dark, 0 at ~0.6
      sK = sh * t;
    }

    // highlights: affect upper half
    let hK = 0;
    if (hl !== 0) {
      const t = clamp01((lum - 0.4) / 0.6); // 0 at ~0.4, 1 at bright
      hK = hl * t;
    }

    // apply: shadows lift (positive) or crush (negative)
    // highlights lift (positive) or compress (negative)
    const adj = sK - hK;

    // move toward white for positive shadows, toward black for negative
    const r2 = r + adj * (255 - r);
    const g2 = g + adj * (255 - g);
    const b2 = b + adj * (255 - b);

    // for highlight changes, we also compress toward mid
    const comp = hK;
    const r3 = r2 + comp * (128 - r2);
    const g3 = g2 + comp * (128 - g2);
    const b3 = b2 + comp * (128 - b2);

    d[i] = clamp(r3, 0, 255);
    d[i + 1] = clamp(g3, 0, 255);
    d[i + 2] = clamp(b3, 0, 255);
  }

  ctx.putImageData(img, 0, 0);
}

function blurredImageData(canvas: any, w: number, h: number, blurPx: number) {
  const tmp = createCanvas(w, h);
  const t = tmp.getContext("2d");
  t.filter = `blur(${blurPx}px)`;
  t.drawImage(canvas as any, 0, 0);
  return t.getImageData(0, 0, w, h);
}

function applyUnsharp(ctx: any, canvas: any, w: number, h: number, amount: number, radiusPx: number) {
  if (!amount) return;
  const a = clamp(amount ?? 0, -100, 100) / 100;
  if (a === 0) return;

  const orig = ctx.getImageData(0, 0, w, h);
  const blur = blurredImageData(canvas, w, h, radiusPx);

  const o = orig.data;
  const b = blur.data;
  for (let i = 0; i < o.length; i += 4) {
    o[i] = clamp(o[i] + a * (o[i] - b[i]), 0, 255);
    o[i + 1] = clamp(o[i + 1] + a * (o[i + 1] - b[i + 1]), 0, 255);
    o[i + 2] = clamp(o[i + 2] + a * (o[i + 2] - b[i + 2]), 0, 255);
  }
  ctx.putImageData(orig, 0, 0);
}

function applyImageAdjustments(ctx: any, canvas: any, w: number, h: number, adj?: ImageAdjustments) {
  if (!adj) return;

  const brightness = clamp(adj.brightness ?? 0, -100, 100);
  const contrast = clamp(adj.contrast ?? 0, -100, 100);
  const saturation = clamp(adj.saturation ?? 0, -100, 100);
  const vibrance = clamp(adj.vibrance ?? 0, -100, 100);

  // 2D filter works on *subsequent* draws, so we redraw base through a temp canvas.
  const tmp = createCanvas(w, h);
  const t = tmp.getContext("2d");

  const bMul = 1 + brightness / 100;
  const cMul = 1 + contrast / 100;
  // vibrance ≈ extra saturation but weaker
  const sMul = 1 + saturation / 100 + vibrance / 200;

  t.filter = `brightness(${bMul}) contrast(${cMul}) saturate(${Math.max(0, sMul)})`;
  t.drawImage(canvas as any, 0, 0);

  // Replace ctx with filtered result
  ctx.clearRect(0, 0, w, h);
  ctx.drawImage(tmp as any, 0, 0);

  // Warm/cool + tint washes (approximate Temperature/Tint)
  const temperature = clamp(adj.temperature ?? 0, -100, 100);
  const tint = clamp(adj.tint ?? 0, -100, 100);

  if (temperature !== 0) {
    const alpha = nToAlpha(temperature, 0.20);
    if (temperature > 0) applyColorWash(ctx, w, h, "rgba(255, 140, 60, 1)", alpha);
    else applyColorWash(ctx, w, h, "rgba(70, 170, 255, 1)", alpha);
  }

  if (tint !== 0) {
    const alpha = nToAlpha(tint, 0.18);
    if (tint > 0) applyColorWash(ctx, w, h, "rgba(255, 0, 170, 1)", alpha);
    else applyColorWash(ctx, w, h, "rgba(0, 255, 120, 1)", alpha);
  }

  // Highlights/Shadows curve
  applyToneCurves(ctx, w, h, adj.highlights ?? 0, adj.shadows ?? 0);

  // Sharpness/Clarity/Texture (unsharp masks with different radii)
  applyUnsharp(ctx, canvas, w, h, adj.texture ?? 0, 1.0);
  applyUnsharp(ctx, canvas, w, h, adj.sharpness ?? 0, 1.5);
  applyUnsharp(ctx, canvas, w, h, adj.clarity ?? 0, 2.5);

  // Vignette + Grain overlays
  applyVignette(ctx, w, h, adj.vignette ?? 0);
  applyGrain(ctx, w, h, adj.grain ?? 0);
}




async function drawOverlayOnly(args: {
  ctx: any;
  outW: number;
  outH: number;
  baseW: number;
  baseH: number;
  overlay?: {
    texts?: OverlayTextConfig[];
    pics?: OverlayPicConfig[];
    rects?: OverlayRectConfig[];
  };
  uploadsDir: string;
}) {
  const { ctx, outW, outH, baseW, baseH, overlay, uploadsDir } = args;

  // ---------- scaling (base → output) ----------
  const sx = outW / baseW;
  const sy = outH / baseH;
  const sMin = Math.min(sx, sy);

  const scaleText = (cfg?: OverlayTextConfig): OverlayTextConfig | undefined => {
    if (!cfg) return undefined;

    return {
      ...cfg,
      marginTop: (cfg.marginTop ?? 0) * sy,
      marginBottom: (cfg.marginBottom ?? 0) * sy,
      marginLeft: (cfg.marginLeft ?? 0) * sx,
      marginRight: (cfg.marginRight ?? 0) * sx,

      paddingTop: (cfg.paddingTop ?? 0) * sy,
      paddingBottom: (cfg.paddingBottom ?? 0) * sy,
      paddingLeft: (cfg.paddingLeft ?? 0) * sx,
      paddingRight: (cfg.paddingRight ?? 0) * sx,

      plaqueWidth: cfg.plaqueWidth != null ? cfg.plaqueWidth * sx : cfg.plaqueWidth,

      fontSize: cfg.fontSize == null ? undefined : cfg.fontSize * sMin,

      plaqueBorderWidth:
        cfg.plaqueBorderWidth != null ? cfg.plaqueBorderWidth * sMin : cfg.plaqueBorderWidth,

      borderRadius: cfg.borderRadius != null ? cfg.borderRadius * sMin : cfg.borderRadius,

      shadowBlur: cfg.shadowBlur != null ? cfg.shadowBlur * sMin : cfg.shadowBlur,

      shadowOffsetX: cfg.shadowOffsetX != null ? cfg.shadowOffsetX * sx : cfg.shadowOffsetX,
      shadowOffsetY: cfg.shadowOffsetY != null ? cfg.shadowOffsetY * sy : cfg.shadowOffsetY,
    };
  };

  const scalePic = (cfg?: OverlayPicConfig): OverlayPicConfig | undefined => {
    if (!cfg) return undefined;

    return {
      ...cfg,
      marginTop: (cfg.marginTop ?? 0) * sy,
      marginBottom: (cfg.marginBottom ?? 0) * sy,
      marginLeft: (cfg.marginLeft ?? 0) * sx,
      marginRight: (cfg.marginRight ?? 0) * sx,
      width: (cfg.width ?? 0) * sx,
      height: (cfg.height ?? 0) * sy,
    };
  };

  const scaleRect = (cfg?: OverlayRectConfig): OverlayRectConfig | undefined => {
    if (!cfg) return undefined;

    return {
      ...cfg,
      marginTop: (cfg.marginTop ?? 0) * sy,
      marginBottom: (cfg.marginBottom ?? 0) * sy,
      marginLeft: (cfg.marginLeft ?? 0) * sx,
      marginRight: (cfg.marginRight ?? 0) * sx,
      width: (cfg.width ?? 0) * sx,
      height: (cfg.height ?? 0) * sy,
      borderWidth: (cfg.borderWidth ?? 0) * sMin,
      borderRadius: (cfg.borderRadius ?? 0) * sMin,
    };
  };

  // ---------- z-sorted drawables ----------
  const drawables: Array<
    | { z: number; kind: "text"; cfg: OverlayTextConfig }
    | { z: number; kind: "pic"; cfg: OverlayPicConfig }
    | { z: number; kind: "rect"; cfg: OverlayRectConfig }
  > = [];

  for (const t of overlay?.texts ?? []) {
    if (t?.visible === false) continue;
    if (!t?.text?.trim()) continue;
    const cfg = scaleText(t)!;
    drawables.push({ z: Number(cfg.z ?? 10), kind: "text", cfg });
  }

  for (const p of overlay?.pics ?? []) {
    if (p?.visible === false) continue;
    const cfg = scalePic(p)!;
    drawables.push({ z: Number(cfg.z ?? 10), kind: "pic", cfg });
  }

  for (const r of overlay?.rects ?? []) {
    if (r?.visible === false) continue;
    const cfg = scaleRect(r)!;
    drawables.push({ z: Number(cfg.z ?? 10), kind: "rect", cfg });
  }

  const kindOrder = { rect: 0, pic: 1, text: 2 } as const;

  drawables.sort((a, b) => {
    const dz = a.z - b.z;
    if (dz !== 0) return dz;
    return kindOrder[a.kind] - kindOrder[b.kind];
  });

  for (const d of drawables) {
    if (d.kind === "text") {
      drawOverlayText(ctx, outW, outH, d.cfg);
    } else if (d.kind === "pic") {
      await drawOverlayPic(ctx, outW, outH, uploadsDir, d.cfg);
    } else {
      drawOverlayRect(ctx, outW, outH, d.cfg);
    }
  }
}


export async function renderCompositeImage(
  input: RenderCompositeInput
): Promise<Buffer> {
  const {
    baseImagePath,
    outW,
    outH,
    baseW,
    baseH,
    baseTransform,
    imageAdjustments,
    overlay,
    uploadsDir,
    watermark = false,
  } = input;

  // ---------- base image ----------
  if (!fs.existsSync(baseImagePath)) {
    throw new Error(`Base image not found: ${baseImagePath}`);
  }

  const baseImage = await loadImage(fs.readFileSync(baseImagePath));

  // ---------- canvas ----------
  const canvas = createCanvas(outW, outH);
  const ctx = canvas.getContext("2d");

  const fitMode = baseTransform?.fitMode ?? "cover";

  if (fitMode === "contain") {
    drawImageRenderContain(ctx, baseImage as any, outW, outH, baseTransform);
  } else {
    drawImageCover(ctx, baseImage as any, outW, outH, baseTransform);
  }

  // ---------- image effects (apply to base image before overlays) ----------
  applyImageAdjustments(ctx, canvas, outW, outH, imageAdjustments);

  await drawOverlayOnly({
    ctx,
    outW,
    outH,
    baseW,
    baseH,
    overlay,
    uploadsDir,
  });

  // ---------- scaling (base → output) ----------
  // const sx = outW / baseW;
  // const sy = outH / baseH;
  // const sMin = Math.min(sx, sy);

  // const scaleText = (
  //   cfg?: OverlayTextConfig
  // ): OverlayTextConfig | undefined => {
  //   if (!cfg) return undefined;

  //   return {
  //     ...cfg,
  //     marginTop: (cfg.marginTop ?? 0) * sy,
  //     marginBottom: (cfg.marginBottom ?? 0) * sy,
  //     marginLeft: (cfg.marginLeft ?? 0) * sx,
  //     marginRight: (cfg.marginRight ?? 0) * sx,

  //     paddingTop: (cfg.paddingTop ?? 0) * sy,
  //     paddingBottom: (cfg.paddingBottom ?? 0) * sy,
  //     paddingLeft: (cfg.paddingLeft ?? 0) * sx,
  //     paddingRight: (cfg.paddingRight ?? 0) * sx,

  //     plaqueWidth:
  //       cfg.plaqueWidth != null ? cfg.plaqueWidth * sx : cfg.plaqueWidth,

  //     fontSize: cfg.fontSize == null ? undefined : cfg.fontSize * sMin,

  //     plaqueBorderWidth:
  //       cfg.plaqueBorderWidth != null
  //         ? cfg.plaqueBorderWidth * sMin
  //         : cfg.plaqueBorderWidth,

  //     borderRadius:
  //       cfg.borderRadius != null
  //         ? cfg.borderRadius * sMin
  //         : cfg.borderRadius,

  //     shadowBlur:
  //       cfg.shadowBlur != null ? cfg.shadowBlur * sMin : cfg.shadowBlur,

  //     shadowOffsetX:
  //       cfg.shadowOffsetX != null
  //         ? cfg.shadowOffsetX * sx
  //         : cfg.shadowOffsetX,

  //     shadowOffsetY:
  //       cfg.shadowOffsetY != null
  //         ? cfg.shadowOffsetY * sy
  //         : cfg.shadowOffsetY,
  //   };
  // };


  // const scalePic = (
  //   cfg?: OverlayPicConfig
  // ): OverlayPicConfig | undefined => {
  //   if (!cfg) return undefined;

  //   return {
  //     ...cfg,
  //     marginTop: (cfg.marginTop ?? 0) * sy,
  //     marginBottom: (cfg.marginBottom ?? 0) * sy,
  //     marginLeft: (cfg.marginLeft ?? 0) * sx,
  //     marginRight: (cfg.marginRight ?? 0) * sx,
  //     width: (cfg.width ?? 0) * sx,
  //     height: (cfg.height ?? 0) * sy,
  //   };
  // };

  // const scaleRect = (
  //   cfg?: OverlayRectConfig
  // ): OverlayRectConfig | undefined => {
  //   if (!cfg) return undefined;

  //   return {
  //     ...cfg,
  //     marginTop: (cfg.marginTop ?? 0) * sy,
  //     marginBottom: (cfg.marginBottom ?? 0) * sy,
  //     marginLeft: (cfg.marginLeft ?? 0) * sx,
  //     marginRight: (cfg.marginRight ?? 0) * sx,
  //     width: (cfg.width ?? 0) * sx,
  //     height: (cfg.height ?? 0) * sy,
  //     borderWidth: (cfg.borderWidth ?? 0) * sMin,
  //     borderRadius: (cfg.borderRadius ?? 0) * sMin,
  //   };
  // };

  // // ---------- z-sorted drawables ----------
  // const drawables: Array<
  //   | { z: number; kind: "text"; cfg: OverlayTextConfig }
  //   | { z: number; kind: "pic"; cfg: OverlayPicConfig }
  //   | { z: number; kind: "rect"; cfg: OverlayRectConfig }
  // > = [];

  // for (const t of overlay?.texts ?? []) {
  //   if (t?.visible === false) continue;
  //   if (!t?.text?.trim()) continue;
  //   const cfg = scaleText(t)!;
  //   drawables.push({ z: Number(cfg.z ?? 10), kind: "text", cfg });
  // }

  // for (const p of overlay?.pics ?? []) {
  //   if (p?.visible === false) continue;
  //   const cfg = scalePic(p)!;
  //   drawables.push({ z: Number(cfg.z ?? 10), kind: "pic", cfg });
  // }

  // for (const r of overlay?.rects ?? []) {
  //   if (r?.visible === false) continue;
  //   const cfg = scaleRect(r)!;
  //   drawables.push({ z: Number(cfg.z ?? 10), kind: "rect", cfg });
  // }

  // const kindOrder = { rect: 0, pic: 1, text: 2 } as const;

  // drawables.sort((a, b) => {
  //   const dz = a.z - b.z;
  //   if (dz !== 0) return dz;
  //   return kindOrder[a.kind] - kindOrder[b.kind];
  // });

  // //drawables.sort((a, b) => a.z - b.z);

  // for (const d of drawables) {
  //   if (d.kind === "text") {
  //     drawOverlayText(ctx, outW, outH, d.cfg);
  //   } else if (d.kind === "pic") {
  //     await drawOverlayPic(ctx, outW, outH, uploadsDir, d.cfg);
  //   } else {
  //     drawOverlayRect(ctx, outW, outH, d.cfg);
  //   }
  // }


  // ---------- watermark ----------
  if (watermark) {
    await drawWatermarkImage(ctx, outW, outH);
  }

  // ---------- result ----------
  return canvas.encode("png");
}



export async function renderOverlayOnlyImage(args: {
  outW: number;
  outH: number;
  baseW: number;
  baseH: number;
  overlay?: {
    texts?: OverlayTextConfig[];
    pics?: OverlayPicConfig[];
    rects?: OverlayRectConfig[];
  };
  uploadsDir: string;
  watermark?: boolean;
  backgroundColor?: string; // optional
}): Promise<Buffer> {
  const {
    outW,
    outH,
    baseW,
    baseH,
    overlay,
    uploadsDir,
    watermark = false,
    backgroundColor = "#0b1220",
  } = args;

  const canvas = createCanvas(outW, outH);
  const ctx = canvas.getContext("2d");

  // фон
  ctx.save();
  ctx.fillStyle = backgroundColor;
  ctx.fillRect(0, 0, outW, outH);
  ctx.restore();

  // overlay
  await drawOverlayOnly({
    ctx,
    outW,
    outH,
    baseW,
    baseH,
    overlay,
    uploadsDir,
  });

  if (watermark) {
    await drawWatermarkImage(ctx, outW, outH);
  }

  return canvas.encode("png");
}
