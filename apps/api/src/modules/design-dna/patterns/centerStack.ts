import type { PatternDefinition } from "./pattern.types";

export const centerStackPattern: PatternDefinition = {
  key: "CENTER_STACK",
  buildSlots: () => ({
    headline: {
      role: "headline",
      rect: { x: 0.12, y: 0.22, w: 0.76, h: 0.16 },
      align: "center",
      maxLines: 2,
      emphasis: "high",
    },
    value: {
      role: "value",
      rect: { x: 0.22, y: 0.40, w: 0.56, h: 0.14 },
      align: "center",
      maxLines: 1,
      emphasis: "high",
    },
    subline: {
      role: "subline",
      rect: { x: 0.14, y: 0.56, w: 0.72, h: 0.10 },
      align: "center",
      maxLines: 2,
      emphasis: "medium",
    },
    fineprint: {
      role: "fineprint",
      rect: { x: 0.20, y: 0.82, w: 0.60, h: 0.05 },
      align: "center",
      maxLines: 1,
      emphasis: "low",
    },
  }),
};