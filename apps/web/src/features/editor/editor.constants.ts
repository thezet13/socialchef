import type { RenderOverlay } from "../../features/editor/editor.types";

export const DEFAULT_IMAGE_ADJUSTMENTS: ImageAdjustments = {
  brightness: 0,
  contrast: 0,
  saturation: 0,
  vibrance: 0,
  highlights: 0,
  shadows: 0,
  temperature: 0,
  tint: 0,
  sharpness: 0,
  clarity: 0,
  texture: 0,
  vignette: 0,
  grain: 0,
};

export const PREVIEW_WIDTH = 1000;
export const MAX_CANVAS_SIZE = 4096;

export const TEXT_LIMIT_FREE = 7;
export const PIC_LIMIT_FREE = 5;
export const RECT_LIMIT_FREE = 5;


export type BaseTransform = {
  scale: number;
  offsetX: number;
  offsetY: number;
  fitMode: "cover" | "contain";
};

export type GenKind = "dalle" | "gpt15" | "sdxl" | null;

export type ImageAdjustments = {
  brightness: number;
  contrast: number;
  saturation: number;
  vibrance: number;
  highlights: number;
  shadows: number;
  temperature: number;
  tint: number;
  sharpness: number;
  clarity: number;
  texture: number;
  vignette: number;
  grain: number;
};

type BakeLayer = "FRONT" | "BAKED";

export type Layer =
  | { kind: "text"; id: string; title: string; z: number; bakeLayer: BakeLayer }
  | { kind: "pic"; id: string; title: string; z: number; bakeLayer: BakeLayer  }
  | { kind: "rect"; id: string; title: string; z: number; bakeLayer: BakeLayer  };

export type ActiveLayer =
  | { kind: "text"; id: string }
  | { kind: "pic"; id: string }
  | { kind: "rect"; id: string }
  | null;

export interface GeneratedImage {
  id: string;
  imageUrl: string;
  proDesignId?: string;
  width: number;
  height: number;
  prompt: string;
  styleId: string | null;
  tenantId: string;
  createdAt: string;
}

export interface ImagesResponse {
  items: GeneratedImage[];
}

export interface ProDesignDTO {
  id: string;
  overlayJson: RenderOverlay | null;
  baseTransformJson: BaseTransform | null;
  imageAdjustmentsJson?: ImageAdjustments | null;
  baseWidth: number | null;
  baseHeight: number | null;
  width: number;
  height: number;
}