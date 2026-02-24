// Работает с SKRSContext2D (@napi-rs/canvas)

type ContainOpts = {
    background?: string; // "#000", "rgba(0,0,0,0)"
    alignX?: "center" | "left" | "right";
    alignY?: "center" | "top" | "bottom";
};

type Ctx2D = {
    drawImage: (...args: any[]) => void;
    fillRect: (x: number, y: number, w: number, h: number) => void;
    save: () => void;
    restore: () => void;
    fillStyle: any;
};

export function drawContain(
    ctx: Ctx2D,
    img: { width: number; height: number },
    W: number,
    H: number,
    opts: ContainOpts = {}
) {
    const iw = img.width;
    const ih = img.height;

    if (!iw || !ih) return;

    const {
        background,
        alignX = "center",
        alignY = "center",
    } = opts;

    // фон (опционально)
    if (background) {
        ctx.save();
        ctx.fillStyle = background;
        ctx.fillRect(0, 0, W, H);
        ctx.restore();
    }

    const scale = Math.min(W / iw, H / ih);
    const dw = iw * scale;
    const dh = ih * scale;

    let dx = 0;
    let dy = 0;

    if (alignX === "center") dx = (W - dw) / 2;
    else if (alignX === "right") dx = W - dw;

    if (alignY === "center") dy = (H - dh) / 2;
    else if (alignY === "bottom") dy = H - dh;

    ctx.drawImage(img as any, dx, dy, dw, dh);
}
