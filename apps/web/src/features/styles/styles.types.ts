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
};