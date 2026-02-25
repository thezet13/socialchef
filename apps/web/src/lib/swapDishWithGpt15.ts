import { OverlayTextConfig, OverlayPicConfig, OverlayRectConfig } from "../features/editor/editor.types";
import { readCookie } from "./apiClient";

type SwapOverlay = {
  texts?: OverlayTextConfig[];
  pics?: OverlayPicConfig[];
  rects?: OverlayRectConfig[];
};

type SwapDishWithGpt15ApiResponse = {
  proDesignId?: string;
  id?: string;
  baseImageUrl: string;
  width: number;
  height: number;
  prompt?: string | null;
  creditsBalance?: number;
  error?: string;
  message?: string;
};

export type SwapDishWithGpt15Result = {
  proDesignId: string;
  baseImageUrl: string;
  width: number;
  height: number;
  prompt?: string | null;
  creditsBalance?: number;
};


type SwapDishWithGpt15Args = {
  apiBase: string;
  proDesignId: string;
  presetId: string;
  prompt?: string;
  formatId?: string;
  width?: number;
  height?: number;

  overlay?: SwapOverlay;

  baseWidth?: number
  baseHeight?: number
  quality?: "low" | "medium" | "high" | "auto";
  signal?: AbortSignal;
  mode?: "preview" | "final";

};

export async function swapDishWithGpt15(
  args: SwapDishWithGpt15Args
): Promise<SwapDishWithGpt15Result> {
  const {
    apiBase,
    proDesignId,
    presetId,
    prompt,
    formatId,
    overlay: overlay,
    width,
    height,
    baseWidth: baseWidth,
    baseHeight: baseHeight,
    quality = "auto",
    signal,
    mode,
  } = args;

  const csrf = readCookie("sc_csrf");
  const rsp = await fetch(`${apiBase}/ai/pro-images/swap-dish-gpt15`, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(csrf ? { "x-csrf-token": csrf } : {}),
    },
    body: JSON.stringify({
      proDesignId,
      presetId,
      prompt,
      formatId,
      baseWidth,
      baseHeight,
      overlay,
      width,
      height,
      quality,
      mode
    }),
    signal,
  });

  let data: SwapDishWithGpt15ApiResponse | null = null;
  try {
    data = (await rsp.json()) as SwapDishWithGpt15ApiResponse;
  } catch {
    // body may be empty
  }

  if (!rsp.ok) {
    const msg = data?.error || data?.message || `Request failed (${rsp.status})`;
    throw new Error(msg);
  }

  if (!data?.baseImageUrl) {
    throw new Error("Invalid response from server");
  }

  return {
    proDesignId: data.proDesignId ?? data.id ?? proDesignId,
    baseImageUrl: data.baseImageUrl,
    width: Number(data.width ?? width ?? 1024),
    height: Number(data.height ?? height ?? 1024),
    prompt: data.prompt ?? prompt ?? null,
    creditsBalance: data.creditsBalance,
  };
}
