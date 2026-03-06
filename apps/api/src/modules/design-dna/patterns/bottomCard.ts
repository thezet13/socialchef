import type { PatternDefinition } from "./pattern.types";

export const bottomCardPattern: PatternDefinition = {
  key: "BOTTOM_CARD",
  buildSlots: () => ({
    headline: {
      role: "headline",
      rect: { x: 0.08, y: 0.62, w: 0.64, h: 0.12 },
      align: "left",
      maxLines: 2,
      emphasis: "high",
    },
    value: {
      role: "value",
      rect: { x: 0.74, y: 0.62, w: 0.18, h: 0.10 },
      align: "center",
      maxLines: 1,
      emphasis: "high",
    },
    subline: {
      role: "subline",
      rect: { x: 0.08, y: 0.75, w: 0.60, h: 0.08 },
      align: "left",
      maxLines: 2,
      emphasis: "medium",
    },
    fineprint: {
      role: "fineprint",
      rect: { x: 0.08, y: 0.86, w: 0.50, h: 0.04 },
      align: "left",
      maxLines: 1,
      emphasis: "low",
    },
  }),
};