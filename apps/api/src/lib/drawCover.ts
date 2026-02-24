export function drawCover(ctx: any, src: any, TW: number, TH: number) {
    const iw = src.width;
    const ih = src.height;

    const scale = Math.max(TW / iw, TH / ih);
    const sw = TW / scale;
    const sh = TH / scale;

    const sx = Math.max(0, (iw - sw) / 2);
    const sy = Math.max(0, (ih - sh) / 2);

    ctx.drawImage(src, sx, sy, sw, sh, 0, 0, TW, TH);
}