import type {
  DesignDNAInput,
  DesignPlan,
  OverlayJson,
  OverlayShapeLayer,
  OverlayTextLayer,
  TextRoleKey
} from "../design-dna.types";

const TEXT_ROLE_ORDER: TextRoleKey[] = ["headline", "value", "subline", "fineprint"];

export function compilePlanToOverlay(
  plan: DesignPlan,
  input: DesignDNAInput,
): OverlayJson {
  const texts: OverlayTextLayer[] = [];
  const shapes: OverlayShapeLayer[] = [];
  const pics: OverlayJson["pics"] = [];

  for (const role of TEXT_ROLE_ORDER) {
    const slot = plan.slots[role];
    const text = input.texts[role as keyof typeof input.texts];

    if (!slot || !text?.trim()) continue;

    const readabilityRule = plan.readability.roles.find((r) => r.role === role);

    texts.push({
      role,
      text: text.trim(),
      rect: slot.rect,
      align: slot.align,
      plate:
        readabilityRule?.plate?.enabled && readabilityRule.plate
          ? {
              type: readabilityRule.plate.mode,
              opacity: readabilityRule.plate.opacity,
              padding: readabilityRule.plate.padding,
            }
          : undefined,
    });
  }

  if (plan.readability.needsGlobalGradient && plan.readability.gradientRect) {
    shapes.push({
      type: "gradient",
      rect: plan.readability.gradientRect,
      opacity: 0.45,
    });
  }

  for (const el of plan.decorativeStrategy.elements) {
    if (el.kind === "shape") {
      shapes.push({
        type: el.shapeType,
        rect: el.rect,
        rotation: el.rotation,
      });
    } else {
      pics.push({
        role: el.picRole,
        rect: el.rect,
        assetUrl: el.assetKey,
      });
    }
  }

  return { texts, shapes, pics };
}