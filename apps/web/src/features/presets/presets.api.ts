import { apiFetch } from "@/lib/apiClient";
import type { AppliedPresetDesign, EditorPreset } from "@/features/presets/preset.editor.types";

export type PresetScope = "SYSTEM" | "TENANT";

export type PresetListItemDto = {
  id: string;
  name: string;
  title: string;
  subtitle: string | null;
  thumbnailUrl: string;
  format: string;
  access: "FREE" | "EDITOR" | "PRO" | "PRO_PLUS";
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";

  backgroundImageUrl: string;
  backgroundTransformJson: unknown | null;

  foregroundImageUrl: string | null;
  foregroundTransformJson: unknown | null;

  swapDishEnabled: boolean;
  dishType: string | null;

  scope: PresetScope;

  presetsCursor: string | null,
};

export type PresetsListResponse = {
  items: PresetListItemDto[];
  nextCursor: string | null;
  counts: { system: number; mine: number; all: number };
};

export async function applyPresetToDesign(
  proDesignId: string,
  presetId: string
) {
  return apiFetch<AppliedPresetDesign>(`/presets/${proDesignId}/apply-preset`, {
    method: "POST",
    body: { presetId },
  });
}

export async function applyPresetToEditor(
  proDesignId: string,
  presetId: string
) {
  return apiFetch<AppliedPresetDesign>(`/presets/${proDesignId}/apply-preset`, {
    method: "POST",
    body: { presetId },
  });
}


export async function listPresets(
  params?: {
    take?: number;
    cursor?: string | null;
    format?: string;
    scope?: PresetScope;
    access?: "FREE" | "EDITOR" | "PRO" | "PRO_PLUS";
    status?: "DRAFT" | "PUBLISHED" | "ARCHIVED";
    q?: string;
    swapDishEnabled?: boolean;
    dishType?: string;
  }
) {
  const qs = new URLSearchParams();

  if (params?.take) qs.set("take", String(params.take));
  if (params?.cursor) qs.set("cursor", params.cursor);

  if (params?.format) qs.set("format", params.format);
  if (params?.scope) qs.set("scope", params.scope);
  if (params?.access) qs.set("access", params.access);
  if (params?.status) qs.set("status", params.status);
  if (params?.q) qs.set("q", params.q);

  if (typeof params?.swapDishEnabled === "boolean") {
    qs.set("swapDishEnabled", String(params.swapDishEnabled));
  }
  if (params?.dishType) qs.set("dishType", params.dishType);

  const path = qs.toString() ? `/presets/list?${qs.toString()}` : "/presets/list";

  return apiFetch<PresetsListResponse>(path);
}


export async function getPreset(id: string) {
  return apiFetch<EditorPreset>(`/presets/${id}`);
}

export async function createPreset(
  body: unknown
): Promise<PresetListItemDto> {
  return apiFetch<PresetListItemDto>("/presets", {
    method: "POST",
    body,
  });
}

export async function renderPresetThumbnail(presetId: string) {
  // endpoint — как мы договоримся на бэке:
  // POST /presets/:id/render-thumbnail
  return apiFetch<{ thumbnailUrl: string }>(`/presets/${presetId}/render-thumbnail`, {
    method: "POST",
  });
}

type DeletePresetResult = {
  ok: true;
  deleted: string[];
  skipped: string[];
  failed?: Array<{ path: string; error: string }>;
};

export async function deletePreset(id: string) {
  return apiFetch<DeletePresetResult>(`/presets/${id}`, {
    method: "DELETE",
  });
}

export async function createDishCutout(proDesignId: string) {
  return apiFetch<{ proDesignId: string; cutoutUrl: string }>(
    "/ai/pro-images/dish-cutout",
    {
      method: "POST",
      body: { proDesignId },
    }
  );
}





