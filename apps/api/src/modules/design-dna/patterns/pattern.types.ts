import type {
  DesignDNAInput,
  FormatKey,
  HorizontalAlign,
  Rect,
  TextRoleKey,
  SlotSpec,
} from "../design-dna.types";

export type PatternContext = {
  format: FormatKey;
  input: DesignDNAInput;
};

export type PatternDefinition = {
  key: string;
  buildSlots: (ctx: PatternContext) => Partial<Record<TextRoleKey, SlotSpec>>;
};

export type SlotFactoryArgs = {
  role: TextRoleKey;
  rect: Rect;
  align: HorizontalAlign;
  maxLines?: number;
  emphasis?: "low" | "medium" | "high";
};