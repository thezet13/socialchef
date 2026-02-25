// preset.types.ts

import type {
  OverlayTextItem,
  OverlayPicItem,
  OverlayRectItem
} from "../../features/editor/editor.types";

export type PresetFormat = "1:1" | "2:3" | "3:2" | "4:5" | "5:4" | "9:16" | "16:9";

export interface EditorPreset {
  id: string;
  name: string;
  thumbnailUrl: string;
  baseImageUrl: string;
  currentImageUrl: string;
  format: PresetFormat;
  prompt: string;
  overlay: {
    texts: OverlayTextItem[];
    pics?: OverlayPicItem[];
    rects?: OverlayRectItem[];
  };
  baseTransformJson?: unknown;
  imageAdjustmentsJson?: unknown;

  backgroundImageUrl: string;
  backgroundTransformJson: unknown | null;

  foregroundImageUrl: string | null;
  foregroundTransformJson: unknown | null;

  swapDishEnabled: boolean;
  dishType: string | null;

}


export type AppliedPresetDesign = {
  id: string;
  presetId: string | null;

  baseImageUrl: string | null;
  width: number | null;
  height: number | null;

  backgroundImageUrl: string | null;
  backgroundTransformJson: unknown | null;

  foregroundImageUrl: string | null;
  foregroundTransformJson: unknown | null;

  overlayJson: {
    texts?: OverlayTextItem[];
    pics?: OverlayPicItem[];
    rects?: OverlayRectItem[];
  } | null;

  baseTransformJson: unknown | null;
  imageAdjustmentsJson: unknown | null;

  formatId: string | null;
  baseWidth: number | null;
  baseHeight: number | null;
};



