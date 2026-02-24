import { createCanvas, loadImage } from "@napi-rs/canvas";

type AlignMaskUniversalResult = {
    alignedMaskPng: Buffer;
    coarseDx: number;
    coarseDy: number;
    fineDx: number;
    fineDy: number;
    finalDx: number;
    finalDy: number;
    bestScore: number;
};

function luma(r: number, g: number, b: number): number {
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function clampInt(v: number, lo: number, hi: number): number {
    return v < lo ? lo : v > hi ? hi : v;
}

function normalize01(a: Float32Array): void {
    let mx = 0;
    for (let i = 0; i < a.length; i++) if (a[i] > mx) mx = a[i];
    if (mx <= 1e-6) return;
    for (let i = 0; i < a.length; i++) a[i] /= mx;
}

function centroidEdgesNearBoundary(args: {
    edges01: Float32Array;
    boundary: Uint8Array;
    w: number;
    h: number;
    bandPx: number;        // например 40
    edgeThr: number;       // например 0.35
}): { cx: number; cy: number; count: number } {
    const { edges01, boundary, w, h, bandPx, edgeThr } = args;

    let sx = 0, sy = 0, c = 0;

    for (let y = 1; y < h - 1; y++) {
        for (let x = 1; x < w - 1; x++) {
            if (edges01[y * w + x] < edgeThr) continue;

            // есть ли boundary в окрестности bandPx?
            let near = false;
            const y0 = Math.max(1, y - bandPx);
            const y1 = Math.min(h - 2, y + bandPx);
            const x0 = Math.max(1, x - bandPx);
            const x1 = Math.min(w - 2, x + bandPx);

            // короткий early-exit
            for (let yy = y0; yy <= y1 && !near; yy += 2) {
                for (let xx = x0; xx <= x1; xx += 2) {
                    if (boundary[yy * w + xx] === 1) { near = true; break; }
                }
            }

            if (!near) continue;

            sx += x;
            sy += y;
            c++;
        }
    }

    if (c === 0) return { cx: w / 2, cy: h / 2, count: 0 };
    return { cx: sx / c, cy: sy / c, count: c };
}


function sobelEdges(gray: Float32Array, w: number, h: number): Float32Array {
    const out = new Float32Array(w * h);
    for (let y = 1; y < h - 1; y++) {
        for (let x = 1; x < w - 1; x++) {
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

            out[y * w + x] = Math.hypot(gx, gy);
        }
    }
    return out;
}

function boxBlur3x3(a: Float32Array, w: number, h: number): Float32Array {
    const out = new Float32Array(w * h);
    for (let y = 1; y < h - 1; y++) {
        for (let x = 1; x < w - 1; x++) {
            let s = 0;
            for (let yy = -1; yy <= 1; yy++) {
                for (let xx = -1; xx <= 1; xx++) {
                    s += a[(y + yy) * w + (x + xx)];
                }
            }
            out[y * w + x] = s / 9;
        }
    }
    return out;
}

function percentileThreshold(a: Float32Array, pct: number): number {
    // pct: 0..1 (e.g. 0.90 means keep top 10%)
    const arr = Array.from(a);
    arr.sort((x, y) => x - y);
    const idx = clampInt(Math.floor(pct * (arr.length - 1)), 0, arr.length - 1);
    return arr[idx];
}

function maskBinaryFromRGBA(maskRGBA: Uint8ClampedArray, w: number, h: number): Uint8Array {
    const bin = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) {
        const r = maskRGBA[i * 4];
        const g = maskRGBA[i * 4 + 1];
        const b = maskRGBA[i * 4 + 2];
        bin[i] = (r + g + b) >= 600 ? 1 : 0; // white-ish
    }
    return bin;
}

function boundaryFromBinary(bin: Uint8Array, w: number, h: number): Uint8Array {
    const b = new Uint8Array(w * h);
    for (let y = 1; y < h - 1; y++) {
        for (let x = 1; x < w - 1; x++) {
            const i = y * w + x;
            if (bin[i] === 0) continue;
            if (
                bin[(y - 1) * w + x] === 0 ||
                bin[(y + 1) * w + x] === 0 ||
                bin[y * w + (x - 1)] === 0 ||
                bin[y * w + (x + 1)] === 0
            ) {
                b[i] = 1;
            }
        }
    }
    return b;
}

function centroidOfOnes(map01: Float32Array, w: number, h: number, thr: number): { cx: number; cy: number; count: number } {
    let sx = 0;
    let sy = 0;
    let c = 0;
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const v = map01[y * w + x];
            if (v >= thr) {
                sx += x;
                sy += y;
                c++;
            }
        }
    }
    if (c === 0) return { cx: w / 2, cy: h / 2, count: 0 };
    return { cx: sx / c, cy: sy / c, count: c };
}

