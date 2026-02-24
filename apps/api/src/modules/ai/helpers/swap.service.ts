import { BaseTransform } from "../types/ai.types";

export function parseBaseTransformApi(input: unknown): BaseTransform {
  const defaults: BaseTransform = { scale: 1, offsetX: 0, offsetY: 0, fitMode: "cover" };
  if (!input || typeof input !== "object") return defaults;

  const x = input as Record<string, unknown>;
  return {
    scale: typeof x.scale === "number" && Number.isFinite(x.scale) ? x.scale : defaults.scale,
    offsetX: typeof x.offsetX === "number" && Number.isFinite(x.offsetX) ? x.offsetX : defaults.offsetX,
    offsetY: typeof x.offsetY === "number" && Number.isFinite(x.offsetY) ? x.offsetY : defaults.offsetY,
    fitMode: x.fitMode === "contain" || x.fitMode === "cover" ? x.fitMode : defaults.fitMode,
  };
}



export function scaleTransformToOut(t: BaseTransform, sx: number, sy: number): BaseTransform {
  return {
    fitMode: t.fitMode,
    scale: t.scale,
    offsetX: (t.offsetX ?? 0) * sx,
    offsetY: (t.offsetY ?? 0) * sy,
  };
}