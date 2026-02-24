import { z } from "zod";

/** 4 элемента MVP */
export const BrandElementRoleSchema = z.enum([
  "DISCOUNT_TITLE",
  "DISCOUNT_VALUE",
  "PRICE",
  "CTA",
]);

export type ElementOverrides = {
  badgeEnabled?: boolean;                 // true/false
  badgeFillRole?: string;                 // palette key: "accent"|"primary"|"secondary"|...
  textFillRole?: string;                  // palette key
  borderStyle?: "none" | "solid" | "dashed" | "dotted";
  borderColorRole?: string;               // palette key
  borderWidthPx?: number;                 // 0..10 (по желанию)
};

export type BrandElementRole = z.infer<typeof BrandElementRoleSchema>;

export const BadgeShapeSchema = z.enum(["none", "pill", "rect", "circle", "burst"]);
export type BadgeShape = z.infer<typeof BadgeShapeSchema>;

export const PaletteKeySchema = z.enum([
  "auto",
  "primary",
  "secondary",
  "supported1",
  "supported2",
  "supported3",
  "custom",
]);
export type PaletteKey = z.infer<typeof PaletteKeySchema>;

/** Небольшой рецепт варианта элемента (рандомится по seed) */
export const ElementVariantRecipeSchema = z.object({
  badgeShape: BadgeShapeSchema,               // none/pill/...
  badgeFill: PaletteKeySchema,                // primary/secondary/supported/custom
  badgeOpacity: z.number().min(0).max(1),
  textFill: PaletteKeySchema,                 // auto/primary/...
  outline: z.boolean(),
  shadow: z.boolean(),
  paddingPct: z.number().min(0).max(0.4),     // padding вокруг текста внутри плашки
  tiltDeg: z.number().min(-15).max(15),       // легкая вариативность
  letterSpacingPct: z.number().min(-0.1).max(0.2),
});
export type ElementVariantRecipe = z.infer<typeof ElementVariantRecipeSchema>;

export const ElementPreviewSpecSchema = z.object({
  role: BrandElementRoleSchema,
  text: z.string().min(1).max(50),
  seed: z.number().int(),
  recipe: ElementVariantRecipeSchema,
  /** ключ, по которому бэк сможет отдать PNG preview */
  previewKey: z.string().min(16),
  /** url для img src (preview endpoint) */
  previewUrl: z.string().min(1),
  /** примерные размеры (после render) */
  width: z.number().int().positive(),
  height: z.number().int().positive(),
});
export type ElementPreviewSpec = z.infer<typeof ElementPreviewSpecSchema>;

export const ElementOverridesSchema = z.object({
  badgeEnabled: z.boolean().optional(),
  badgeFillRole: z.string().min(1).optional(),
  textFillRole: z.string().min(1).optional(),
  borderStyle: z.enum(["none", "solid", "dashed", "dotted"]).optional(),
  borderColorRole: z.string().min(1).optional(),
  borderWidthPx: z.number().int().min(0).max(10).optional(),
}).strict();

const TextsSchema = z.object({
  DISCOUNT_TITLE: z.string().trim().min(1).max(50),
  DISCOUNT_VALUE: z.string().trim().min(1).max(50),
  PRICE: z.string().trim().min(1).max(50),
  CTA: z.string().trim().min(1).max(50),
})
  .partial()
  .refine((v) => Object.values(v).some((s) => typeof s === "string" && s.trim().length > 0), {
    message: "texts must contain at least one non-empty value",
  });

const OverridesByRoleSchema = z.object({
  DISCOUNT_TITLE: ElementOverridesSchema,
  DISCOUNT_VALUE: ElementOverridesSchema,
  PRICE: ElementOverridesSchema,
  CTA: ElementOverridesSchema,
}).partial();

export const GenerateElementsRequestSchema = z.object({
  brandStyleId: z.string().min(5),
  texts: TextsSchema,
  /** если передать role, то регенерим только один элемент */
  onlyRole: BrandElementRoleSchema.optional(),
  /** seed базовый, если нет — сервер сам */
  seed: z.number().int().optional(),
  overridesByRole: OverridesByRoleSchema.optional(),
});
export type GenerateElementsRequest = z.infer<typeof GenerateElementsRequestSchema>;

