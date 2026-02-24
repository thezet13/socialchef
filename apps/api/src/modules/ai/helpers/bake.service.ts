import { createCanvas, loadImage } from '@napi-rs/canvas';

import { OverlayPicConfig, OverlayRectConfig, OverlayTextConfig } from "../types/ai.types";
import { drawImageCover, drawImageContain } from '../ai.render';
import { fileFromPng, loadUploadsAnyAsPng } from './images.service';
import { resolveAiEditSize } from './ai.service';
import { openai } from '@/lib/openai';

type BakeLayer = "FRONT" | "BAKED";

type OverlayTextCfgWithBake = OverlayTextConfig & { bakeLayer?: BakeLayer; visible?: boolean };
type OverlayPicCfgWithBake = OverlayPicConfig & { bakeLayer?: BakeLayer; visible?: boolean };
type OverlayRectCfgWithBake = OverlayRectConfig & { bakeLayer?: BakeLayer; visible?: boolean };

type OverlayPayload = {
  texts?: OverlayTextCfgWithBake[];
  pics?: OverlayPicCfgWithBake[];
  rects?: OverlayRectCfgWithBake[];
};


function isObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object";
}

export function normalizeOverlay(raw: unknown): OverlayPayload {
  if (!isObject(raw)) return {};
  const o = raw as Record<string, unknown>;
  return {
    texts: Array.isArray(o.texts) ? (o.texts as OverlayTextCfgWithBake[]) : [],
    pics: Array.isArray(o.pics) ? (o.pics as OverlayPicCfgWithBake[]) : [],
    rects: Array.isArray(o.rects) ? (o.rects as OverlayRectCfgWithBake[]) : [],
  };
}

export function stripHidden(ov: OverlayPayload): OverlayPayload {
  return {
    texts: (ov.texts ?? []).filter((t) => t?.visible !== false),
    pics: (ov.pics ?? []).filter((p) => p?.visible !== false),
    rects: (ov.rects ?? []).filter((r) => r?.visible !== false),
  };
}

export function splitOverlayByBakeLayer(ov: OverlayPayload) {
  const baked: OverlayPayload = {
    texts: (ov.texts ?? []).filter((t) => (t.bakeLayer ?? "FRONT") === "BAKED"),
    pics: (ov.pics ?? []).filter((p) => (p.bakeLayer ?? "FRONT") === "BAKED"),
    rects: (ov.rects ?? []).filter((r) => (r.bakeLayer ?? "FRONT") === "BAKED"),
  };

  const front: OverlayPayload = {
    texts: (ov.texts ?? []).filter((t) => (t.bakeLayer ?? "FRONT") !== "BAKED"),
    pics: (ov.pics ?? []).filter((p) => (p.bakeLayer ?? "FRONT") !== "BAKED"),
    rects: (ov.rects ?? []).filter((r) => (r.bakeLayer ?? "FRONT") !== "BAKED"),
  };

  return { baked, front };
}




export function wrapTextLocal(ctx: any, text: string, maxWidth: number, fontSize: number): string[] {
  const words = String(text ?? "").split(/\s+/).filter(Boolean);
  if (words.length === 0) return [""];

  const lines: string[] = [];
  let cur = words[0] ?? "";

  for (let i = 1; i < words.length; i++) {
    const w = words[i]!;
    const test = `${cur} ${w}`;
    const mw = ctx.measureText(test).width;
    if (mw <= maxWidth) cur = test;
    else {
      lines.push(cur);
      cur = w;
    }
  }
  lines.push(cur);

  // если слово одно и очень длинное — не режем символами (нам нужны лишь box-габариты)
  return lines;
}

