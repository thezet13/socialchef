import type { PresetFormat } from "../../features/presets/preset.editor.types";

export type PostFormatId =
  | "1_1"
  | "2_3"
  | "3_2"
  | "4_5"
  | "5_4"

  
export type PostFormatDef = {
  id: PostFormatId;
  presetFormat: PresetFormat;

  label: string;
  width: number;
  height: number;
  description: string;
};

export const POST_FORMATS: PostFormatDef[] = [
  {
    id: "1_1",
    presetFormat: "1:1",
    label: "Square 1:1",
    width: 1080,
    height: 1080,
    description: "Classic square format for Instagram and Facebook feed posts.",
  },
  {
    id: "2_3",
    presetFormat: "2:3",
    label: "Portrait 2:3",
    width: 1080,
    height: 1620,
    description: "Tall photo-oriented format, usually used for Pinterest-style posts.",
  },
  {
    id: "3_2",
    presetFormat: "3:2",
    label: "Landscape 3:2",
    width: 1620,
    height: 1080,
    description: "Classic horizontal photo format suitable for Facebook.",
  },
  {
    id: "4_5",
    presetFormat: "4:5",
    label: "Portrait 4:5",
    width: 1080,
    height: 1350,
    description: "Best-performing Instagram format with maximum vertical space.",
  },
  {
    id: "5_4",
    presetFormat: "5:4",
    label: "Landscape 5:4",
    width: 1350,
    height: 1080,
    description: "Balanced horizontal format for promos and Facebook feed posts.",
  },
  // {
  //   id: "9_16",
  //   presetFormat: "9:16",
  //   label: "Story/Reel 9:16",
  //   width: 1024,
  //   height: 1920,
  //   description: "Full-screen vertical format for Instagram Stories, Reels, and TikTok.",
  // },
  // {
  //   id: "16_9",
  //   presetFormat: "16:9",
  //   label: "Widescreen 16:9",
  //   width: 1920,
  //   height: 1080,
  //   description: "Standard widescreen format for video platforms and horizontal previews.",
  // },
];

export function getFormatById(id: PostFormatId): PostFormatDef {
  const f = POST_FORMATS.find((x) => x.id === id);
  return f ?? POST_FORMATS[0];
}

export function toPresetFormat(id: PostFormatId): PresetFormat {
  return getFormatById(id).presetFormat;
}

export function fromPresetFormat(presetFormat: PresetFormat): PostFormatId {
  const f = POST_FORMATS.find((x) => x.presetFormat === presetFormat);
  return f?.id ?? "1_1";
}





export function getExportSizeByFormatId(formatId: PostFormatId, maxSide: number) {
  const f = getFormatById(formatId);

  const w = f.width;
  const h = f.height;

  // масштаб так, чтобы длинная сторона стала maxSide
  const scale = maxSide / Math.max(w, h);

  return {
    width: Math.round(w * scale),
    height: Math.round(h * scale),
  };
}