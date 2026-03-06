import { DEFAULT_STYLE_BEHAVIOR, PATTERN_BY_POST_TYPE } from "../design-dna.constants";
import type {
  CompositionPattern,
  DesignDNAInput,
  StyleBehavior,
} from "../design-dna.types";

export function selectPattern(input: DesignDNAInput): CompositionPattern {
  const styleBehavior: StyleBehavior =
    input.styleBehavior ?? DEFAULT_STYLE_BEHAVIOR;

  const candidates = PATTERN_BY_POST_TYPE[input.postType];

  if (styleBehavior === "MINIMAL") {
    if (candidates.includes("MINIMAL_CORNER")) return "MINIMAL_CORNER";
  }

  if (styleBehavior === "BOLD_PROMO") {
    if (candidates.includes("TOP_BADGE")) return "TOP_BADGE";
  }

  return candidates[0];
}