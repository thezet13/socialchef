import type {
  DesignDNAInput,
  ReadabilityPlan,
  TextRoleKey,
} from "../design-dna.types";

const TEXT_ROLES: TextRoleKey[] = ["headline", "value", "subline", "fineprint"];

export function buildReadabilityPlan(input: DesignDNAInput): ReadabilityPlan {
  const brightness = input.imageAnalysis?.brightness ?? 0.5;
  const contrast = input.imageAnalysis?.contrast ?? 0.5;
  const busyAreas = input.imageAnalysis?.busyAreas ?? [];

  const lowContrast = contrast < 0.35;
  const brightImage = brightness > 0.72;
  const busy = busyAreas.length > 0;

  return {
    needsGlobalGradient: lowContrast || brightImage,
    gradientRect: lowContrast || brightImage
      ? { x: 0, y: 0.55, w: 1, h: 0.45 }
      : undefined,
    roles: TEXT_ROLES.map((role) => ({
      role,
      plate: busy
        ? {
            enabled: true,
            mode: "solid",
            opacity: 0.35,
            padding: 0.018,
          }
        : undefined,
      shadow: !busy,
      stroke: false,
    })),
  };
}