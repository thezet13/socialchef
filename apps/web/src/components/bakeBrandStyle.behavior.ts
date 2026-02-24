export type BrandControlMode = "BRAND_ACCURATE" | "BRAND_GUIDED" | "CREATIVE_INTERPRETATION";
export type ColorLogicMode = "PALETTE_LOCKED" | "PALETTE_HARMONIZED" | "MOOD_BASED";
export type ShapeStyleMode = "NONE" | "STRUCTURAL" | "BRAND_DERIVED" | "EXPRESSIVE";
export type LayoutDisciplineMode = "LAYOUT_LOCKED" | "LAYOUT_AWARE";
export type typographyEffectsMode = "STRICT" | "BRAND_LED" | "DYNAMIC";

export type BakeBehavior = {
  brandControl: BrandControlMode;
  colorLogic: ColorLogicMode;
  shapeStyle: ShapeStyleMode;
  layoutDiscipline: LayoutDisciplineMode;
  typographyEffects: typographyEffectsMode;
  designNote?: string; // optional user note (<= 300)
};

export const defaultBakeBehavior: BakeBehavior = {
  brandControl: "BRAND_GUIDED",
  colorLogic: "PALETTE_HARMONIZED",
  shapeStyle: "BRAND_DERIVED",
  layoutDiscipline: "LAYOUT_LOCKED",
  typographyEffects: "BRAND_LED",
  designNote: "",
};
