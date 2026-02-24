import * as React from "react";

// --- Layer transform types (frontend-only) ---
export type FitMode = "cover" | "contain";

export type LayerTransform = {
  scale: number;     // 1 = 100%
  offsetX: number;   // px
  offsetY: number;   // px
  fitMode: FitMode;  // cover/contain
};

export const DEFAULT_LAYER_TRANSFORM: LayerTransform = {
  scale: 1,
  offsetX: 0,
  offsetY: 0,
  fitMode: "cover",
};

// If you already have parse helpers, keep yours.
// This one is safe: accepts unknown and returns defaults on invalid input.
export function parseLayerTransform(raw: unknown): LayerTransform {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_LAYER_TRANSFORM };

  const r = raw as Partial<Record<keyof LayerTransform, unknown>>;

  const scale =
    typeof r.scale === "number" && Number.isFinite(r.scale) && r.scale > 0 ? r.scale : DEFAULT_LAYER_TRANSFORM.scale;

  const offsetX =
    typeof r.offsetX === "number" && Number.isFinite(r.offsetX) ? r.offsetX : DEFAULT_LAYER_TRANSFORM.offsetX;

  const offsetY =
    typeof r.offsetY === "number" && Number.isFinite(r.offsetY) ? r.offsetY : DEFAULT_LAYER_TRANSFORM.offsetY;

  const fitMode = r.fitMode === "contain" || r.fitMode === "cover" ? r.fitMode : DEFAULT_LAYER_TRANSFORM.fitMode;

  return { scale, offsetX, offsetY, fitMode };
}


