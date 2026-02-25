import { createCanvas, loadImage, Image } from '@napi-rs/canvas';

export async function generateDishMaskCutout({
  openai,
  aiBytesPng,
  aiW,
  aiH,
}: {
  openai: any;
  aiBytesPng: Buffer;
  aiW: number;
  aiH: number;
}): Promise<Buffer> {
  const prompt = `
Return a BLACK-AND-WHITE segmentation mask PNG.

WHITE = ONLY the dish itself (bun, patty, cheese, fillings).
BLACK = everything else (plate, tray, table, background, shadows).

Strict rules:
- Do NOT shift, rotate, scale, crop, or redraw.
- Do NOT change framing. Output mask in the exact same position as the input pixels.
- Return ONLY the mask.

Rules:
- PURE white (#FFFFFF) and PURE black (#000000)
- No gray, no feather, no blur
- If unsure, include a bit MORE of the dish, never less
- The output MUST be perfectly pixel-aligned with the input.


`.trim();

  const file = new File(
    [new Uint8Array(aiBytesPng)],
    "input.png",
    { type: "image/png" }
  );

  const r = await openai.images.edit({
    model: "gpt-image-1.5",
    prompt,
    image: [file],
    size: `${aiW}x${aiH}`,
    output_format: "png",
    quality: "low",
    background: "opaque",
  } as any);

  const b64 = (r as any)?.data?.[0]?.b64_json;
  if (!b64) throw new Error("OpenAI did not return mask");

  return Buffer.from(b64, "base64");
}

export async function fillMaskHoles(maskPng: Buffer, w: number, h: number): Promise<Buffer> {
  const c = createCanvas(w, h);
  const ctx = c.getContext("2d");

  const img = await loadImage(maskPng);
  ctx.clearRect(0, 0, w, h);
  ctx.drawImage(img as unknown as Image, 0, 0, w, h);

  const im = ctx.getImageData(0, 0, w, h);
  const d = im.data;

  // 1) binarize -> fg (1 = white)
  const fg = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      // берём яркость (можно проще: d[i] > 128 если маска уже BW)
      const lum = d[i] * 0.2126 + d[i + 1] * 0.7152 + d[i + 2] * 0.0722;
      fg[y * w + x] = lum >= 128 ? 1 : 0;
    }
  }

  // 2) optional: morphological closing (запечатывает мелкие дырки)
  // r=1..2 обычно ок, если дыр очень много - попробуй 2
  const fgClosed = closeBinary(fg, w, h, 2);

  // 3) flood-fill background from borders on INVERTED (holes = background not connected to border)
  const vis = new Uint8Array(w * h);
  const q = new Int32Array(w * h);
  let qs = 0, qe = 0;

  const push = (idx: number) => {
    if (vis[idx]) return;
    if (fgClosed[idx] === 1) return; // foreground blocks flood
    vis[idx] = 1;
    q[qe++] = idx;
  };

  // seed borders
  for (let x = 0; x < w; x++) {
    push(0 * w + x);
    push((h - 1) * w + x);
  }
  for (let y = 0; y < h; y++) {
    push(y * w + 0);
    push(y * w + (w - 1));
  }

  // 4-neighbor flood; если хочешь ещё агрессивнее закрывать диагональные щели — сделай 8-neighbor
  while (qs < qe) {
    const idx = q[qs++];
    const x = idx % w;
    const y = (idx / w) | 0;

    if (x > 0) push(idx - 1);
    if (x + 1 < w) push(idx + 1);
    if (y > 0) push(idx - w);
    if (y + 1 < h) push(idx + w);
  }

  // 4) fill holes: background pixels NOT visited => inside holes => set to foreground
  const fgFilled = fgClosed; // можно копию сделать, но можно и так
  for (let idx = 0; idx < w * h; idx++) {
    if (fgFilled[idx] === 0 && vis[idx] === 0) fgFilled[idx] = 1;
  }

  // 5) write FINAL pure BW mask (важно!)
  for (let idx = 0; idx < w * h; idx++) {
    const i = idx * 4;
    const v = fgFilled[idx] ? 255 : 0;
    d[i] = v;
    d[i + 1] = v;
    d[i + 2] = v;
    d[i + 3] = 255;
  }

  ctx.putImageData(im, 0, 0);
  return c.encode("png");
}

