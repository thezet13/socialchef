import type { PatternDefinition } from "./pattern.types";

export const minimalCornerPattern: PatternDefinition = {
  key: "MINIMAL_CORNER",
  buildSlots: () => ({
    headline: {
      role: "headline",
      rect: { x: 0.08, y: 0.76, w: 0.54, h: 0.10 },
      align: "left",
      maxLines: 2,
      emphasis: "high",
    },
    value: {
      role: "value",
      rect: { x: 0.68, y: 0.08, w: 0.20, h: 0.10 },
      align: "right",
      maxLines: 1,
      emphasis: "high",
    },
    subline: {
      role: "subline",
      rect: { x: 0.08, y: 0.88, w: 0.46, h: 0.04 },
      align: "left",
      maxLines: 1,
      emphasis: "medium",
    },
  }),
};