import type { CompositionPattern } from "../design-dna.types";
import type { PatternDefinition } from "./pattern.types";
import { centerStackPattern } from "./centerStack";
import { topBadgePattern } from "./topBadge";
import { bottomCardPattern } from "./bottomCard";
import { sideStripePattern } from "./sideStripe";
import { minimalCornerPattern } from "./minimalCorner";

export const PATTERN_DEFINITIONS: Record<CompositionPattern, PatternDefinition> =
  {
    CENTER_STACK: centerStackPattern,
    TOP_BADGE: topBadgePattern,
    BOTTOM_CARD: bottomCardPattern,
    SIDE_STRIPE: sideStripePattern,
    MINIMAL_CORNER: minimalCornerPattern,
  };