function centroidOfBoundary(boundary: Uint8Array, w: number, h: number): { cx: number; cy: number; count: number } {
    let sx = 0;
    let sy = 0;
    let c = 0;
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            if (boundary[y * w + x] === 1) {
                sx += x;
                sy += y;
                c++;
            }
        }
    }
    if (c === 0) return { cx: w / 2, cy: h / 2, count: 0 };
    return { cx: sx / c, cy: sy / c, count: c };
}

function scoreBoundaryOnEdges(
    boundary: Uint8Array,
    edges01: Float32Array,
    w: number,
    h: number,
    dx: number,
    dy: number
): number {
    let s = 0;
    let c = 0;
    for (let y = 1; y < h - 1; y++) {
        const yy = y + dy;
        if (yy <= 0 || yy >= h - 1) continue;
        for (let x = 1; x < w - 1; x++) {
            if (boundary[y * w + x] === 0) continue;
            const xx = x + dx;
            if (xx <= 0 || xx >= w - 1) continue;
            s += edges01[yy * w + xx];
            c++;
        }
    }
    if (c === 0) return -1e9;
    return s / c;
}

async function shiftMaskPng(maskPng: Buffer, w: number, h: number, dx: number, dy: number): Promise<Buffer> {
    const c = createCanvas(w, h);
    const ctx = c.getContext("2d");
    ctx.fillStyle = "black";
    ctx.fillRect(0, 0, w, h);

    const m = await loadImage(maskPng);
    ctx.drawImage(m as never, dx, dy);
    return Buffer.from(await c.encode("png"));
}

export async function alignMaskToImageUniversal(args: {
    sourcePng: Buffer; // aiSrcPng
    maskPng: Buffer;   // raw/threshold mask, same size
    w: number;
    h: number;
    coarseTopEdgePct?: number; // e.g. 0.90 keeps top 10%
    fineRadiusPx?: number;     // e.g. 8
    lambda?: number;           // regularization strength
}): Promise<AlignMaskUniversalResult> {
    const {
        sourcePng,
        maskPng,
        w,
        h,
        coarseTopEdgePct = 0.90,
        fineRadiusPx = 8,
        lambda = 0.002,
    } = args;

    // --- source -> grayscale ---
    const cs = createCanvas(w, h);
    const xs = cs.getContext("2d");
    const srcImg = await loadImage(sourcePng);
    xs.drawImage(srcImg as never, 0, 0, w, h);
    const src = xs.getImageData(0, 0, w, h).data;

    const gray = new Float32Array(w * h);
    for (let i = 0; i < w * h; i++) {
        gray[i] = luma(src[i * 4], src[i * 4 + 1], src[i * 4 + 2]);
    }

    let edges = sobelEdges(gray, w, h);
    normalize01(edges);
    edges = boxBlur3x3(edges, w, h);
    normalize01(edges);

    // threshold edges for centroid
    const thr = percentileThreshold(edges, coarseTopEdgePct);

    // --- mask -> boundary ---
    const cm = createCanvas(w, h);
    const xm = cm.getContext("2d");
    const maskImg = await loadImage(maskPng);
    xm.drawImage(maskImg as never, 0, 0, w, h);
    const md = xm.getImageData(0, 0, w, h).data;

    const bin = maskBinaryFromRGBA(md, w, h);
    const boundary = boundaryFromBinary(bin, w, h);

    const mC = centroidOfBoundary(boundary, w, h);

    const objC = centroidEdgesNearBoundary({
        edges01: edges,
        boundary,
        w,
        h,
        bandPx: 40,
        edgeThr: 0.35,
    });

    let coarseDx = Math.round(objC.cx - mC.cx);
    let coarseDy = Math.round(objC.cy - mC.cy);

    // обязательно clamp!
    coarseDx = clampInt(coarseDx, -12, 12);
    coarseDy = clampInt(coarseDy, -12, 12);

    // --- fine search around 0 after coarse ---
    let bestDx = 0;
    let bestDy = 0;
    let bestScore = -1e18;

    for (let dy = -fineRadiusPx; dy <= fineRadiusPx; dy++) {
        for (let dx = -fineRadiusPx; dx <= fineRadiusPx; dx++) {
            const s = scoreBoundaryOnEdges(boundary, edges, w, h, coarseDx + dx, coarseDy + dy)
                - lambda * (dx * dx + dy * dy); // keep near coarse
            if (s > bestScore) {
                bestScore = s;
                bestDx = dx;
                bestDy = dy;
            }
        }
    }

    const finalDx = 0;
    const finalDy = 0;

    const alignedMaskPng = await shiftMaskPng(maskPng, w, h, finalDx, finalDy);

    return {
        alignedMaskPng,
        coarseDx,
        coarseDy,
        fineDx: bestDx,
        fineDy: bestDy,
        finalDx,
        finalDy,
        bestScore,
    };
}