export async function thresholdAndDilateMask({
  maskPng,
  w,
  h,
  dilatePx,
}: {
  maskPng: Buffer;
  w: number;
  h: number;
  dilatePx: number;
}): Promise<Buffer> {
  const c = createCanvas(w, h);
  const ctx = c.getContext("2d");
  const img = await loadImage(maskPng);
  ctx.drawImage(img as any, 0, 0, w, h);

  const im = ctx.getImageData(0, 0, w, h);
  const d = im.data;

  // threshold -> чисто черно/белое по люминансу
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i], g = d[i + 1], b = d[i + 2];
    const lum = (r * 0.2126 + g * 0.7152 + b * 0.0722);
    const v = lum > 128 ? 255 : 0;
    d[i] = v; d[i + 1] = v; d[i + 2] = v; d[i + 3] = 255;
  }
  ctx.putImageData(im, 0, 0);

  if (dilatePx <= 0) return c.encode("png");

  // дилатация: быстрый трюк через blur + threshold (на практике работает отлично)
  ctx.globalCompositeOperation = "source-over";
  ctx.filter = `blur(${dilatePx}px)`;
  ctx.drawImage(c as any, 0, 0);
  ctx.filter = "none";

  const im2 = ctx.getImageData(0, 0, w, h);
  const d2 = im2.data;
  for (let i = 0; i < d2.length; i += 4) {
    const v = d2[i] > 16 ? 255 : 0; // низкий порог после blur
    d2[i] = v; d2[i + 1] = v; d2[i + 2] = v; d2[i + 3] = 255;
  }
  ctx.putImageData(im2, 0, 0);

  return c.encode("png");
}

export async function shrinkBinaryMask({
  maskPng,
  w,
  h,
  px,
}: {
  maskPng: Buffer;
  w: number;
  h: number;
  px: number; // 1–3 обычно
}): Promise<Buffer> {
  if (px <= 0) return maskPng;

  const c = createCanvas(w, h);
  const ctx = c.getContext("2d");

  const img = await loadImage(maskPng);

  ctx.drawImage(img as any, 0, 0, w, h);

  // erode via blur + threshold (inverse of dilate)
  ctx.filter = `blur(${px}px)`;
  ctx.drawImage(c as any, 0, 0);
  ctx.filter = "none";

  const im = ctx.getImageData(0, 0, w, h);
  const d = im.data;

  for (let i = 0; i < d.length; i += 4) {
    // более высокий порог = усадка
    const v = d[i] > 240 ? 255 : 0;
    d[i] = v;
    d[i + 1] = v;
    d[i + 2] = v;
    d[i + 3] = 255;
  }

  ctx.putImageData(im, 0, 0);
  return c.encode("png");
}

export function dilateBinary(src: Uint8Array, w: number, h: number, r: number): Uint8Array {
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - r);
    const y1 = Math.min(h - 1, y + r);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - r);
      const x1 = Math.min(w - 1, x + r);
      let v = 0;
      for (let yy = y0; yy <= y1 && v === 0; yy++) {
        const row = yy * w;
        for (let xx = x0; xx <= x1; xx++) {
          if (src[row + xx] === 1) { v = 1; break; }
        }
      }
      out[y * w + x] = v;
    }
  }
  return out;
}

export function erodeBinary(src: Uint8Array, w: number, h: number, r: number): Uint8Array {
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - r);
    const y1 = Math.min(h - 1, y + r);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - r);
      const x1 = Math.min(w - 1, x + r);
      let v = 1;
      for (let yy = y0; yy <= y1 && v === 1; yy++) {
        const row = yy * w;
        for (let xx = x0; xx <= x1; xx++) {
          if (src[row + xx] === 0) { v = 0; break; }
        }
      }
      out[y * w + x] = v;
    }
  }
  return out;
}

