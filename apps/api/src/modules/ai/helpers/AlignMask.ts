import { createCanvas, loadImage } from "@napi-rs/canvas";

type AlignMaskResult = {
  alignedMaskPng: Buffer;
  dx: number;
  dy: number;
  score: number;
};

function toGrayLuma(r: number, g: number, b: number): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function buildEdgeMapSobel(gray: Float32Array, w: number, h: number): Float32Array {
  const out = new Float32Array(w * h);

  // Sobel kernels
  // Gx: [-1 0 1; -2 0 2; -1 0 1]
  // Gy: [-1 -2 -1; 0 0 0; 1 2 1]
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;

      const a00 = gray[(y - 1) * w + (x - 1)];
      const a01 = gray[(y - 1) * w + x];
      const a02 = gray[(y - 1) * w + (x + 1)];
      const a10 = gray[y * w + (x - 1)];
      const a12 = gray[y * w + (x + 1)];
      const a20 = gray[(y + 1) * w + (x - 1)];
      const a21 = gray[(y + 1) * w + x];
      const a22 = gray[(y + 1) * w + (x + 1)];

      const gx = (-1 * a00) + (1 * a02) + (-2 * a10) + (2 * a12) + (-1 * a20) + (1 * a22);
      const gy = (-1 * a00) + (-2 * a01) + (-1 * a02) + (1 * a20) + (2 * a21) + (1 * a22);

      // magnitude
      out[i] = Math.hypot(gx, gy);
    }
  }
  return out;
}

function normalizeTo01(arr: Float32Array): void {
  let max = 0;
  for (let i = 0; i < arr.length; i++) if (arr[i] > max) max = arr[i];
  if (max <= 1e-6) return;
  for (let i = 0; i < arr.length; i++) arr[i] /= max;
}

function buildMaskBinary(maskRGBA: Uint8ClampedArray, w: number, h: number): Uint8Array {
  const bin = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const r = maskRGBA[i * 4 + 0];
    const g = maskRGBA[i * 4 + 1];
    const b = maskRGBA[i * 4 + 2];
    // white-ish => 1
    bin[i] = (r + g + b) >= 600 ? 1 : 0; // ~200*3
  }
  return bin;
}

function buildMaskBoundary(bin: Uint8Array, w: number, h: number): Uint8Array {
  const out = new Uint8Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      if (bin[i] !== 1) continue;

      // boundary if any neighbor is 0
      const n0 = bin[(y - 1) * w + x];
      const n1 = bin[(y + 1) * w + x];
      const n2 = bin[y * w + (x - 1)];
      const n3 = bin[y * w + (x + 1)];
      if (n0 === 0 || n1 === 0 || n2 === 0 || n3 === 0) out[i] = 1;
    }
  }
  return out;
}

function scoreShift(boundary: Uint8Array, edges01: Float32Array, w: number, h: number, dx: number, dy: number): number {
  let s = 0;
  let cnt = 0;

  // sample only boundary pixels; sum edge strength where boundary lands
  for (let y = 1; y < h - 1; y++) {
    const yy = y + dy;
    if (yy <= 0 || yy >= h - 1) continue;

    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      if (boundary[i] === 0) continue;

      const xx = x + dx;
      if (xx <= 0 || xx >= w - 1) continue;

      const j = yy * w + xx;
      s += edges01[j];
      cnt++;
    }
  }

  if (cnt === 0) return -1e9;
  return s / cnt;
}

async function shiftMaskPng(maskPng: Buffer, w: number, h: number, dx: number, dy: number): Promise<Buffer> {
  const canvas = createCanvas(w, h);
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, w, h);

  const m = await loadImage(maskPng);
  // background black
  ctx.fillStyle = "black";
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(m as any, dx, dy);

  return Buffer.from(await canvas.encode("png"));
}

export async function alignMaskToDishByEdges(args: {
  sourcePng: Buffer;   // aiSrcPng
  maskPng: Buffer;     // current mask (same size as source)
  w: number;
  h: number;
  maxShiftPx?: number; // default 20
}): Promise<AlignMaskResult> {
  const { sourcePng, maskPng, w, h, maxShiftPx = 20 } = args;

  // --- read source -> grayscale ---
  const c1 = createCanvas(w, h);
  const x1 = c1.getContext("2d");
  const srcImg = await loadImage(sourcePng);
  x1.drawImage(srcImg as any, 0, 0, w, h);
  const srcData = x1.getImageData(0, 0, w, h).data;

  const gray = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    gray[i] = toGrayLuma(srcData[i * 4], srcData[i * 4 + 1], srcData[i * 4 + 2]);
  }

  const edges = buildEdgeMapSobel(gray, w, h);
  normalizeTo01(edges);

  // --- read mask -> boundary pixels ---
  const c2 = createCanvas(w, h);
  const x2 = c2.getContext("2d");
  const maskImg = await loadImage(maskPng);
  x2.drawImage(maskImg as any, 0, 0, w, h);
  const maskData = x2.getImageData(0, 0, w, h).data;

  const bin = buildMaskBinary(maskData, w, h);
  const boundary = buildMaskBoundary(bin, w, h);

  // --- brute force small shifts ---
  let bestDx = 0;
  let bestDy = 0;
  let bestScore = -1e18;

  for (let dy = -maxShiftPx; dy <= maxShiftPx; dy++) {
    for (let dx = -maxShiftPx; dx <= maxShiftPx; dx++) {
      const s = scoreShift(boundary, edges, w, h, dx, dy);
      if (s > bestScore) {
        bestScore = s;
        bestDx = dx;
        bestDy = dy;
      }
    }
  }

  const aligned = await shiftMaskPng(maskPng, w, h, bestDx, bestDy);

  return { alignedMaskPng: aligned, dx: bestDx, dy: bestDy, score: bestScore };
}