export function computeTextBox(ctx: any, canvasW: number, canvasH: number, cfg: OverlayTextCfgWithBake) {
  const text = String(cfg.text ?? "");
  if (!text.trim()) return null;

  const family = (cfg as any).fontFamily ?? "Inter";
  const weightValue = Number((cfg as any).fontWeight ?? 400);
  const w = Math.min(900, Math.max(100, weightValue));
  const isItalic = (cfg as any).fontStyle === "italic";
  const fontSize = Number((cfg as any).fontSize ?? 50);

  ctx.font = `${isItalic ? "italic " : ""}${w} ${fontSize}px "${family}"`;

  const padTop = Number((cfg as any).paddingTop ?? 0);
  const padRight = Number((cfg as any).paddingRight ?? 0);
  const padBottom = Number((cfg as any).paddingBottom ?? 0);
  const padLeft = Number((cfg as any).paddingLeft ?? 0);

  const plaqueWidth = Number((cfg as any).plaqueWidth ?? 0);
  const lineHeightMul = Number((cfg as any).lineHeight ?? 1.2);

  let lines: string[] = [];
  let maxLineWidth = 0;

  if (plaqueWidth > 0) {
    const innerWidth = Math.max(1, plaqueWidth - padLeft - padRight);
    lines = wrapTextLocal(ctx, text, innerWidth, fontSize);
  } else {
    lines = [text];
  }

  let maxAscent = 0;
  let maxDescent = 0;

  for (const line of lines) {
    const m = ctx.measureText(line);
    const ascent = (m.actualBoundingBoxAscent ?? fontSize * 0.8);
    const descent = (m.actualBoundingBoxDescent ?? fontSize * 0.2);
    maxLineWidth = Math.max(maxLineWidth, m.width);
    maxAscent = Math.max(maxAscent, ascent);
    maxDescent = Math.max(maxDescent, descent);
  }

  const glyphBox = maxAscent + maxDescent;
  const lineHeightPx = fontSize * (Number.isFinite(lineHeightMul) ? lineHeightMul : 1.2);
  const contentHeight = lines.length * lineHeightPx + padTop + padBottom;
  const contentWidth = plaqueWidth > 0 ? plaqueWidth : (maxLineWidth + padLeft + padRight);

  const align = (cfg as any).align ?? "top-left";
  const mt = Number((cfg as any).marginTop ?? 0);
  const mr = Number((cfg as any).marginRight ?? 0);
  const mb = Number((cfg as any).marginBottom ?? 0);
  const ml = Number((cfg as any).marginLeft ?? 0);

  let x = 0;
  let y = 0;

  if (align.endsWith("left")) x = ml;
  else if (align.endsWith("center")) x = (canvasW - contentWidth) / 2 + (ml - mr);
  else x = canvasW - contentWidth - mr;

  if (align.startsWith("top")) y = mt;
  else if (align.startsWith("middle")) y = (canvasH - contentHeight) / 2 + (mt - mb);
  else y = canvasH - contentHeight - mb;

  return { x, y, w: contentWidth, h: contentHeight };
}

export function computeBoxForPic(canvasW: number, canvasH: number, cfg: OverlayPicCfgWithBake) {
  const width = Number((cfg as any).width ?? 0);
  const height = Number((cfg as any).height ?? 0);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;

  const align = (cfg as any).align ?? "top-left";
  const mt = Number((cfg as any).marginTop ?? 0);
  const mr = Number((cfg as any).marginRight ?? 0);
  const mb = Number((cfg as any).marginBottom ?? 0);
  const ml = Number((cfg as any).marginLeft ?? 0);

  let x = 0;
  let y = 0;

  if (align.endsWith("left")) x = ml;
  else if (align.endsWith("center")) x = (canvasW - width) / 2 + (ml - mr);
  else x = canvasW - width - mr;

  if (align.startsWith("top")) y = mt;
  else if (align.startsWith("middle")) y = (canvasH - height) / 2 + (mt - mb);
  else y = canvasH - height - mb;

  return { x, y, w: width, h: height };
}

export function computeBoxForRect(canvasW: number, canvasH: number, cfg: OverlayRectCfgWithBake) {
  const width = Number((cfg as any).width ?? 0);
  const height = Number((cfg as any).height ?? 0);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;

  const align = (cfg as any).align ?? "top-left";
  const mt = Number((cfg as any).marginTop ?? 0);
  const mr = Number((cfg as any).marginRight ?? 0);
  const mb = Number((cfg as any).marginBottom ?? 0);
  const ml = Number((cfg as any).marginLeft ?? 0);

  let x = 0;
  let y = 0;

  if (align.endsWith("left")) x = ml;
  else if (align.endsWith("center")) x = (canvasW - width) / 2 + (ml - mr);
  else x = canvasW - width - mr;

  if (align.startsWith("top")) y = mt;
  else if (align.startsWith("middle")) y = (canvasH - height) / 2 + (mt - mb);
  else y = canvasH - height - mb;

  return { x, y, w: width, h: height };
}



type LayoutGuideItem =
  | {
    kind: "text";
    idx: number;
    text: string;
    bakeLayer: BakeLayer;
    box: { x: number; y: number; w: number; h: number };
  }
  | {
    kind: "rect";
    idx: number;
    bakeLayer: BakeLayer;
    box: { x: number; y: number; w: number; h: number };
  }
  | {
    kind: "pic";
    idx: number;
    url: string;
    bakeLayer: BakeLayer;
    picInputIndex: number; // P1, P2... matches pic_1.png, pic_2.png order
    box: { x: number; y: number; w: number; h: number };
  };


