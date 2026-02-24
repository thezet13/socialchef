// apps/api/src/modules/ai/buildComboPrompt.ts

import { FormatId } from "../ai/types/ai.types";
import { ComboBgStrictness, ComboLayout } from "../ai/types/combo.types";

function formatHint(format: FormatId) {
  switch (format) {
    case "9_16":
      return `Format hint (9:16): keep generous top/bottom breathing space. Avoid placing key items near edges.`;
    case "16_9":
      return `Format hint (16:9): keep items balanced horizontally with comfortable left/right margins.`;
    default:
      return `Keep safe margins; do not crop any item.`;
  }
}

function layoutHint(layout: ComboLayout) {
  switch (layout) {
    case "ROW":
      return `Layout: Arrange items in a clean horizontal row (left-to-right). Keep equal spacing.`;
    case "GRID":
      return `Layout: Arrange items in a clean grid (2x2 if 4 items, otherwise balanced). Keep equal spacing.`;
    case "HERO_SIDES":
      return `Layout: Hero + sides. Make the 1st item the main hero, others smaller on the sides.`;
    default:
      return `Layout: Auto. Choose the most natural commercial combo composition.`;
  }
}

function strictnessHint(s: ComboBgStrictness) {
  return s === "STRICT"
    ? `Background strictness: Follow the STYLE reference closely (lighting, materials, background vibe).`
    : `Background strictness: You may be creative with the background while keeping the STYLE mood.`;
}

export function buildComboPrompt(opts: {
  styleText: string;
  userDetails?: string;
  formatId: FormatId;
  layout: ComboLayout;
  bgStrictness: ComboBgStrictness;
  itemCount: number;
}) {
  const userDetails = (opts.userDetails || "").trim();

  return `
You have MULTIPLE ITEM images (2..4) and ONE STYLE reference image.

TASK:
Create ONE clean commercial "combo" composition that includes ALL provided item images as separate items.
Apply the VISUAL STYLE (lighting, color grading, mood, background feel) from the STYLE reference.

ABSOLUTE RULES:
- Remove dish from reference image.
- Use ONLY the provided item images. Do NOT invent or add any extra products.
- Do NOT add any text, logos, brand marks, or price tags.
- Keep each item separate and clearly identifiable. Do NOT fuse, blend, or merge items into one.
- Do NOT change the type of food. Preserve each item’s identity.
- Do NOT crop any item. Every item must be fully visible inside the frame.
- No hands/people.

${layoutHint(opts.layout)}
${strictnessHint(opts.bgStrictness)}
${formatHint(opts.formatId)}

STYLE NOTES (optional):
${(opts.styleText || "").trim()}

USER NOTES (optional):
${userDetails || "(none)"}
`.trim();
}
