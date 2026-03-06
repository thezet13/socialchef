import type { PatternDefinition } from "./pattern.types";

export const sideStripePattern: PatternDefinition = {
  key: "SIDE_STRIPE",
  buildSlots: () => ({
    headline: {
      role: "headline",
      rect: { x: 0.08, y: 0.18, w: 0.30, h: 0.20 },
      align: "left",
      maxLines: 3,
      emphasis: "high",
    },
    value: {
      role: "value",
      rect: { x: 0.10, y: 0.42, w: 0.24, h: 0.12 },
      align: "left",
      maxLines: 1,
      emphasis: "high",
    },
    subline: {
      role: "subline",
      rect: { x: 0.08, y: 0.58, w: 0.28, h: 0.12 },
      align: "left",
      maxLines: 2,
      emphasis: "medium",
    },
    fineprint: {
      role: "fineprint",
      rect: { x: 0.08, y: 0.86, w: 0.28, h: 0.04 },
      align: "left",
      maxLines: 1,
      emphasis: "low",
    },
  }),
};