import type { PatternDefinition } from "./pattern.types";

export const topBadgePattern: PatternDefinition = {
  key: "TOP_BADGE",
  buildSlots: () => ({
    badge: {
      role: "badge",
      rect: { x: 0.68, y: 0.06, w: 0.22, h: 0.12 },
      align: "center",
      maxLines: 1,
      emphasis: "high",
    },
    headline: {
      role: "headline",
      rect: { x: 0.10, y: 0.28, w: 0.72, h: 0.16 },
      align: "left",
      maxLines: 2,
      emphasis: "high",
    },
    value: {
      role: "value",
      rect: { x: 0.10, y: 0.46, w: 0.45, h: 0.12 },
      align: "left",
      maxLines: 1,
      emphasis: "high",
    },
    subline: {
      role: "subline",
      rect: { x: 0.10, y: 0.60, w: 0.58, h: 0.09 },
      align: "left",
      maxLines: 2,
      emphasis: "medium",
    },
  }),
};