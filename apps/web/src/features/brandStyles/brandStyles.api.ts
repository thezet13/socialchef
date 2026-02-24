import { apiFetch, readCookie } from "@/lib/apiClient";

// Если у тебя типы лежат в web-слое — импортируй оттуда.
// Если типы сейчас только в api-модуле — можно временно продублировать DTO прямо тут.
export type BrandStyleScope = "SYSTEM" | "TENANT";
export type BrandStyleStatus = "ACTIVE" | "ARCHIVED";

export type FontRole = "headline" | "value" | "subline" | "fineprint";

export type ResolvedFontDto = {
  role: FontRole;
  familyLabel: string;
  matchedFontKey: string;
  isExact: boolean;
};

export type CycleFontRequestDto = {
  role: FontRole;
  direction: "next" | "prev";
};

export type ResolveFontsResponseDto = {
  brandStyleId: string;
  resolved: ResolvedFontDto[];
};

export type BrandStyleListItemDto = {
  id: string;
  scope: BrandStyleScope;
  status: BrandStyleStatus;
  name: string;
  sourceImageUrl: string;
  thumbnailUrl: string;
  version: number;
  updatedAt: string; // ISO
};

export type ListBrandStylesResponseDto = {
  items: BrandStyleListItemDto[];
  nextCursor: number | null;
  counts?: { all: number; system: number; mine: number };
};

export type UploadBrandStyleResponseDto = {
  imageUrl: string;
  thumbnailUrl: string;
  imageW: number;
  imageH: number;
  thumbW: number;
  thumbH: number;
};

export type AnalyzeBrandStyleBodyDto = {
  imageUrl: string;
  hintName?: string;
};

export type AnalyzeBrandStyleResponseDto = {
  name?: string;
  styleRecipeJson: unknown;
  fontMetaJson: unknown | null;
  creditsBalance?: number;
};

export type CreateBrandStyleBodyDto = {
  scope: "SYSTEM" | "TENANT";
  name: string;
  sourceImageUrl: string;
  sourceW?: number;
  sourceH?: number;
  thumbnailUrl: string | null;
  styleRecipeJson: unknown;
  fontMetaJson?: unknown;
};

export type CreateBrandStyleResponseDto = {
  id: string;
};

/**
 * GET /api/brand-styles
 */

export async function listBrandStyles(
  params?: {
    scope?: "SYSTEM" | "TENANT" | "ALL";
    status?: "ACTIVE" | "ARCHIVED";
    q?: string;
    take?: number;
    cursor?: number; // <-- вместо skip в UI
  }
) {
  const qs = new URLSearchParams();
  if (params?.scope) qs.set("scope", params.scope);
  if (params?.status) qs.set("status", params.status);
  if (params?.q) qs.set("q", params.q);
  if (typeof params?.take === "number") qs.set("take", String(params.take));
  if (typeof params?.cursor === "number") qs.set("skip", String(params.cursor)); // <-- маппинг cursor->skip

  const suffix = qs.toString();
  const path = suffix ? `/brand-styles/?${suffix}` : "/brand-styles/";

  return apiFetch<ListBrandStylesResponseDto>(path);
}

/**
 * POST /api/brand-styles/upload (multipart)
 *
 * ВАЖНО: тут НЕ используем apiFetch, потому что apiFetch JSON-ит body и ставит Content-Type,
 * а для FormData нельзя ставить Content-Type вручную.
 */
export async function uploadBrandStyleImage(file: File) {
  const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:4001";

  const form = new FormData();
  form.append("file", file);

  const csrf = readCookie("sc_csrf");

  const res = await fetch(`${API_URL}/brand-styles/upload`, {
    method: "POST",
    body: form,
    credentials: "include",
    headers: csrf ? { "x-csrf-token": csrf } : {},
  });

  const ct = res.headers.get("content-type") ?? "";
  const raw = await res.text();
  const data: unknown = ct.includes("application/json") ? (raw ? JSON.parse(raw) : null) : raw;

  if (!res.ok) {
    // пусть apiClient.ts обрабатывает 401/402 — но тут мы в fetch напрямую,
    // поэтому просто бросаем Error с текстом, как минимум.
    const msg =
      data && typeof data === "object" && data !== null && "error" in data
        ? String((data as { error?: unknown }).error)
        : `Upload failed with status ${res.status}`;
    throw new Error(msg);
  }

  return data as UploadBrandStyleResponseDto;
}

/**
 * POST /api/brand-styles/analyze
 */
export async function analyzeBrandStyle(body: AnalyzeBrandStyleBodyDto) {
  return apiFetch<AnalyzeBrandStyleResponseDto>("/brand-styles/analyze", {
    method: "POST",
    body,
  });
}

/**
 * POST /api/brand-styles
 */
export async function createBrandStyle(body: CreateBrandStyleBodyDto) {
  return apiFetch<CreateBrandStyleResponseDto>("/brand-styles", {
    method: "POST",
    body,
  });
}

export async function deleteBrandStyle(opts: {
  apiBase: string;
  brandStyleId: string;
}) {
  const csrf = readCookie("sc_csrf");
  const rsp = await fetch(`${opts.apiBase}/brand-styles/${opts.brandStyleId}`, {
    method: "DELETE",
    credentials: "include",
    headers: csrf ? { "x-csrf-token": csrf } : {},
  });

  if (rsp.status === 204) return;

  const data = (await rsp.json().catch(() => ({}))) as { error?: string };
  throw new Error(data.error || `Delete failed (${rsp.status})`);
}