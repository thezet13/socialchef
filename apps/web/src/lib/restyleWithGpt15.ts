import type { StyleBehavior } from "@/components/stylePreview.behavior";
import { readCookie } from "./apiClient";
// apps/web/src/lib/api/restyleWithGpt15.ts
// Frontend helper for: POST /ai/pro-images/restyle-gpt15

export type RestyleWithGpt15Args = RestyleWithGpt15ArgsByDbStyle;

type CreditsAware = {
  creditsBalance?: number;
};


function readCreditsBalance(obj: Record<string, unknown>): number | undefined {
  const n = readNumber(obj, "creditsBalance");
  return n ?? undefined;
}


export type RestyleWithGpt15Result =
  | ({
    mode: "preview";
    proDesignId: string;
    previewImageUrl: string;
    width: number;
    height: number;
    style: string;
  } & CreditsAware)
  | ({
    mode: "final";
    proDesignId: string;
    baseImageUrl: string;
    width: number;
    height: number;
    style: string;
    prompt?: string | null;
    behavior?: StyleBehavior;
    formatId?: string;
  } & CreditsAware)

type RestyleWithGpt15ArgsBase = {
  apiBase: string;
  proDesignId: string;
  prompt?: string;
  behavior?: StyleBehavior;
  width?: number;
  height?: number;
  quality?: "low" | "medium" | "high" | "auto";
  signal?: AbortSignal;
  mode?: "preview" | "final";
  formatId?: string;
};


// либо DB style (cuid)
type RestyleWithGpt15ArgsByDbStyle = RestyleWithGpt15ArgsBase & {
  styleId: string;
  style?: never;
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readString(obj: Record<string, unknown>, key: string): string | null {
  const v = obj[key];
  return typeof v === "string" ? v : null;
}

function readNumber(obj: Record<string, unknown>, key: string): number | null {
  const v = obj[key];
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function readMode(obj: Record<string, unknown>): "preview" | "final" | null {
  const m = obj["mode"];
  return m === "preview" || m === "final" ? m : null;
}

function extractErrorMessage(data: unknown): string | null {
  if (!isObject(data)) return null;
  return readString(data, "error") ?? readString(data, "message");
}

export async function restyleWithGpt15(
  args: RestyleWithGpt15Args
): Promise<RestyleWithGpt15Result> {
  const {
    apiBase,
    proDesignId,
    prompt,
    width,
    height,
    quality = "auto",
    signal,
    mode = "final",
    behavior,
    formatId,
  } = args;

  const style = "style" in args ? args.style : undefined;
  const styleId = "styleId" in args ? args.styleId : undefined;

  const csrf = readCookie("sc_csrf");
  const rsp = await fetch(`${apiBase}/ai/pro-images/restyle-gpt15`, {
    method: "POST",
    credentials: "include",
    headers: {
    "Content-Type": "application/json",
    ...(csrf ? { "x-csrf-token": csrf } : {}),
  },
    body: JSON.stringify({
      proDesignId,
      prompt,
      styleId,
      width,
      height,
      quality,
      mode,
      behavior,
      formatId,
    }),
    signal,
  });

  let data: unknown = null;

  try {
    data = await rsp.json();
  } catch {
    // response body may be empty / not JSON
  }

  if (!rsp.ok) {
    const msg = extractErrorMessage(data) ?? `Request failed (${rsp.status})`;
    throw new Error(msg);
  }

  if (!isObject(data)) {
    throw new Error("Invalid response from server");
  }

  const m = readMode(data);
  const normalizedProDesignId =
    readString(data, "proDesignId") ?? readString(data, "id") ?? proDesignId;

  const normalizedStyle =
    readString(data, "style") ??
    readString(data, "styleId") ??
    (styleId ?? (style ? String(style) : ""));

  if (m === "preview") {
    const previewImageUrl = readString(data, "previewImageUrl");
    if (!previewImageUrl) throw new Error("Invalid preview response (missing previewImageUrl)");

    return {
      mode: "preview",
      proDesignId: normalizedProDesignId,
      previewImageUrl,
      width: readNumber(data, "width") ?? 512,
      height: readNumber(data, "height") ?? 512,
      style: normalizedStyle,
      creditsBalance: readCreditsBalance(data),
    };
  }

  // If backend forgot to send mode, we can still infer by presence of URLs.
  // But better to require mode. We'll allow fallback to "final" if baseImageUrl exists.
  const baseImageUrl = readString(data, "baseImageUrl");
  const previewImageUrl = readString(data, "previewImageUrl");

  if (m === "final" || (m === null && baseImageUrl)) {
    if (!baseImageUrl) throw new Error("Invalid final response (missing baseImageUrl)");

    const serverPrompt = readString(data, "prompt");

    return {
      mode: "final",
      proDesignId: normalizedProDesignId,
      baseImageUrl,
      width: readNumber(data, "width") ?? 1024,
      height: readNumber(data, "height") ?? 1024,
      style: normalizedStyle,
      prompt: serverPrompt ?? prompt ?? null,
      creditsBalance: readCreditsBalance(data),
    };
  }

  if (m === null && previewImageUrl) {
    // Fallback in case backend didn't include mode but returned previewImageUrl
    return {
      mode: "preview",
      proDesignId: normalizedProDesignId,
      previewImageUrl,
      width: readNumber(data, "width") ?? 512,
      height: readNumber(data, "height") ?? 512,
      style: normalizedStyle,
      creditsBalance: readCreditsBalance(data),

    };
  }

  throw new Error("Unexpected API response shape");
}
