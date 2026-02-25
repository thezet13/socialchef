import { type FormatId } from "../../../modules/ai/types/ai.types";

export type StyleBehavior = {
  dishPlacement?: "AUTO" | "KEEP_ORIGINAL" | "USE_STYLE_CONTAINER";
  styleStrength?: "SUBTLE" | "BALANCED" | "STRONG";
  propsDetails?: "MINIMAL" | "PRESERVE_ORIGINAL" | "INSPIRED_BY_STYLE";
};

const FRAMING_BASE = `
Framing & Composition Constraints:
- Full subject framing (no crop): the entire dish must be fully visible inside the frame.
- Do not zoom in: keep the camera distance similar to the input; avoid close-up.
- Keep the dish perspective consistent with the input photo.

Framing Negative:
- No cropping or cut-off.
- No extreme close-up.
- No out-of-frame elements.
`.trim();

function formatFramingHint(format: FormatId): string {
  switch (format) {
    case "1_1":
      return `
Format hint (1:1):
- Keep balanced margins on all sides.
- Avoid making the dish too large; keep comfortable padding around it.
`.trim();

    case "2_3":
      return `
Format hint (2:3):
- Prioritize vertical safety margins (extra space above and below the dish).
- Keep the dish slightly smaller to avoid top/bottom cut.
`.trim();

    case "4_5":
      return `
Format hint (4:5):
- Add extra vertical breathing space above and below the dish.
- Keep the dish slightly smaller to prevent top/bottom cut.
`.trim();

    case "9_16":
      return `
Format hint (9:16):
- Keep the dish noticeably smaller with generous space above and below.
- Avoid placing key parts near the top or bottom edges.
- Preserve full dish visibility even if it reduces dish size.
`.trim();

    case "3_2":
      return `
Format hint (3:2):
- Prioritize horizontal safety margins (extra space on left and right).
- Keep the dish comfortably centered; avoid edge cut-offs.
`.trim();

    case "5_4":
      return `
Format hint (5:4):
- Maintain balanced margins, slightly prioritizing horizontal breathing space.
- Avoid oversized dish; keep comfortable padding.
`.trim();

    case "16_9":
      return `
Format hint (16:9):
- Keep the dish slightly smaller and centered, with ample space left/right.
- Maintain comfortable top/bottom padding too.
`.trim();

    default:
      return "";
  }
}

function behaviorBlock(b?: StyleBehavior) {
  const dishPlacement = b?.dishPlacement ?? "AUTO";
  const strength = b?.styleStrength ?? "BALANCED";
  const props = b?.propsDetails ?? "INSPIRED_BY_STYLE";

  const lines: string[] = [];

  lines.push(`BEHAVIOR CONTROLS (MUST FOLLOW):`);

  // Dish placement
  lines.push(`Dish placement: ${dishPlacement}`);
  if (dishPlacement === "KEEP_ORIGINAL") {
    lines.push(
      `- Keep the original plate/container from the BASE photo.`,
      `- Do NOT move the dish together with its plate into a different scene.`,
      `- The plate/container outline, size, position, and perspective must stay the same as the BASE.`,
      `- You may restyle materials/colors/texture of the plate/container to match the STYLE.`
    );
  } else if (dishPlacement === "USE_STYLE_CONTAINER") {
    lines.push(
      `- Use the container/surface from the STYLE reference (e.g. cast-iron pan, wooden board, bowl).`,
      `- The original plate/container from the BASE must NOT appear in the result.`,
      `- The dish itself must remain the same dish, but it should be presented on/in the STYLE container.`,
      `- Keep camera distance and general framing similar to the BASE; do not crop or zoom.`,
      `- Keep the dish fully visible; do not cut off any part of the dish.`
    );
  } else {
    lines.push(
      `- Choose the most natural container/surface for a commercial food photo.`,
      `- Prefer preserving the BASE framing and dish visibility.`,
      `- Avoid the mistake where the BASE plate is dragged into the STYLE scene if it looks wrong.`
    );
  }

  // Strength
  lines.push(``, `Style strength: ${strength}`);
  if (strength === "SUBTLE") {
    lines.push(
      `- Apply the STYLE mostly through lighting mood and color grading.`,
      `- Preserve the BASE composition strongly. Avoid heavy scene changes.`
    );
  } else if (strength === "STRONG") {
    lines.push(
      `- Strongly match the STYLE: lighting setup, mood, color grading, background feel, and tasteful details.`,
      `- The dish must remain recognizable as the same dish (do not change the type of food).`
    );
  } else {
    lines.push(
      `- Balanced: match lighting/colors and overall mood of the STYLE while preserving natural realism.`,
      `- Moderate scene adaptation is allowed if it improves style match without changing dish identity.`
    );
  }

  // Props
  lines.push(``, `Props & details: ${props}`);
  if (props === "MINIMAL") {
    lines.push(
      `- Keep the scene clean and minimal.`,
      `- Avoid adding extra props or clutter.`,
      `- If the STYLE has props, only hint them subtly (e.g. mild texture) without crowding.`
    );
  } else if (props === "PRESERVE_ORIGINAL") {
    lines.push(
      `- Preserve the BASE scene elements; do not introduce new props from the STYLE.`,
      `- Do not add new utensils or decorative objects.`,
      `- Only adjust lighting/color/materials to match the STYLE.`
    );
  } else {
    lines.push(
      `- You may add tasteful props/details inspired by the STYLE (if it improves realism).`,
      `- Keep props secondary; the dish remains the primary subject.`,
      `- Do not add hands/people or text/logos.`
    );
  }

  return lines.join("\n");
}

