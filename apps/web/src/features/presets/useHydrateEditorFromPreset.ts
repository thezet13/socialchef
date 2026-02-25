// apps/web/src/features/presets/UseHydrateEditorFromPreset.ts
import { useCallback } from "react";
import type {
  OverlayTextItem,
  OverlayPicItem,
  OverlayRectItem,
} from "../../features/editor/editor.types";
import { buildEditorStateFromPreset } from "../../features/presets/hydrateEditorFromPreset";
import type { EditorPreset } from "../../features/presets/preset.editor.types";
import { BaseTransform } from "../../features/editor/baseTransform";
import { DEFAULT_IMAGE_ADJUSTMENTS, ImageAdjustments } from "../../app/(app)/_components/image_editor/ImageAdjustmentsPanel";

export type ActiveLayer =
  | { kind: "text"; id: string }
  | { kind: "pic"; id: string }
  | { kind: "rect"; id: string }
  | null;

export type UseHydrateEditorFromPresetArgs = {
  setPrompt: (v: string) => void;

  setItems: (v: OverlayTextItem[]) => void;
  setPics: (v: OverlayPicItem[]) => void;
  setRects: (v: OverlayRectItem[]) => void;

  setActiveLayer: (v: ActiveLayer) => void;
  setPresetBaseImageUrl: (v: string | null) => void;

  setPresetBaseTransform: (t: BaseTransform) => void;

  setImageAdj: React.Dispatch<React.SetStateAction<ImageAdjustments>>;

  apiBase: string;

  setProDesignId: (v: string | null) => void;
};

function parseBaseTransform(input: unknown): BaseTransform {
  const d: BaseTransform = { scale: 1, offsetX: 0, offsetY: 0, fitMode: "cover" };

  if (!input || typeof input !== "object") return d;
  const x = input as Record<string, unknown>;

  const scale = typeof x.scale === "number" && Number.isFinite(x.scale) ? x.scale : d.scale;
  const offsetX = typeof x.offsetX === "number" && Number.isFinite(x.offsetX) ? x.offsetX : d.offsetX;
  const offsetY = typeof x.offsetY === "number" && Number.isFinite(x.offsetY) ? x.offsetY : d.offsetY;

  const fitMode = x.fitMode === "contain" || x.fitMode === "cover" ? x.fitMode : d.fitMode;

  return { scale, offsetX, offsetY, fitMode };
}

function parseImageAdj(input: unknown): ImageAdjustments {
  const d = DEFAULT_IMAGE_ADJUSTMENTS;

  if (!input || typeof input !== "object") return d;
  const x = input as Record<string, unknown>;

  const num = (k: keyof ImageAdjustments) =>
    typeof x[k as string] === "number" && Number.isFinite(x[k as string] as number)
      ? (x[k as string] as number)
      : d[k];

  return {
    brightness: num("brightness"),
    contrast: num("contrast"),
    saturation: num("saturation"),
    vibrance: num("vibrance"),
    highlights: num("highlights"),
    shadows: num("shadows"),
    temperature: num("temperature"),
    tint: num("tint"),
    sharpness: num("sharpness"),
    clarity: num("clarity"),
    texture: num("texture"),
    vignette: num("vignette"),
    grain: num("grain"),
  };
}


export function useHydrateEditorFromPreset(args: UseHydrateEditorFromPresetArgs) {
  const {
    setPrompt,
    setItems,
    setPics,
    setRects,
    setActiveLayer,
    setPresetBaseImageUrl,
    setPresetBaseTransform,
    setImageAdj,
    apiBase,
    //setProDesignId,
  } = args;

  return useCallback(
    async (p: EditorPreset) => {

      setActiveLayer(null);

      const next = buildEditorStateFromPreset(p);
      setPrompt((next.prompt ?? "").trim());

      const base = (p.baseImageUrl ?? "").trim();
      if (base) {
        const fullPresetBaseUrl = base.startsWith("http") ? base : `${apiBase}${base}`;
        setPresetBaseImageUrl(fullPresetBaseUrl);
      } else {
        setPresetBaseImageUrl(null);
      }

      const t = parseBaseTransform(p.baseTransformJson);
      setPresetBaseTransform(t);

      const i = parseImageAdj(p.imageAdjustmentsJson);
      setImageAdj(i);

      // Step 1: do not create proDesign here, because user may choose "Use my photo"
      //setProDesignId(null);

      // 2) overlay layers
      setItems(next.items);
      setPics(next.pics);
      setRects(next.rects);

      // 3) select a layer after apply
      queueMicrotask(() => {
        const firstTextId = next.nextActiveTextId ?? next.items[0]?.id ?? null;
        const firstPicId = next.pics[0]?.id ?? null;
        const firstRectId = next.rects[0]?.id ?? null;

        if (firstTextId) return setActiveLayer({ kind: "text", id: firstTextId });
        if (firstPicId) return setActiveLayer({ kind: "pic", id: firstPicId });
        if (firstRectId) return setActiveLayer({ kind: "rect", id: firstRectId });

        setActiveLayer(null);
      });
    },
    [
      setPrompt,
      setItems,
      setPics,
      setRects,
      setActiveLayer,
      setPresetBaseImageUrl,
      setPresetBaseTransform,
      setImageAdj,
      apiBase,
      //setProDesignId,
    ]
  );
}

export function toRelativeUploadPath(url: string, apiBase: string) {
  const u = url.trim();
  if (!u) return u;

  // уже относительный
  if (u.startsWith("/uploads/")) return u;

  // absolute -> relative
  if (u.startsWith(apiBase + "/uploads/")) {
    return u.slice(apiBase.length);
  }

  // внешний URL или что-то нестандартное — оставляем как есть
  return u;
}