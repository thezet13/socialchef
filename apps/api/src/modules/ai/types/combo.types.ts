import { FormatId } from "./ai.types";

export type ComboLayout = "AUTO" | "ROW" | "GRID" | "HERO_SIDES";
export type ComboBgStrictness = "STRICT" | "CREATIVE";

export type ComboGpt15Body = {
  proDesignId: string;
  styleId: string;
  mode?: "preview"; // только preview
  formatId?: FormatId;

  // 2..4 фото (relative like "/uploads/images/xxx.png")
  items: { imageUrl: string }[];

  layout?: ComboLayout;
  bgStrictness?: ComboBgStrictness;

  prompt?: string;

  width?: number;
  height?: number;
  quality?: "low" | "auto";
};