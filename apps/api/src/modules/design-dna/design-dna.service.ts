import type { DesignDNAInput, DesignDNAResult } from "./design-dna.types";
import { buildDesignPlan } from "./engine/buildDesignPlan";
import { compilePlanToOverlay } from "./engine/compilePlanToOverlay";

export async function generateDesignDNA(
  input: DesignDNAInput,
): Promise<DesignDNAResult> {
  const designPlan = buildDesignPlan(input);
  const overlayJson = compilePlanToOverlay(designPlan, input);

  return {
    compositionPattern: designPlan.pattern,
    designPlan,
    overlayJson,
  };
}