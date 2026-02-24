import z from "zod";

export type AnalyzeStyleBody = {
  imageUrl: string;      // relative (/template-previews/x.png) or absolute
  hintTitle?: string;    // optional
};

export type AnalyzeStyleResponse = {
  prompt: string;
  title?: string;
  description?: string;
  creditsBalance?: number;
};

export type CreateStyleBody = {
  scope: "SYSTEM" | "TENANT";
  title: string;
  description?: string;
  previewUrl: string;
  sourceUrl?: string;
  prompt: string;
};

export type CreateStyleResponse = {
  id: string;
};

export type StyleListItem = {
  id: string;
  scope: "SYSTEM" | "TENANT";
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  title: string;
  thumbnailUrl: string;
  referenceImageUrl: string;
  prompt: string;
  updatedAt: string;
};

export type ListStylesResponse = {
  items: StyleListItem[];
  nextCursor: string | null;
  counts: { system: number; mine: number; all: number };
};


export const createBodySchema = z.object({
    scope: z.enum(["SYSTEM", "TENANT"]),
    title: z.string().min(1),
    description: z.string().min(1).optional(),
    previewUrl: z.string().min(1),
    sourceUrl: z.string().min(1).optional(),
    prompt: z.string().min(1),
});

export const analyzeBodySchema = z.object({
    imageUrl: z.string().min(1),
    hintTitle: z.string().min(1).optional(),
});

export const listQuerySchema = z.object({
    scope: z.enum(["SYSTEM", "TENANT", "ALL"]).optional(),
    status: z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]).optional(),
    q: z.string().min(1).optional(),
    take: z.coerce.number().int().min(1).max(200).optional(),
    skip: z.coerce.number().int().min(0).optional(),
});

export const listQueryLoadSchema = z.object({
    scope: z.enum(["SYSTEM", "TENANT", "ALL"]).optional().default("ALL"),
    status: z.enum(["PUBLISHED", "DRAFT"]).optional().default("PUBLISHED"),
    q: z.string().optional(),
    limit: z.coerce.number().int().min(1).max(50).optional().default(10),
    cursor: z.string().optional(), // format: <iso>|<id>
  });