export async function renderLayoutGuidePng(args: {
  baseW: number;
  baseH: number;
  outW: number;
  outH: number;
  safeInsetPct?: number;
  baked: OverlayPayload; // сюда можно передавать ALL overlay
}): Promise<{ guidePng: Buffer; guideItems: LayoutGuideItem[] }> {
  const { baseW, baseH, outW, outH, baked } = args;

  const sx = outW / baseW;
  const sy = outH / baseH;

  const safePct = typeof args.safeInsetPct === "number" ? args.safeInsetPct : 0.02; // default 2%
  const safeX = Math.round(outW * safePct);
  const safeY = Math.round(outH * safePct);
  const safeW = Math.max(1, outW - safeX * 2);
  const safeH = Math.max(1, outH - safeY * 2);

  const safeRect = { x: safeX, y: safeY, w: safeW, h: safeH };

  function clampBoxToSafe(
    box: { x: number; y: number; w: number; h: number },
    pad: number
  ) {
    const x1 = Math.max(box.x, safeRect.x);
    const y1 = Math.max(box.y, safeRect.y);
    const x2 = Math.min(box.x + box.w, safeRect.x + safeRect.w);
    const y2 = Math.min(box.y + box.h, safeRect.y + safeRect.h);

    const w = Math.max(1, x2 - x1);
    const h = Math.max(1, y2 - y1);

    // extra inner padding so AI has “air”
    const px = Math.min(pad, Math.floor(w / 4));
    const py = Math.min(pad, Math.floor(h / 4));

    return {
      x: Math.min(x1 + px, safeRect.x + safeRect.w - 1),
      y: Math.min(y1 + py, safeRect.y + safeRect.h - 1),
      w: Math.max(1, w - px * 2),
      h: Math.max(1, h - py * 2),
    };
  }

  const canvas = createCanvas(outW, outH);
  const ctx = canvas.getContext("2d");

  // прозрачный фон
  ctx.clearRect(0, 0, outW, outH);

  // отдельный canvas для измерения текста в базовых координатах
  const measure = createCanvas(baseW, baseH);
  const mctx = measure.getContext("2d");

  const guideItems: LayoutGuideItem[] = [];
  let idx = 1;

  // ------------------------
  // 1) TEXTS
  // ------------------------
  for (const t of (baked.texts ?? []) as OverlayTextCfgWithBake[]) {
    if (!t || (t as any).visible === false) continue;

    const boxBase = computeTextBox(mctx, baseW, baseH, t);
    if (!boxBase) continue;

    const box = {
      x: boxBase.x * sx,
      y: boxBase.y * sy,
      w: boxBase.w * sx,
      h: boxBase.h * sy,
    };

    const boxSafe = clampBoxToSafe(box, 12); // ✅ больше паддинг для текста

    guideItems.push({
      kind: "text",
      idx,
      text: String((t as any).text ?? ""),
      bakeLayer: ((t as any).bakeLayer ?? "FRONT") as BakeLayer,
      box: boxSafe,
    });

    idx++;
  }

  // ------------------------
  // 2) RECTS
  // ------------------------
  for (const r of (baked.rects ?? []) as OverlayRectCfgWithBake[]) {
    if (!r || (r as any).visible === false) continue;

    const boxBase = computeBoxForRect(baseW, baseH, r);
    if (!boxBase) continue;

    const box = {
      x: boxBase.x * sx,
      y: boxBase.y * sy,
      w: boxBase.w * sx,
      h: boxBase.h * sy,
    };

    const boxSafe = clampBoxToSafe(box, 8);

    guideItems.push({
      kind: "rect",
      idx,
      bakeLayer: ((r as any).bakeLayer ?? "FRONT") as BakeLayer,
      box: boxSafe,
    });

    idx++;
  }

  // ------------------------
  // 3) PICS
  // ------------------------
  let picInputIndex = 1;

  for (const p of (baked.pics ?? []) as OverlayPicCfgWithBake[]) {
    if (!p || (p as any).visible === false) continue;

    const boxBase = computeBoxForPic(baseW, baseH, p);
    if (!boxBase) continue;

    const box = {
      x: boxBase.x * sx,
      y: boxBase.y * sy,
      w: boxBase.w * sx,
      h: boxBase.h * sy,
    };

    const boxSafe = clampBoxToSafe(box, 6); // ✅ меньше паддинг для картинок

    guideItems.push({
      kind: "pic",
      idx,
      url: String((p as any).url ?? ""),
      bakeLayer: ((p as any).bakeLayer ?? "FRONT") as BakeLayer,
      picInputIndex,
      box: boxSafe,
    });

    picInputIndex++;
    idx++;
  }

  // ------------------------
  // DRAW
  // ------------------------
  // ✅ SAFE FRAME (очень важно для модели)
  ctx.save();
  ctx.setLineDash([]);
  ctx.lineWidth = 8;
  ctx.strokeStyle = "rgba(255,255,255,0.60)";
  ctx.strokeRect(safeRect.x, safeRect.y, safeRect.w, safeRect.h);

  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.fillRect(safeRect.x, Math.max(0, safeRect.y - 30), 140, 26);
  ctx.fillStyle = "white";
  ctx.font = `bold 14px "Inter"`;
  ctx.fillText("SAFE AREA", safeRect.x + 10, Math.max(18, safeRect.y - 12));
  ctx.restore();

  ctx.save();
  ctx.lineWidth = 3;

  for (const it of guideItems) {
    const { x, y, w, h } = it.box;

    // ✅ For PICS: draw thumbnail inside box (semi-transparent)
    if (it.kind === "pic") {
      try {
        const picPng = await loadUploadsAnyAsPng(it.url);
        const picImg = await loadImage(picPng);

        ctx.save();
        ctx.globalAlpha = 0.28;

        ctx.translate(x, y);
        drawImageCover(ctx, picImg as any, w, h, { scale: 1, offsetX: 0, offsetY: 0 });

        ctx.restore();
      } catch {
        // ignore thumbnail failures
      }
    }

    // dashed for baked
    if (it.bakeLayer === "BAKED") ctx.setLineDash([10, 8]);
    else ctx.setLineDash([]);

    ctx.strokeStyle =
      it.kind === "text"
        ? "rgba(255,255,0,0.95)"
        : it.kind === "rect"
          ? "rgba(0,255,255,0.95)"
          : "rgba(255,0,255,0.95)";

    ctx.strokeRect(x, y, w, h);

    // label
    ctx.setLineDash([]);
    ctx.fillStyle = "rgba(0,0,0,0.7)";
    ctx.fillRect(x, y, 44, 32);

    ctx.fillStyle = "white";
    ctx.font = `bold 20px "Inter"`;
    ctx.fillText(String(it.idx), x + 12, y + 22);

    if (it.kind === "pic") {
      ctx.fillStyle = "rgba(0,0,0,0.7)";
      ctx.fillRect(x + 46, y, 54, 32);

      ctx.fillStyle = "white";
      ctx.font = `bold 18px "Inter"`;
      ctx.fillText(`P${it.picInputIndex}`, x + 56, y + 22);

      // X
      ctx.strokeStyle = "rgba(255,0,255,0.6)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + w, y + h);
      ctx.moveTo(x + w, y);
      ctx.lineTo(x, y + h);
      ctx.stroke();

      ctx.lineWidth = 3;
    }
  }

  ctx.restore();

  const guidePng = await canvas.encode("png");
  return { guidePng, guideItems };
}