export function closeBinary(src: Uint8Array, w: number, h: number, r: number): Uint8Array {
  // closing = dilate then erode
  return erodeBinary(dilateBinary(src, w, h, r), w, h, r);
}

export async function makeSoftMaskPng({
  maskPng,
  w,
  h,
  expandPx,
  featherPx,
}: {
  maskPng: Buffer;
  w: number;
  h: number;
  expandPx: number;   // например 6
  featherPx: number;  // например 3
}): Promise<Buffer> {
  const c = createCanvas(w, h);
  const ctx = c.getContext("2d");

  const img = await loadImage(maskPng);
  ctx.clearRect(0, 0, w, h);
  ctx.drawImage(img as unknown as Image, 0, 0, w, h);

  // 1) normalize to grayscale (0..255) but NOT binary
  const im = ctx.getImageData(0, 0, w, h);
  const d = im.data;

  for (let i = 0; i < d.length; i += 4) {
    const r = d[i], g = d[i + 1], b = d[i + 2];
    const lum = r * 0.2126 + g * 0.7152 + b * 0.0722;
    // clamp
    const v = lum < 0 ? 0 : lum > 255 ? 255 : lum;
    d[i] = v; d[i + 1] = v; d[i + 2] = v; d[i + 3] = 255;
  }
  ctx.putImageData(im, 0, 0);

  // 2) expand mask slightly (grow white area)
  if (expandPx > 0) {
    ctx.filter = `blur(${expandPx}px)`;
    ctx.drawImage(c as unknown as Image, 0, 0);
    ctx.filter = "none";

    // after blur, make it "mostly white" but keep mid-grays for feather later
    const im2 = ctx.getImageData(0, 0, w, h);
    const d2 = im2.data;
    for (let i = 0; i < d2.length; i += 4) {
      // boost whites: push values up a bit
      const v = d2[i];
      const boosted = Math.min(255, Math.max(0, v * 1.25));
      d2[i] = boosted; d2[i + 1] = boosted; d2[i + 2] = boosted; d2[i + 3] = 255;
    }
    ctx.putImageData(im2, 0, 0);
  }

  // 3) feather edges (soft transition)
  if (featherPx > 0) {
    ctx.filter = `blur(${featherPx}px)`;
    ctx.drawImage(c as unknown as Image, 0, 0);
    ctx.filter = "none";
  }

  return c.encode("png");
}

export async function makeDishCutoutPng(args: {
  sourcePng: Buffer;
  maskPng: Buffer;
  w: number;
  h: number;
}): Promise<Buffer> {
  const { sourcePng, maskPng, w, h } = args;

  const c = createCanvas(w, h);
  const ctx = c.getContext("2d");

  const srcImg = await loadImage(sourcePng);
  ctx.clearRect(0, 0, w, h);
  ctx.drawImage(srcImg as unknown as Image, 0, 0, w, h);

  const src = ctx.getImageData(0, 0, w, h);
  const d = src.data;

  // load mask -> get pixels
  const mCanvas = createCanvas(w, h);
  const mCtx = mCanvas.getContext("2d");
  const mImg = await loadImage(maskPng);
  mCtx.clearRect(0, 0, w, h);
  mCtx.drawImage(mImg as unknown as Image, 0, 0, w, h);

  const mask = mCtx.getImageData(0, 0, w, h).data;

  // keep only WHITE area of mask => alpha=255 else alpha=0
  // alpha comes from mask grayscale (0..255) with gentle levels
  const low = 5;   // можно тюнить
  const high = 200; // можно тюнить

  for (let i = 0; i < d.length; i += 4) {
    const mr = mask[i];
    const mg = mask[i + 1];
    const mb = mask[i + 2];
    const lum = mr * 0.2126 + mg * 0.7152 + mb * 0.0722;

    const low = 5;
    const high = 200;

    let a: number;
    if (lum <= low) a = 0;
    else if (lum >= high) a = 255;
    else a = ((lum - low) * 255) / (high - low);

    d[i + 3] = a;
  }


  ctx.putImageData(src, 0, 0);
  return c.encode("png");
}