export function buildRestylePrompt(opts: {
  styleText: string;
  userDetails?: string;
  formatId: FormatId;
  behavior?: StyleBehavior; // ✅ NEW
}) {
  const userDetails = (opts.userDetails || "").trim();

  const dishPlacement = opts.behavior?.dishPlacement ?? "AUTO";

  const compositionRules =
    dishPlacement === "USE_STYLE_CONTAINER"
      ? `
COMPOSITION & FRAMING (ABSOLUTE RULES):
- Keep camera distance similar to the BASE image (no close-up).
- Do NOT crop the dish; keep the entire dish fully visible.
- Do NOT reframe dramatically; keep the dish placement natural and centered like the BASE.
- Do not zoom in or zoom out.
`.trim()
      : `
COMPOSITION & FRAMING (ABSOLUTE RULES):
- Keep the EXACT composition and framing of the BASE image.
- The output MUST be pixel-aligned with the BASE image.
- NO zoom-in, NO zoom-out.
- NO crop.
- NO reframe.
- NO change of camera distance.
- Preserve margins to the image edges EXACTLY as in the BASE.
- Do NOT tighten or loosen the crop.
`.trim();

  const containerRules =
    dishPlacement === "USE_STYLE_CONTAINER"
      ? `
FOOD CONTAINER / SERVING SURFACE (STRICT):
- Replace the BASE serving container with the STYLE serving container/surface if the STYLE clearly implies one.
  Examples: cast-iron pan, wooden board, paper wrap, tray, bowl, slate plate.
- The BASE plate/container must NOT remain visible.
- The dish itself must remain the same dish; do not change the type of food.
- Keep the dish fully visible and natural on/in the new container.
`.trim()
      : `
FOOD CONTAINER / SERVING SURFACE (STRICT):
- The dish may be placed on a serving surface or container (e.g. plate, board, paper, box, tray, bowl).
- Keep the exact outline, size, perspective, and visible boundaries of the serving surface from the BASE.
- You MAY change the color, material, texture, or finish of the serving surface to match the STYLE.
- Do NOT change the shape/geometry or position of the serving surface.
- The serving surface MUST remain pixel-aligned with the BASE.
`.trim();

  const core = `
You have TWO images:
1) BASE: the user's dish photo.
2) STYLE: the reference style image.

TASK:
Apply the VISUAL STYLE (lighting, color grading, mood, background feel) of STYLE to BASE.

STYLE IMAGE USAGE RULE:
- Use the STYLE image for STYLE/VIBE only.
- Do NOT copy camera angle, lens, framing, or crop from the STYLE.
- The BASE photo is the source of composition unless behavior says to adapt container.

IDENTITY (MUST KEEP):
- Same type of food
- Same ingredients and structure
- Realistic proportions and textures
- Do NOT change the dish into a different dish

STYLE TRANSFER (CRITICAL):
- Relight the dish to match the STYLE:
  direction, softness/hardness, highlight placement, shadow shape/density.
- Apply the STYLE color grading to the entire image:
  temperature, contrast, saturation.
- The dish MUST look relit and recolored according to the STYLE.
- If the STYLE is not visible enough, increase style strength on lighting + grading.

COMMERCIAL FOOD PHOTO REQUIREMENTS:
- Professional commercial food photography
- Realistic lighting and shadows
- Appetizing, natural textures
- No text, no logos, no watermarks
- No hands, no people, no faces

Apply this visual style (STRICT):
${opts.styleText}

${behaviorBlock(opts.behavior)}

${compositionRules}

${containerRules}

BACKGROUND:
- Match the background mood and atmosphere of the STYLE reference.
- Do NOT crop or expand the canvas.
- Keep full frame clean and professional.
- Add signature effects (e.g. smoke, sparks) ONLY if they are clearly present in the STYLE and they remain subtle.

FAILURE AVOIDANCE (MUST FOLLOW):
- Any change in crop/zoom that cuts off the dish is a FAILURE.
- The dish must remain fully visible.
- Do not invent text or logos.
`.trim();

  const detailsBlock = `
User details (optional):
${userDetails || "(none)"}
`.trim();

  return [core, FRAMING_BASE, formatFramingHint(opts.formatId), detailsBlock]
    .filter(Boolean)
    .join("\n\n");
}