export async function runBakeBrandStyleEdit(args: {
  designBaseImageUrl: string;
  styleRefImageUrl: string;
  overlayAllVisible: OverlayPayload;
  baseWidth: number;
  baseHeight: number;
  outputWidth: number;
  outputHeight: number;
  quality?: "low" | "medium" | "high" | "auto";
  behavior?: any;
  safeInsetPct?: number;
}) {
  const targetW = args.outputWidth;
  const targetH = args.outputHeight;

  const aiSize = resolveAiEditSize(targetW, targetH);
  const aiW = aiSize.w;
  const aiH = aiSize.h;

  // 1) BASE
  const basePng = await loadUploadsAnyAsPng(args.designBaseImageUrl);
  const baseFile = fileFromPng(basePng, "base.png");

  // 2) LAYOUT GUIDE (по всем visible элементам)
  const { guidePng, guideItems } = await renderLayoutGuidePng({
    baseW: args.baseWidth,
    baseH: args.baseHeight,
    outW: aiW,
    outH: aiH,
    baked: args.overlayAllVisible,
    safeInsetPct: typeof args.safeInsetPct === "number" ? args.safeInsetPct : 0.02,
  });
  const guideFile = fileFromPng(guidePng, "layout_guide.png");

  // 3) BRAND STYLE
  const styleRefPng = await loadUploadsAnyAsPng(args.styleRefImageUrl);
  const styleFile = fileFromPng(styleRefPng, "brand_style.png");

  // 4) Extra pics inputs (cap 6)
  const allPics = (args.overlayAllVisible.pics ?? []).filter((p) => p?.visible !== false);
  if (allPics.length > 6) throw new Error("Too many pics. Max 6.");

  const extraPicFiles: File[] = [];
  for (let i = 0; i < allPics.length; i++) {
    const p = allPics[i]!;
    const png = await loadUploadsAnyAsPng(String(p.url));
    extraPicFiles.push(fileFromPng(png, `pic_${i + 1}.png`));
  }

  const prompt = buildBakePrompt({ guideItems, behavior: args.behavior });

  const quality = args.quality ?? "low";
  const model = "gpt-image-1.5";

  const edited = await openai.images.edit({
    model,
    prompt,
    image: [baseFile, guideFile, styleFile, ...extraPicFiles],
    output_format: "png",
    size: `${aiW}x${aiH}`,
    quality,
    background: "opaque",
  } as any);

  const b64 = (edited as any)?.data?.[0]?.b64_json;
  if (!b64) throw new Error("AI did not return an image");

  const aiOutPng = Buffer.from(b64, "base64");

  // cover resize/crop to exact target size
  const outCanvas = createCanvas(targetW, targetH);
  const octx = outCanvas.getContext("2d");
  const aiImg = await loadImage(aiOutPng);
  //drawImageCover(octx, aiImg as any, targetW, targetH, { scale: 1, offsetX: 0, offsetY: 0 });
  drawImageContain(octx, aiImg as any, targetW, targetH);

  const finalPng = await outCanvas.encode("png");

  return { finalPng, aiSize };
}


