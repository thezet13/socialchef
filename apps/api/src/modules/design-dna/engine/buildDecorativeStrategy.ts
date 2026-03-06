import type {
  DecorativeStrategy,
  DesignDNAInput,
} from "../design-dna.types";

export function buildDecorativeStrategy(
  input: DesignDNAInput,
): DecorativeStrategy {
  if (input.styleBehavior === "PREMIUM") {
    return {
      pack: "PREMIUM_FRAME",
      intensity: "low",
      elements: [
        {
          kind: "shape",
          shapeType: "frame",
          rect: { x: 0.04, y: 0.04, w: 0.92, h: 0.92 },
        },
      ],
    };
  }

  if (input.postType === "PROMO" || input.postType === "DISCOUNT") {
    return {
      pack: "PROMO_BURST",
      intensity: "medium",
      elements: [
        {
          kind: "shape",
          shapeType: "burst",
          rect: { x: 0.68, y: 0.05, w: 0.24, h: 0.24 },
          rotation: -8,
        },
      ],
    };
  }

  return {
    pack: "NONE",
    intensity: "low",
    elements: [],
  };
}