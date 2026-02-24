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
