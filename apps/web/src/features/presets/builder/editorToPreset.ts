import type {
  OverlayTextItem,
  OverlayPicItem,
  OverlayRectItem, // rects
} from "../../../features/editor/editor.types";

import type { EditorPreset } from "../../../features/presets/preset.editor.types";

// В v1 мы просто берем поля 1-в-1 (как есть в editor state).
// Позже можно будет чистить/минимизировать JSON.

function denormalizeAssetUrl(url: string): string {
  if (!url) return "";

  const apiBase = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:4001";

  // если абсолютный URL начинается с apiBase → режем
  if (url.startsWith(apiBase)) {
    return url.slice(apiBase.length);
  }

  // уже относительный
  if (url.startsWith("/")) return url;

  // fallback — оставляем как есть
  return url;
}


export function buildPresetFromEditor(args: {
  name: string;
  prompt: string;
  style?: string;
  format: EditorPreset["format"];
  thumbnailUrl?: string;

  texts: OverlayTextItem[];
  pics: OverlayPicItem[];
  rects: OverlayRectItem[]; // ты называешь rects, но в preset пока может быть boxes
}): EditorPreset {
  const { name, prompt, format, thumbnailUrl, texts, pics, rects } = args;

  return {
    id: crypto.randomUUID(),
    name,
    prompt,
    format,
    thumbnailUrl: thumbnailUrl ?? "",

    overlay: {
      texts,
      pics: pics.map((p) => ({
            ...p,
            url: denormalizeAssetUrl(p.url),
        })),
      rects,
    },
  } as EditorPreset;
}
