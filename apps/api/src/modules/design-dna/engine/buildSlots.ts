import { PATTERN_DEFINITIONS } from "../patterns";
import type {
  CompositionPattern,
  DesignDNAInput,
  FormatKey,
  TextRoleKey,
  SlotSpec,
} from "../design-dna.types";

export function buildSlots(args: {
  pattern: CompositionPattern;
  format: FormatKey;
  input: DesignDNAInput;
}): Partial<Record<TextRoleKey, SlotSpec>> {
  const def = PATTERN_DEFINITIONS[args.pattern];
  return def.buildSlots({
    format: args.format,
    input: args.input,
  });
}