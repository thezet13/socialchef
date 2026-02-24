import { PostType } from "@prisma/client";
import z from "zod";

type FitMode = "cover" | "contain";

export type FormatId = "1_1" | "2_3" | "3_2" | "4_5" | "5_4" | "9_16" | "16_9";

export type BaseTransform = {
  scale?: number;   // zoom
  offsetX?: number; // pan X (в пикселях OUTPUT canvas)
  offsetY?: number; // pan Y
  fitMode?: FitMode;
};


export type PresetOverlay = {
  texts?: OverlayTextConfig[];   
  pics?: OverlayPicConfig[];     
  rects?: OverlayRectConfig[];   
  meta?: {
    version?: number;            
  };
};

export type CommitPreviewBody = {
  proDesignId: string;
  previewImageUrl: string;
};

export interface OverlayTextConfig {
  text: string;
  color?: string;          // цвет текста
  fontSize?: number;       // явный размер, px (напр. 48)
  fontWeight?: number;    
  fontFamily?: string;   
  fontStyle?: "normal" | "italic";   
  align?: string;    // позиция на картинке
  textAlign?: "left" | "center" | "right";
  lineHeight: number,
  textOpacity: number,

  z?: number;

  visible?: boolean;

  // Плашка
  plaqueWidth?: number;
  plaqueColor?: string;
  plaqueBorderColor?: string;
  plaqueOpacity?: number;
  plaqueBorderOpacity?: number;
  borderRadius?: number;
  plaqueBorderWidth?: number;

  // Padding внутри плашки
  paddingTop?: number;
  paddingRight?: number;
  paddingBottom?: number;
  paddingLeft?: number;

  // Margin от краёв картинки
  marginTop?: number;
  marginRight?: number;
  marginBottom?: number;
  marginLeft?: number;

  shadowColor: string;       // hex
  shadowOpacity: number;     // 0..1
  shadowBlur: number;        // px
  shadowOffsetX: number;     // px
  shadowOffsetY: number; 

  rotationDeg?: number;
  
}


export type OverlayPicConfig = {
  url: string; // /uploads/images/xxx.png
  width: number;  // в координатах editor/base (как margin/padding)
  height: number;

  align?: "top-left" | "top-center" | "top-right"
        | "middle-left" | "middle-center" | "middle-right"
        | "bottom-left" | "bottom-center" | "bottom-right";

  marginTop?: number;
  marginRight?: number;
  marginBottom?: number;
  marginLeft?: number;

  opacity?: number; // 0..1

  visible?: boolean;

  z?: number;

  rotationDeg?: number;
};

export type OverlayRectConfig = {
  id?: string;
  z?: number;

  width: number;
  height: number;
  opacity?: number;

  visible?: boolean;

  align?: string; 
  marginTop?: number;
  marginRight?: number;
  marginBottom?: number;
  marginLeft?: number;

  fill: 
    | { kind: "solid"; color: string } // rgba(...) or hex
    | { kind: "linear"; from: string; to: string; angle?: number };

  borderEnabled?: boolean;
  borderColor?: string;
  borderWidth?: number;
  borderRadius?: number;

  rotationDeg?: number;
  
}

export interface RenderOverlay {
  texts?: OverlayTextConfig[];
  pics?: OverlayPicConfig[];
  rects?: OverlayRectConfig[];
}

// Image adjustments payload (server render)
export type ImageAdjustments = {
  brightness?: number;
  contrast?: number;
  saturation?: number;
  vibrance?: number;
  highlights?: number;
  shadows?: number;
  temperature?: number;
  tint?: number;
  sharpness?: number;
  clarity?: number;
  texture?: number;
  vignette?: number;
  grain?: number;
};

export interface GenerateImageBody {
  prompt: string;
  style?: string;
  formatId?: string;
  width?: number;
  height?: number;

  overlay?: {
    texts?: OverlayTextConfig;
    pics?: OverlayPicConfig[];
    rects?: OverlayRectConfig[];
  };
}

export type StyleBehavior = {
  dishPlacement?: "AUTO" | "KEEP_ORIGINAL" | "USE_STYLE_CONTAINER";
  styleStrength?: "SUBTLE" | "BALANCED" | "STRONG";
  propsDetails?: "MINIMAL" | "PRESERVE_ORIGINAL" | "INSPIRED_BY_STYLE";
};

export type RestyleGpt15Body = {
  proDesignId: string;
  styleId?: string;
  prompt?: string;
  behavior?: StyleBehavior;
  width?: number;
  height?: number;
  quality?: "low" | "medium" | "high" | "auto";
  mode?: "preview" | "final";
  formatId?: FormatId;
};

