import { DEFAULT_FORMAT } from "../design-dna.constants";
import type { DesignDNAInput, DesignPlan } from "../design-dna.types";
import { buildDecorativeStrategy } from "./buildDecorativeStrategy";
import { buildReadabilityPlan } from "./buildReadabilityPlan";
import { buildSlots } from "./buildSlots";
import { selectPattern } from "./selectPattern";

export function buildDesignPlan(input: DesignDNAInput): DesignPlan {
  const format = input.format ?? DEFAULT_FORMAT;
  const pattern = selectPattern(input);
  const slots = buildSlots({ pattern, format, input });
  const readability = buildReadabilityPlan(input);
  const decorativeStrategy = buildDecorativeStrategy(input);

  return {
    pattern,
    format,
    slots,
    readability,
    decorativeStrategy,
    debug: {
      reasons: [
        `postType=${input.postType}`,
        `styleBehavior=${input.styleBehavior ?? "AUTO"}`,
        `pattern=${pattern}`,
      ],
    },
  };
}