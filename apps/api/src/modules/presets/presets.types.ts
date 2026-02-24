import z from "zod";
import type {
  OverlayTextConfig,
  OverlayPicConfig,
  OverlayRectConfig,
} from "../ai/types/ai.types";
import { Prisma } from "@prisma/client";

export type ImageAdjustments = {
  brightness?: number;
  contrast?: number;
  saturation?: number;
  vibrance?: number;
  highlights?: number;
  shadows?: number;
  temperature?: number;
  tint?: number;
  sharpness?: number;
  clarity?: number;
  texture?: number;
  vignette?: number;
  grain?: number;
};

export type PresetOverlay = {
  texts?: OverlayTextConfig[];
  pics?: OverlayPicConfig[];
  rects?: OverlayRectConfig[];
  meta?: { version?: number };
};

export type PresetListDto = {
  id: string;
  scope: "SYSTEM" | "TENANT";
  access: "FREE" | "EDITOR" | "PRO" | "PRO_PLUS";
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";

  title: string;
  subtitle: string | null;
  tags: string[];
  sortOrder: number;

  format: string;
  style: string | null;

  thumbnailUrl: string;
  thumbnailW: number | null;
  thumbnailH: number | null;

  updatedAt: string;

  baseImageUrl: string,
  baseWidth: number | null;
  baseHeight: number | null;
  baseTransformJson: unknown | null,
  imageAdjustmentsJson: ImageAdjustments | null;

  backgroundImageUrl: string | null;
  backgroundTransformJson: unknown | null;

  foregroundImageUrl: string | null;
  foregroundTransformJson: unknown | null;

  swapDishEnabled: boolean;
  dishType: string | null;
};

export type PresetDetailDto = PresetListDto & {
  prompt: string;
  overlay: PresetOverlay;
};

export type PresetCreateBody = {
  title: string;
  subtitle?: string | null;
  tags?: string[];
  sortOrder?: number;

  format: string;
  prompt: string;
  style?: string | null;

  thumbnailUrl?: string;
  thumbnailW?: number | null;
  thumbnailH?: number | null;

  baseImageUrl?: string;
  baseWidth?: number | null;
  baseHeight?: number | null;
  baseTransformJson?: unknown | null;

  imageAdjustmentsJson?: ImageAdjustments | null;

  backgroundImageUrl?: string | null;
  backgroundTransformJson?: unknown | null;

  foregroundImageUrl?: string | null;
  foregroundTransformJson?: unknown | null;

  swapDishEnabled?: boolean;
  dishType?: string | null;

  overlay: {
    texts?: OverlayTextConfig[];
    pics?: OverlayPicConfig[];
    rects?: OverlayRectConfig[];
    meta?: { version?: number };
  };

  access?: "FREE" | "EDITOR" | "PRO" | "PRO_PLUS";
  status?: "DRAFT" | "PUBLISHED" | "ARCHIVED";
};


export type PresetForCleanup = Prisma.PresetGetPayload<{
  select: {
    id: true;
    tenantId: true;
    scope: true;
    thumbnailUrl: true;
    baseImageUrl: true;
    backgroundImageUrl: true;
    foregroundImageUrl: true;
    overlay: true; // или overlayJson — как в схеме
  };
}>;

export type PresetsListResponse = {
  items: Array<{
    id: string;
    title: string | null;
    scope: "SYSTEM" | "TENANT";
    format: string;
    thumbnailUrl: string;
    createdAt: string;
  }>;
  nextCursor: string | null;
};


export const listQuerySchema = z.object({
  format: z.string().min(1).optional(),
  scope: z.enum(["SYSTEM", "TENANT"]).optional(),
  access: z.enum(["FREE", "EDITOR", "PRO", "PRO_PLUS"]).optional(),
  status: z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]).optional(),
  q: z.string().min(1).optional(),
  take: z.coerce.number().int().min(1).max(50).optional(),
  cursor: z.string().min(1).optional(),
  skip: z.coerce.number().int().min(0).optional(),
  swapDishEnabled: z.coerce.boolean().optional(),
  dishType: z.string().min(1).optional(),

});

export const overlaySchema = z.unknown().refine(
  (v: unknown) => typeof v === "object" && v !== null,
  "overlay must be an object"
);

const zOptTrimmed = z
  .union([z.string(), z.null(), z.undefined()])
  .transform((v) => {
    if (typeof v !== "string") return null;
    const s = v.trim();
    return s.length ? s : null;
  });

export const createBodySchema = z.object({
  title: z.string().min(1),
  subtitle: z.string().optional().nullable(),
  tags: z.array(z.string()).optional(),
  sortOrder: z.number().int().optional(),

  imageOrigin: z.enum(["AI", "UPLOAD"]).optional(),

  format: z.string().min(1),
  prompt: z.string().trim().optional(),
  style: z.string().optional().nullable(),

  thumbnailUrl: zOptTrimmed,
  thumbnailW: z.number().int().optional().nullable(),
  thumbnailH: z.number().int().optional().nullable(),

  baseImageUrl: zOptTrimmed,

  baseWidth: z.number().int().optional().nullable(),
  baseHeight: z.number().int().optional().nullable(),
  baseTransformJson: z.unknown().optional().nullable(),
  imageAdjustmentsJson: z.unknown().optional().nullable(),

  backgroundImageUrl: zOptTrimmed,
  backgroundTransformJson: z.unknown().optional().nullable(),

  foregroundImageUrl: zOptTrimmed,
  foregroundTransformJson: z.unknown().optional().nullable(),

  swapDishEnabled: z.boolean().optional(),
  dishType: z.string().optional().nullable(),

  overlay: overlaySchema,

  scope: z.enum(["TENANT", "SYSTEM"]).optional(),

  access: z.enum(["FREE", "EDITOR", "PRO", "PRO_PLUS"]).optional(),
  status: z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]).optional(),
}).superRefine((data, ctx) => {
  const origin = data.imageOrigin ?? "AI";
  const hasPrompt = !!(data.prompt ?? "").trim();

  const hasBase =
    !!(data.backgroundImageUrl && data.backgroundImageUrl.trim()) ||
    !!(data.baseImageUrl && data.baseImageUrl.trim());

  if (origin === "AI" && hasBase && !hasPrompt) {
    ctx.addIssue({
      code: "custom",
      path: ["prompt"],
      message: "Prompt is required for AI presets",
    });
  }
});


export const applyPresetBodySchema = z.object({
  presetId: z.string().min(1),
  overlayMode: z.enum(["REPLACE", "MERGE"]),
  imageMode: z.enum(["KEEP", "REPLACE"]),
  zOffset: z.number().int().min(0).optional(),
});

export const patchBodySchema = createBodySchema.partial();
