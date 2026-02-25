import type { RenderOverlay, OverlayTextItem, OverlayPicItem, OverlayRectItem } from "../../features/editor/editor.types";
import { presetTextToItem, type PresetTextRaw, presetPicToItem, type PresetPicRaw, presetRectToItem, type PresetRectRaw } from "./sanitize";
import type { EditorPreset } from "../../features/presets/preset.editor.types";


// Тут можно расширить позже: pics, rects, logos и т.д.
export type ApplyPresetResult = {
  prompt: string;
  items: OverlayTextItem[];
  pics: OverlayPicItem[];
  rects: OverlayRectItem[];
  nextActiveTextId: string | null;
};


export function buildEditorStateFromRenderOverlay(o: RenderOverlay): ApplyPresetResult {
  const rawTexts = (o.texts ?? []) as unknown[];
  const rawPics = (o.pics ?? []) as unknown[];
  const rawRects = (o.rects ?? []) as unknown[];

  const items = rawTexts.map((t, idx) => presetTextToItem(t as PresetTextRaw, idx));
  const pics = rawPics.map((x, idx) => presetPicToItem(x as PresetPicRaw, idx));
  const rects = rawRects.map((x, idx) => presetRectToItem(x as PresetRectRaw, idx));

  return {
    prompt: "",
    items,
    pics,
    rects,
    nextActiveTextId: items[0]?.id ?? null,
  };
}


export function buildEditorStateFromPreset(p: EditorPreset): ApplyPresetResult {

  const rawTexts = (p.overlay?.texts ?? []) as unknown[];
  const rawPics = (p.overlay?.pics ?? []) as unknown[];
  const rawRects = (p.overlay?.rects ?? []) as unknown[];


  const items = rawTexts.map((t, idx) =>
    presetTextToItem(t as PresetTextRaw, idx)
  );

  const pics = rawPics.map((x, idx) =>
    presetPicToItem(x as PresetPicRaw, idx)
  );

  const rects = rawRects.map((x, idx) =>
    presetRectToItem(x as PresetRectRaw, idx)
  );

  return {
    prompt: p.prompt,
    items,
    pics,
    rects,
    nextActiveTextId: items[0]?.id ?? null,
  };
}
