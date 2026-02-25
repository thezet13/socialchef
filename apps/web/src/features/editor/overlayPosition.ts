import type { OverlayAlign, OverlayPosition } from "../../features/editor/editor.types";

export type AlignValue = OverlayAlign;

export function getTopLeftFromAlign(
  canvasW: number,
  canvasH: number,
  w: number,
  h: number,
  pos: OverlayPosition
) {
  const align = (pos.align ?? "top-left") as AlignValue;

  const mTop = Number(pos.marginTop ?? 0);
  const mRight = Number(pos.marginRight ?? 0);
  const mBottom = Number(pos.marginBottom ?? 0);
  const mLeft = Number(pos.marginLeft ?? 0);

  let x = 0;
  let y = 0;

  // Horizontal
  if (align.endsWith("left")) {
    x = mLeft;
  } else if (align.endsWith("center")) {
    x = (canvasW - w) / 2 + (mLeft - mRight);
  } else {
    x = canvasW - w - mRight;
  }

  // Vertical
  if (align.startsWith("top")) {
    y = mTop;
  } else if (align.startsWith("middle")) {
    y = (canvasH - h) / 2 + (mTop - mBottom);
  } else {
    y = canvasH - h - mBottom;
  }

  return { x, y };
}

export function getCenterFromAlign(
  canvasW: number,
  canvasH: number,
  w: number,
  h: number,
  pos: OverlayPosition
) {
  const { x, y } = getTopLeftFromAlign(canvasW, canvasH, w, h, pos);
  return { cx: x + w / 2, cy: y + h / 2 };
}

export function centerToMargins(
  canvasW: number,
  canvasH: number,
  align: AlignValue,
  w: number,
  h: number,
  cx: number,
  cy: number
) {
  const x = cx - w / 2;
  const y = cy - h / 2;

  let marginLeft = 0, marginRight = 0, marginTop = 0, marginBottom = 0;

  // Horizontal
  if (align.endsWith("left")) {
    marginLeft = x;
    marginRight = 0;
  } else if (align.endsWith("center")) {
    const base = (canvasW - w) / 2;
    const delta = x - base; // = (mLeft - mRight)
    marginLeft = Math.max(delta, 0);
    marginRight = Math.max(-delta, 0);
  } else {
    marginRight = canvasW - w - x;
    marginLeft = 0;
  }

  // Vertical
  if (align.startsWith("top")) {
    marginTop = y;
    marginBottom = 0;
  } else if (align.startsWith("middle")) {
    const base = (canvasH - h) / 2;
    const delta = y - base; // = (mTop - mBottom)
    marginTop = Math.max(delta, 0);
    marginBottom = Math.max(-delta, 0);
  } else {
    marginBottom = canvasH - h - y;
    marginTop = 0;
  }

  return { marginLeft, marginRight, marginTop, marginBottom };
}

export function rotatedAabbSize(w: number, h: number, rotationDeg: number) {
  const t = (rotationDeg * Math.PI) / 180;
  const c = Math.abs(Math.cos(t));
  const s = Math.abs(Math.sin(t));
  return {
    bw: w * c + h * s,
    bh: w * s + h * c,
  };
}

