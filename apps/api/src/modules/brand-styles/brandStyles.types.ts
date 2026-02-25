import z from "zod";


export type FontCategory = "sans" | "serif" | "display" | "script" | "mono";
export type FontRef = "primary" | "secondary";



export type UploadBrandStyleResponse = {
  imageUrl: string;
  thumbnailUrl: string;
  imageW: number;
  imageH: number;
  thumbW: number;
  thumbH: number;
};

export type AnalyzeBrandStyleBody = {
  imageUrl: string; // relative (/uploads/images/x.png) or absolute
  hintName?: string;
};

export type AnalyzeBrandStyleResponse = {
  name?: string;
  styleRecipeJson: unknown; // palette//effects/fonts refs
  fontMetaJson?: unknown; // raw ai meta + tags
  creditsBalance?: number;
};

export type CreateBrandStyleBody = {
  scope: "SYSTEM" | "TENANT";
  name: string;
  sourceImageUrl: string; // uploaded brand reference image
  sourceW?: number;
  sourceH?: number;
  thumbnailUrl?: string;
  styleRecipeJson: unknown;
  fontMetaJson?: unknown;
};

export type CreateBrandStyleResponse = {
  id: string;
};

export type BrandStyleListItem = {
  id: string;
  scope: "SYSTEM" | "TENANT";
  status: "ACTIVE" | "ARCHIVED";
  name: string;

  sourceImageUrl: string;
  thumbnailUrl: string;

  version: number;
  updatedAt: string;
};

export type ListBrandStylesResponse = {
  items: BrandStyleListItem[];
  nextCursor: number | null;
  counts?: { all: number; system: number; mine: number };
};


export type FontHint = {
  category: FontCategory;
  tags: string[];
  weightHints?: number[];
  uppercasePreferred?: boolean;
  contrast?: "low" | "medium" | "high";
  notes?: string;
};

export type NormalizedStyleRecipe = {
  name?: string;
  palette: {
    primary: string;
    secondary: string;
    accent: string;
    muted: string;
    textOnDark: string;
    textOnLight: string;
  };
  tokens: {
    headline: TokenBlock;
    value: TokenBlock;
    subline: TokenBlock;
    fineprint: TokenBlock;
  };
  fonts: {
    primary: { hint: FontHint } | { key: string; source: "whitelist" };
    secondary: { hint: FontHint } | { key: string; source: "whitelist" };
    extra: Array<{ hint: FontHint }>;
  };
};

export type TokenVariant = {
  // existing fields you use
  fontRef?: FontRef;
  weight?: number;
  italic?: boolean;
  textFillRole?: string;

  badge?: unknown;
  outline?: unknown;
  shadow?: unknown;

  // ✅ NEW (for resolver)
  fontCategory?: FontCategory;
  fontTags?: string[];
  uppercase?: boolean;
};

export type TokenBlock = {
  variants: TokenVariant[];
  sizeRangePx: { min: number; max: number };
  lineHeight: number;
};

export const analyzeBodySchema = z.object({
  imageUrl: z.string().min(1),
  hintName: z.string().min(1).optional(),
});

export const createBodySchema = z.object({
  scope: z.enum(["SYSTEM", "TENANT"]),
  name: z.string().min(1),
  sourceImageUrl: z.string().min(1),
  thumbnailUrl: z.string().optional(),
  sourceW: z.number().int().positive().optional(),
  sourceH: z.number().int().positive().optional(),
  styleRecipeJson: z.unknown(),
  fontMetaJson: z.unknown().optional(),
});

export const listQuerySchema = z.object({
  scope: z.enum(["SYSTEM", "TENANT", "ALL"]).optional(),
  status: z.enum(["ACTIVE", "ARCHIVED"]).optional(),
  q: z.string().min(1).optional(),
  take: z.coerce.number().int().min(1).max(200).optional(),
  skip: z.coerce.number().int().min(0).optional(),
});