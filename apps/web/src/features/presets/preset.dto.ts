import type {
  OverlayTextConfig,
  OverlayPicConfig,
  OverlayRectConfig,
} from "@/features/editor/editor.types"; 
import { PresetFormat } from "./preset.editor.types";

export interface PresetDto {
  id: string;

  title: string;
  subtitle?: string | null;

  format: PresetFormat;
  prompt: string;

  thumbnailUrl: string;

  overlay: {
    texts?: OverlayTextConfig[];
    pics?: OverlayPicConfig[];
    rects?: OverlayRectConfig[];
    meta?: { version?: number };
  };
}