import { z } from "zod";

export const FontRoleSchema = z.enum(["headline", "value", "subline", "fineprint"]);
export type FontRole = z.infer<typeof FontRoleSchema>;

export const FontCategorySchema = z.enum(["sans", "serif", "display", "script", "mono"]);
export type FontCategory = z.infer<typeof FontCategorySchema>;

export const ResolvedFontSchema = z.object({
  role: FontRoleSchema,
  familyLabel: z.string(),
  isExact: z.boolean(),
  fontAssetId: z.string().optional(),
  matchedFontKey: z.string().optional(),
});

export type ResolvedFont = z.infer<typeof ResolvedFontSchema>;

export const ResolveFontsResponseSchema = z.object({
  brandStyleId: z.string(),
  resolved: z.array(ResolvedFontSchema),
});

export type ResolveFontsResponse = z.infer<typeof ResolveFontsResponseSchema>;

export const CycleFontRequestSchema = z.object({
  role: FontRoleSchema,
  direction: z.enum(["next", "prev"]).default("next"),
});

export type CycleFontRequest = z.infer<typeof CycleFontRequestSchema>;