export const GenerateElementsResponseSchema = z.object({
  elements: z.array(ElementPreviewSpecSchema),
  seedBase: z.number().int(),
});
export type GenerateElementsResponse = z.infer<typeof GenerateElementsResponseSchema>;

export const CommitElementRequestSchema = z.object({
  brandStyleId: z.string().min(5),
  role: BrandElementRoleSchema,
  text: z.string().min(1).max(50),
  seed: z.number().int(),
  recipe: ElementVariantRecipeSchema,
  overrides: ElementOverridesSchema.optional(),
});
export type CommitElementRequest = z.infer<typeof CommitElementRequestSchema>;

export const CommitElementResponseSchema = z.object({
  assetId: z.string().min(5),
  relativeUrl: z.string().min(1), // /uploads/brand-stickers/...
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  role: BrandElementRoleSchema,
});
export type CommitElementResponse = z.infer<typeof CommitElementResponseSchema>;

/** Layout recipes — берем из БД, но на фронте используем так */
export const LayoutSlotSchema = z.object({
  key: z.string().min(1),
  role: BrandElementRoleSchema,
  /** нормализованные координаты 0..1 */
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  w: z.number().min(0).max(1),
  h: z.number().min(0).max(1),
  /** угол наклона слота (не текста) */
  rotateDeg: z.number().min(-45).max(45).default(0),
  /** clamp внутри канваса на фронте */
});
export type LayoutSlot = z.infer<typeof LayoutSlotSchema>;

export const LayoutRecipeSchema = z.object({
  id: z.string().min(5),
  title: z.string().min(1),
  slots: z.array(LayoutSlotSchema).min(1),
});
export type LayoutRecipe = z.infer<typeof LayoutRecipeSchema>;

export const LayoutPreviewRequestSchema = z.object({
  brandStyleId: z.string().min(5),
  /** layout recipes IDs, которые хотим показать */
  layoutIds: z.array(z.string().min(5)).min(1),
  /** current preview elements */
  elements: z.array(ElementPreviewSpecSchema).min(1),
  layoutSeed: z.number().int().optional(),
  previewMaxW: z.number().int().positive().default(480),
});
export type LayoutPreviewRequest = z.infer<typeof LayoutPreviewRequestSchema>;

export const LayoutPreviewItemSchema = z.object({
  layoutId: z.string().min(5),
  previewKey: z.string().min(16),
  previewUrl: z.string().min(1),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
});
export type LayoutPreviewItem = z.infer<typeof LayoutPreviewItemSchema>;

export const LayoutPreviewResponseSchema = z.object({
  items: z.array(LayoutPreviewItemSchema),
  layoutSeed: z.number().int(),
});
export type LayoutPreviewResponse = z.infer<typeof LayoutPreviewResponseSchema>;

/** Apply Layout: добавляем в editor как overlay pics */
export const ApplyLayoutRequestSchema = z.object({
  brandStyleId: z.string().min(5),
  layoutId: z.string().min(5),
  /** элементы: можно передать committedUrl если уже есть, иначе seed+recipe */
  elements: z.array(
    z.object({
      role: BrandElementRoleSchema,
      text: z.string().min(1).max(50),
      committedRelativeUrl: z.string().optional(),
      seed: z.number().int().optional(),
      recipe: ElementVariantRecipeSchema.optional(),
    })
  ).min(1),
  /** размер канваса редактора (куда вставляем) */
  editorW: z.number().int().positive(),
  editorH: z.number().int().positive(),
});
export type ApplyLayoutRequest = z.infer<typeof ApplyLayoutRequestSchema>;

export const ApplyLayoutResponseSchema = z.object({
  /** overlay.pics[] ready to merge into editor */
  pics: z.array(z.object({
    id: z.string().min(6),
    url: z.string().min(1),
    x: z.number(),
    y: z.number(),
    w: z.number(),
    h: z.number(),
    rotate: z.number().default(0),
    bakeLayer: z.enum(["FRONT", "BAKED"]).default("FRONT"),
    role: BrandElementRoleSchema.optional(),
  })),
  /** какие assets были закоммичены по ходу */
  committed: z.array(CommitElementResponseSchema),
});
export type ApplyLayoutResponse = z.infer<typeof ApplyLayoutResponseSchema>;