export type SwapDishGpt15Body = {
  proDesignId: string;
  presetId: string;
  mode?: "preview" | "final";
  width?: number;
  height?: number;
  prompt?: string;
  baseWidth?: number;
  baseHeight?: number;
  quality?: "low" | "medium" | "high" | "auto";
  formatId?: FormatId;
};

export interface GeneratePostBody {
  type: PostType;
  language?: 'en' | 'ru' | 'az';
  tone?: string; // "friendly", "premium", "street food" и т.д.
  dishName?: string;
  dishDescription?: string;
  idea?: string; // свободное описание идеи поста
}

export interface ProDesignDTO {
  id: string;
  overlayJson: RenderOverlay | null;
  baseTransformJson: BaseTransform | null;
  imageAdjustmentsJson?: any;
  baseWidth: number | null;
  baseHeight: number | null;
  width: number;
  height: number;
}

export type UpscaleBody = {
  sourceImageUrl: string;     // "/uploads/images/xxx.png"
  targetMaxSide: number;      // 2048 | 4096 etc
  outputFormat?: "png";       // keep simple for now
};


export const designImportBodySchema = z.object({
  imageUrl: z.string().min(1), // expected: "/uploads/images/..."
  // optional hints (can be omitted)
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  format: z.enum(["1:1", "4:5", "9:16", "16:9"]).optional(),

  clean: z.boolean().optional().default(true),
  maskPad: z.number().min(0).max(80).optional().default(18),
});

export const designImportModelSchema = z.object({
  width: z.number().int().positive(),
  height: z.number().int().positive(),

  texts: z
    .array(
      z.object({
        text: z.string().min(1),
        x: z.number(), // px from left
        y: z.number(), // px from top

        w: z.number().positive().optional(),
        h: z.number().positive().optional(),

        fontSize: z.number().positive().optional(),
        fontWeight: z.number().optional(),
        fontFamily: z.string().optional(),
        fontStyle: z.string().optional(),
        color: z.string().optional(),

        rotationDeg: z.number().optional(),
        textAlign: z.enum(["left", "center", "right"]).optional(),
        lineHeight: z.number().positive().optional(),
        textOpacity: z.number().min(0).max(1).optional(),
      })
    )
    .default([]),

  rects: z
    .array(
      z.object({
        x: z.number(),
        y: z.number(),
        width: z.number().positive(),
        height: z.number().positive(),

        opacity: z.number().min(0).max(1).optional(),
        borderRadius: z.number().min(0).optional(),
        rotationDeg: z.number().optional(),

        fill: z.object({
          kind: z.enum(["solid", "linear"]),
          // solid
          color: z.string().optional(),
          // linear
          from: z.string().optional(),
          to: z.string().optional(),
          angle: z.number().optional(),
        }),
      })
    )
    .default([]),

  // MVP: optional placeholders only; we won't return pics to UI yet
  pics: z
    .array(
      z.object({
        x: z.number(),
        y: z.number(),
        width: z.number().positive(),
        height: z.number().positive(),
        rotationDeg: z.number().optional(),
        opacity: z.number().min(0).max(1).optional(),
      })
    )
    .default([]),
});

export const BakeBehaviorSchema = z.object({
  brandControl: z.enum(["BRAND_ACCURATE", "BRAND_GUIDED", "CREATIVE_INTERPRETATION"]),
  colorLogic: z.enum(["PALETTE_LOCKED", "PALETTE_HARMONIZED", "MOOD_BASED"]),
  shapeStyle: z.enum(["NONE", "STRUCTURAL", "BRAND_DERIVED", "EXPRESSIVE"]),
  layoutDiscipline: z.enum(["LAYOUT_LOCKED", "LAYOUT_AWARE"]),
  typographyEffects: z.enum(["STRICT", "BRAND_LED", "DYNAMIC"]),
  
  designNote: z.string().max(300).optional(),
});

export const BakeBodySchema = z.object({
  // откуда берём style reference
  styleRefImageUrl: z.string().min(1),

  // overlay из редактора (полный)
  overlay: z.any(),

  // размеры текущего формата (как в editor)
  baseWidth: z.number().int().positive(),
  baseHeight: z.number().int().positive(),

  // желаемый output (как proDesign.width/height)
  outputWidth: z.number().int().positive(),
  outputHeight: z.number().int().positive(),

  // качество openai
  quality: z.enum(["low", "medium", "high", "auto"]).optional(),
  behavior: BakeBehaviorSchema.optional(),

  safeInsetPct: z.number().min(0).max(0.15).optional(),
});

export const BakeCommitSchema = z.object({
  previewImageUrl: z.string().min(1),
});