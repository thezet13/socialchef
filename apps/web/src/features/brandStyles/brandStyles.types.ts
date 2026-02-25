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