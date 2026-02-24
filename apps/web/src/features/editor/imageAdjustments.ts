import { DEFAULT_IMAGE_ADJUSTMENTS, type ImageAdjustments } from "./editor.constants";

/**
 * Parse ImageAdjustments from unknown JSON (Preset / ProDesign / API).
 * Always returns a full object (never undefined fields), using defaults.
 */
export function parseImageAdjustments(input: unknown): ImageAdjustments {
  const d = DEFAULT_IMAGE_ADJUSTMENTS;

  if (!input || typeof input !== "object") return d;
  const x = input as Record<string, unknown>;

  const num = (k: keyof ImageAdjustments) =>
    typeof x[k as string] === "number" && Number.isFinite(x[k as string] as number)
      ? (x[k as string] as number)
      : (d[k] as number);

  return {
    brightness: num("brightness"),
    contrast: num("contrast"),
    saturation: num("saturation"),
    vibrance: num("vibrance"),
    highlights: num("highlights"),
    shadows: num("shadows"),
    temperature: num("temperature"),
    tint: num("tint"),
    sharpness: num("sharpness"),
    clarity: num("clarity"),
    texture: num("texture"),
    vignette: num("vignette"),
    grain: num("grain"),
  };
}
