import { z } from "zod";

export const BrandStickersTextsSchema = z.object({
  headline: z.string().min(1).max(40),
  subline: z.string().max(50).optional(),
  badge: z.string().max(12).optional(),
  fineprint: z.string().max(60).optional(),
});

export const BrandStickersGenerateRequestSchema = z.object({
  brandImageUrl: z.string().min(1).optional(),
  styleReferenceUrl: z.string().min(1).optional(),
  texts: BrandStickersTextsSchema,
});

export type BrandStickersGenerateRequest = z.infer<
  typeof BrandStickersGenerateRequestSchema
>;

export type BrandStickerSuggestedRole = "HEADLINE" | "BADGE" | "PRICE" | "CTA";

export const BrandStickerSchema = z.object({
  url: z.string().min(1),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  suggestedRole: z
    .enum(["HEADLINE", "BADGE", "PRICE", "CTA"])
    .optional(),
});

export const BrandStickersGenerateResponseSchema = z.object({
  stickers: z.array(BrandStickerSchema).min(1),
  creditsBalance: z.number().optional(),
});

export type BrandStickersGenerateResponse = z.infer<
  typeof BrandStickersGenerateResponseSchema
>;