// type LayoutGuideItem =
//   | { kind: "text"; idx: number; text: string; box: { x: number; y: number; w: number; h: number } }
//   | { kind: "pic"; idx: number; url: string; box: { x: number; y: number; w: number; h: number } }
//   | { kind: "rect"; idx: number; box: { x: number; y: number; w: number; h: number } };

// export async function renderLayoutGuidePng(args: {
//   baseW: number;
//   baseH: number;
//   outW: number;
//   outH: number;
//   baked: OverlayPayload; // только baked-layer
// }): Promise<{ guidePng: Buffer; guideItems: LayoutGuideItem[] }> {
//   const { baseW, baseH, outW, outH, baked } = args;

//   const sx = outW / baseW;
//   const sy = outH / baseH;

//   const canvas = createCanvas(outW, outH);
//   const ctx = canvas.getContext("2d");

//   // прозрачный фон
//   ctx.clearRect(0, 0, outW, outH);

//   // measure ctx для текста в базовых координатах
//   const measure = createCanvas(baseW, baseH);
//   const mctx = measure.getContext("2d");

//   const guideItems: LayoutGuideItem[] = [];
//   let idx = 1;

//   // texts
//   for (const t of (baked.texts ?? [])) {
//     if (t?.visible === false) continue;
//     const boxBase = computeTextBox(mctx, baseW, baseH, t);
//     if (!boxBase) continue;

//     const box = {
//       x: boxBase.x * sx,
//       y: boxBase.y * sy,
//       w: boxBase.w * sx,
//       h: boxBase.h * sy,
//     };

//     guideItems.push({ kind: "text", idx, text: String(t.text ?? ""), box });
//     idx++;
//   }

//   // rects
//   for (const r of (baked.rects ?? [])) {
//     if (r?.visible === false) continue;
//     const boxBase = computeBoxForRect(baseW, baseH, r);
//     if (!boxBase) continue;

//     const box = { x: boxBase.x * sx, y: boxBase.y * sy, w: boxBase.w * sx, h: boxBase.h * sy };
//     guideItems.push({ kind: "rect", idx, box });
//     idx++;
//   }

//   // pics
//   for (const p of (baked.pics ?? [])) {
//     if (p?.visible === false) continue;
//     const boxBase = computeBoxForPic(baseW, baseH, p);
//     if (!boxBase) continue;

//     const box = { x: boxBase.x * sx, y: boxBase.y * sy, w: boxBase.w * sx, h: boxBase.h * sy };
//     guideItems.push({ kind: "pic", idx, url: String(p.url ?? ""), box });
//     idx++;
//   }

//   // рисуем box-ы
//   ctx.save();
//   ctx.lineWidth = 3;

//   for (const it of guideItems) {
//     const { x, y, w, h } = it.box;

//     // рамка
//     ctx.setLineDash([10, 8]);
//     ctx.strokeStyle = it.kind === "text" ? "rgba(255,255,0,0.95)"
//       : it.kind === "rect" ? "rgba(0,255,255,0.95)"
//         : "rgba(255,0,255,0.95)";

//     ctx.strokeRect(x, y, w, h);

