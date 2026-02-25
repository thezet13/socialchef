import type { OverlayTextConfig, OverlayPicConfig, OverlayRectConfig } from "../../features/editor/editor.types"; 
import type { OverlayTextItem, OverlayPicItem, OverlayRectItem } from "../../features/editor/editor.types";

import { itemToOverlayCfg, picToOverlayCfg, rectToOverlayCfg } from "../../features/presets/toOverlay";


export type PresetOverlay = {
  texts?: OverlayTextConfig[];
  pics?: OverlayPicConfig[];
  rects?: OverlayRectConfig[];
  meta?: { version?: number };
};

export function buildPresetOverlay(args: {
  items: OverlayTextItem[];
  pics: OverlayPicItem[];
  rects: OverlayRectItem[];
  apiBase: string;
}): PresetOverlay {
  return {
    texts: args.items.map(itemToOverlayCfg),
    pics: args.pics.map((l) => picToOverlayCfg(l, args.apiBase)),
    rects: args.rects.map(rectToOverlayCfg),
    meta: { version: 1 },
  };
}
