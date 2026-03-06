import type {
  CompositionPattern,
  FormatKey,
  PostType,
  StyleBehavior,
} from "./design-dna.types";

export const DEFAULT_FORMAT: FormatKey = "SQUARE";
export const DEFAULT_STYLE_BEHAVIOR: StyleBehavior = "AUTO";

export const SUPPORTED_PATTERNS: CompositionPattern[] = [
  "CENTER_STACK",
  "TOP_BADGE",
  "BOTTOM_CARD",
  "SIDE_STRIPE",
  "MINIMAL_CORNER",
];

export const PATTERN_BY_POST_TYPE: Record<PostType, CompositionPattern[]> = {
  PROMO: ["TOP_BADGE", "CENTER_STACK", "BOTTOM_CARD"],
  DISCOUNT: ["TOP_BADGE", "SIDE_STRIPE", "CENTER_STACK"],
  NEW_ITEM: ["CENTER_STACK", "MINIMAL_CORNER", "BOTTOM_CARD"],
  MENU: ["BOTTOM_CARD", "SIDE_STRIPE", "CENTER_STACK"],
  COMBO: ["SIDE_STRIPE", "BOTTOM_CARD", "TOP_BADGE"],
  ANNOUNCEMENT: ["MINIMAL_CORNER", "CENTER_STACK", "BOTTOM_CARD"],
};