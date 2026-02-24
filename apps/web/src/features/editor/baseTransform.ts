export type FitMode = "cover" | "contain";

export type BaseTransform = {
  scale: number;
  offsetX: number;
  offsetY: number;
  fitMode: FitMode;
};

export function parseBaseTransform(input: unknown): BaseTransform {
  const defaults: BaseTransform = {
    scale: 1,
    offsetX: 0,
    offsetY: 0,
    fitMode: "cover",
  };

  if (!input || typeof input !== "object") return defaults;

  const x = input as Record<string, unknown>;

  return {
    scale:
      typeof x.scale === "number" && Number.isFinite(x.scale)
        ? x.scale
        : defaults.scale,

    offsetX:
      typeof x.offsetX === "number" && Number.isFinite(x.offsetX)
        ? x.offsetX
        : defaults.offsetX,

    offsetY:
      typeof x.offsetY === "number" && Number.isFinite(x.offsetY)
        ? x.offsetY
        : defaults.offsetY,

    fitMode:
      x.fitMode === "contain" || x.fitMode === "cover"
        ? x.fitMode
        : defaults.fitMode,
  };
}