//     // номер
//     ctx.setLineDash([]);
//     ctx.fillStyle = "rgba(0,0,0,0.7)";
//     ctx.fillRect(x, y, 42, 32);

//     ctx.fillStyle = "white";
//     ctx.font = `bold 20px "Inter"`;
//     ctx.fillText(String(it.idx), x + 12, y + 22);

//     // для pics рисуем X
//     if (it.kind === "pic") {
//       ctx.strokeStyle = "rgba(255,0,255,0.6)";
//       ctx.beginPath();
//       ctx.moveTo(x, y);
//       ctx.lineTo(x + w, y + h);
//       ctx.moveTo(x + w, y);
//       ctx.lineTo(x, y + h);
//       ctx.stroke();
//     }
//   }

//   ctx.restore();

//   const guidePng = await canvas.encode("png");
//   return { guidePng, guideItems };
// }

export function buildBakePrompt(args: { guideItems: LayoutGuideItem[]; behavior?: any }) {
  const b = args.behavior ?? {};

  const brandControl: string = b.brandControl ?? "BRAND_GUIDED";
  const colorLogic: string = b.colorLogic ?? "PALETTE_HARMONIZED";
  const shapeStyle: string = b.shapeStyle ?? "BRAND_DERIVED";
  const layoutDiscipline: string = b.layoutDiscipline ?? "LAYOUT_LOCKED";
  const typographyEffects: string = b.typographyEffects ?? "BRAND_LED";
  const designNote: string | undefined = typeof b.designNote === "string" ? b.designNote.trim() : undefined;

  const lines: string[] = [];

  // Base context
  lines.push(
    `You have multiple input images.`,
    `Image 1: BASE photo.`,
    `Image 2: LAYOUT GUIDE overlay with numbered boxes.`,
    `Image 3: BRAND STYLE reference image.`,
    ``,
    `TASK:`,
    `Create a professional design on top of the BASE photo.`,
    `Place the typography on the BASE photo.`,
    `Do not create a poster card layout.`,
    `Do not add outer frames or background panels unless explicitly required by shapeStyle.`,
    `Apply typography/colors/vibe based on the BRAND STYLE reference.`,
    `Only use the provided text. Do not invent new text.`,
    `Never place anything outside the canvas.`,
    ``,
    `IMPORTANT: The layout guide includes an INNER SAFE FRAME.`,
    `All text and shapes must stay fully inside the SAFE FRAME.`,
    `Do not place any text or shapes outside the safe frame, even slightly.`,
    `If something does not fit, scale it down to fit inside the box and safe frame.`,
    `HARD RULE:`,
    `Do NOT copy or reuse ANY words, numbers, slogans, or letters from the BRAND STYLE reference image.`,
    `Do NOT include any text that is not EXACTLY one of the allowed strings above.`,
    `If you see text in the reference image, IGNORE it completely.`,
    ``,
    `HARD RULES:`,
    `Do NOT "improve" the design.`,
    `Do NOT modernize, simplify, or add creative touches.`,
    `Do NOT add textures, gradients, glow, sparks, random strokes, or angled decorations unless the reference clearly has them.`,
    `Do NOT change the vibe away from the reference.`,
    `CRITICAL TEXT RULE (HARD):`,
    `The BRAND STYLE reference image may contain words, numbers, prices, slogans.`,
    `You MUST IGNORE all text visible in the reference image.`,
    `NEVER copy any text from the reference image.`,
    `ONLY render text that is explicitly provided in the numbered TEXT boxes.`,
    `Do NOT transcribe or replicate any text from any input image.`,
    `Do NOT perform OCR.`,
    `Do NOT add any extra words or numbers.`,
    ``,
    `CANVAS BORDER RULE (CRITICAL):`,
    `Do NOT add any frame, border, outline or colored edge around the canvas.`,
    `Do NOT create a poster card effect.`,
    `The image must extend fully to the edges.`,
    `The canvas edges must remain clean.`,
    `If the reference image contains a border or frame, IGNORE it.`,
    `Borders and frames are not part of the applied design.`,
    ``,
  );

  // Behavior presets (generic, reusable)
  lines.push(`BEHAVIOR PRESETS:`);

  // Brand control
  if (brandControl === "BRAND_ACCURATE") {
    lines.push(`- Brand Control: STRICT REPLICATION.
                  You must replicate the reference design language as closely as possible.
                  DO NOT redesign.
                  DO NOT change typography style.
                  DO NOT introduce new motifs or decorative elements.
                  Use only design elements that are clearly present in the reference.
                  If unsure, choose the simplest option.`);
  } else if (brandControl === "CREATIVE_INTERPRETATION") {
    lines.push(`- Brand Control: Interpret the brand style creatively while staying tasteful and commercial.`);
  } else {
    lines.push(`- Brand Control: Use brand style as primary guidance; allow mild adaptation to the base photo.`);
  }

  // Color logic
  if (colorLogic === "PALETTE_LOCKED") {
    lines.push(`- Color Logic: PALETTE LOCKED (STRICT).
                  Use ONLY the dominant colors visible in the BRAND STYLE reference.
                  Do not shift hues.
                  Do not add new accent colors.
                  If you need a dark/light, derive it from the reference (off-white / dark gray), not pure white/black unless present.`);
  } else if (colorLogic === "MOOD_BASED") {
    lines.push(`- Color Logic: Choose colors that fit the overall mood of the base photo while staying consistent with brand vibe. Avoid clashing/random accents.`);
  } else {
    lines.push(`- Color Logic: Brand colors must remain dominant; you may harmonize subtly with base photo colors.`);
  }

  // Shape style
  if (shapeStyle === "NONE") {
    lines.push(`
    Shape Style: Do not draw any badges, plates, ribbons, lines, background panels or decorative shapes. Text and provided images only.`,
      `HARD BAN (STRICT):`,
      `No badges.`,
      `No background panels.`,
      `No ribbons.`,
      `No shapes.`,
      `No borders.`,
      `No frames.`,
      `No edge accents.`,
      `No card layout.`,
      `No rounded canvas corners.`,
      `No colored outlines around the image.`,
      `Text only. Directly on photo.`,
    );
  } else if (shapeStyle === "STRUCTURAL") {
    lines.push(`- Shape Style: Use simple clean shapes only. No decorative badges or complex geometry.`);
  } else if (shapeStyle === "EXPRESSIVE") {
    lines.push(`- Shape Style: You may use expressive/decorative shapes, but keep balance and readability.`);
  } else {
    lines.push(`- Shape Style: Use shapes inspired by the brand reference; keep proportions professional.`);
  }

  // Layout discipline
  if (layoutDiscipline === "LAYOUT_LOCKED") {
    lines.push(
      ``,
      `STRICT LAYOUT MODE (HARD):`,
      `This is NOT an auto-layout task and NOT a redesign task.`,
      `Follow the LAYOUT GUIDE exactly. The guide is the source of truth for placement.`,
      ``,
      `DEFINITION (IMPORTANT):`,
      `- A "box" means the NUMBERED RECTANGLE drawn on the LAYOUT GUIDE image (Image 2).`,
      `- Each numbered rectangle is a hard placement zone for exactly one element.`,
      `- The box is NOT the whole canvas and NOT a suggestion.`,
      ``,
      `NO WORD BREAKS (HARD):`,
      `- Do NOT split a single word across multiple lines (no syllable breaks).`,
      `- Do NOT hyphenate words.`,
      `- Keep words intact on one line whenever possible.`,
      `- If a word does not fit inside its box, reduce font size or widen tracking slightly, but keep the word on one line.`,
      `- Only wrap between separate words (spaces). Never break inside a word.`,
      ``,
      `LAYOUT POSITION RULES (HARD):`,
      `- You MUST keep every element inside its assigned numbered rectangle.`,
      `- Do NOT move elements to another area of the canvas.`,
      `- Do NOT move any text higher or lower than its assigned rectangle.`,
      `- Do NOT rebalance or "improve" the layout for aesthetics.`,
      `- Do NOT center everything on the canvas unless the rectangle itself is centered.`,
      `- If something does not fit: scale it down or wrap lines INSIDE the same rectangle.`,
      `- Never place anything outside the SAFE FRAME.`,
      ``,
      `GUIDE VISIBILITY RULE (HARD):`,
      `- The layout guide lines, rectangles, numbers, and safe frame are guides only.`,
      `- Do NOT copy, trace, redraw, stylize, or reproduce any guide lines in the final image.`,
      `- Final output must contain ZERO guide lines and ZERO numbers.`
    );
  } else {
    lines.push(`- Layout Discipline: Prefer staying inside boxes. Minor adjustments allowed only to improve balance. Never exceed canvas boundaries.`);
  }
  // typographyEffects
  if (typographyEffects === "BRAND_LED") {
    lines.push(
      `TYPOGRAPHY EFFECTS MODE: BRAND_LED (REFERENCE-LED)`,
      `GOAL: Recreate the typography effects EXACTLY as they appear in the BRAND STYLE reference.`,
      ``,
      `RULES (HARD):`,
      `- If the reference typography is upright: keep text upright (non-italic, no slant).`,
      `- If the reference typography is italic/slanted: use the same slant direction and similar intensity.`,
      `- If the reference uses 3D/extrusion: replicate it subtly, not exaggerated.`,
      `- If the reference uses outline: replicate outline thickness and color style.`,
      `- If the reference uses shadow: replicate direction and softness.`,
      `- DO NOT invent effects that are not clearly visible in the reference.`,
      `- Do NOT "upgrade" typography with extra tilt, extra depth, extra glow, extra decorations.`,
      ``,
      `ANTI-FRAME RULE (HARD):`,
      `- Never add a canvas border/frame/edge outline.`,
      `- If the reference has a border/frame, IGNORE it (do not copy it).`
    );
  } else if (typographyEffects === "STRICT") {
    lines.push(
      `TYPOGRAPHY EFFECTS MODE: STRICT (GEOMETRY-LOCKED)`,
      `GOAL: Keep brand look, but remove ALL dynamic geometry effects on text.`,
      ``,
      `HARD GEOMETRY RULES:`,
      `- All text must be perfectly horizontal (0° rotation).`,
      `- Do NOT rotate, tilt, skew, shear, warp, curve, or apply perspective to text.`,
      `- Use UPRIGHT (non-italic) letterforms only.`,
      `- Do NOT use italic/oblique/slanted fonts unless the reference is clearly italic (otherwise keep upright).`,
      `- No 3D text, no extrusion, no bevel, no perspective shadows.`,
      ``,
      `ALLOWED (ONLY IF PRESENT IN REFERENCE):`,
      `- Flat 2D outline (stroke) around letters.`,
      `- Flat drop shadow (no angled/perspective look).`,
      `- Solid fills by default; do not invent gradients unless clearly present in the reference.`,
      ``,
      `ANTI-FRAME RULE (HARD):`,
      `- Do NOT add any canvas border/frame/edge outline.`,
      `- If the reference has a border/frame, IGNORE it.`
    );
  } else {
    lines.push(
      `  You MAY use mild dynamic typography (slight tilt, bold shadow, subtle 3D) to increase impact.`,
      `  Keep it commercial and readable.`,
      `  Limits: max 10–15° tilt; no extreme perspective; no distortion.`
    );
  }

  if (designNote) {
    lines.push(``, `DESIGN NOTE: ${designNote}`);
  }

  lines.push(``, `PLACEMENT RULES:`, `Place each element strictly inside its numbered box from the layout guide.`);

  // Per-box instructions
  for (const it of args.guideItems) {
    if (it.kind === "text") {
      lines.push(`Box #${it.idx} is TEXT: "${it.text}"
        .Place the text inside the box. Keep it readable and aligned to the box.`,
        `Place this text STRICTLY inside Box #${it.idx}.`,
        `HARD: Do NOT split words.`,
        `If it doesn't fit: reduce font size, adjust letter spacing slightly, or use a shorter layout within the same box.`,
        `Wrap only at spaces between words.`
      );
    } else if (it.kind === "rect") {
      if (shapeStyle === "NONE") {
        lines.push(
          `- Shape Style: Do not draw any badges, plates, ribbons, lines, background panels or decorative shapes. Text and provided images only.`,
          `- HARD RULE: Do not add any new graphic elements at all (no shapes, no panels, no strokes, no outlines, no highlights).`,
          `- HARD RULE: Do not add background behind text. Text must be directly on the base photo.`
        );
      } else {
        lines.push(
          `Box #${it.idx} is a SHAPE area. Design a suitable background/plate inside the box (according to Shape Style + Brand Style).`,
          `Do not spill outside the box.`,
          `FINAL CHECK (HARD):`,
          `Before output: ensure no single word is broken across lines. If any word is split, fix it by resizing text, not by breaking the word.`
        );
      }
    } else {
      // IMPORTANT: if you already implemented P1 mapping (picInputIndex), include it
      const pIndex = (it as any).picInputIndex;
      if (typeof pIndex === "number") {
        lines.push(
          `Box #${it.idx} is an IMAGE placeholder.`,
          `Use input image P${pIndex} (file pic_${pIndex}.png).`,
          `Place it STRICTLY inside Box #${it.idx}. If it doesn't fit, scale/crop INSIDE the box. Do NOT move it elsewhere.`
        );
      } else {
        lines.push(`Box #${it.idx} is an IMAGE placeholder. Place the corresponding provided image inside the box. Do not move it outside the box.`);
      }
    }
  }

  lines.push(``, `OUTPUT: a single final image with all elements applied.`);

  return lines.join("\n");
}


