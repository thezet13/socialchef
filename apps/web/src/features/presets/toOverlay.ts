import type { OverlayTextConfig, OverlayPicConfig, OverlayRectConfig } from "@/features/editor/editor.types"; 
import type { OverlayTextItem, OverlayPicItem, OverlayRectItem } from "@/features/editor/editor.types";


export function itemToOverlayCfg(it: OverlayTextItem): OverlayTextConfig {
    const zBase = 20;
    const zTop  = 100;
  return {
    id: it.id,
    name: it.name,
    
    visible: it.visible !== false,

    text: it.text,
    color: it.color,
    fontSize: it.fontSize,
    fontFamily: it.fontFamily,
    fontWeight: it.fontWeight,
    fontStyle: it.fontStyle,
    align: it.align,
    textAlign: it.textAlign,
    lineHeight: it.lineHeight,
    textOpacity: it.textOpacity,

    z:  Number(it.z ?? (it.alwaysOnTop ? zTop : zBase)),

     plaqueWidth: it.plaqueWidth > 0 ? it.plaqueWidth : undefined,
    plaqueColor: it.plaqueColor,              // <-- HEX
    plaqueOpacity: it.plaqueOpacity ?? 0,     // <-- 0..1 отдельным полем

    plaqueBorderColor: it.plaqueBorderColor,        // HEX
    plaqueBorderOpacity: it.plaqueBorderOpacity ?? 1,
    plaqueBorderWidth: it.plaqueBorderWidth || 0,
    borderRadius: it.borderRadius || undefined,

    paddingTop: it.paddingTop,
    paddingRight: it.paddingRight,
    paddingBottom: it.paddingBottom,
    paddingLeft: it.paddingLeft,

    marginTop: it.marginTop,
    marginRight: it.marginRight,
    marginBottom: it.marginBottom,
    marginLeft: it.marginLeft,

    shadowColor: it.shadowColor,       
    shadowOpacity: it.shadowOpacity,    
    shadowBlur: it.shadowBlur,        
    shadowOffsetX: it.shadowOffsetX,    
    shadowOffsetY: it.shadowOffsetY, 

    rotationDeg: it.rotationDeg ?? 0,

    bakeLayer: it.bakeLayer ?? "FRONT",
  };
}

export function picToOverlayCfg(l: OverlayPicItem, apiBase: string): OverlayPicConfig {
  return {
    id: l.id,
    name: l.name,
    role: l.role,
    
    visible: l.visible !== false,
    url: l.url.startsWith(apiBase) ? l.url.replace(apiBase, "") : l.url,
    z: Number(l.z ?? (l.alwaysOnTop ? 100 : 10)),
    width: l.width,
    height: l.height,
    opacity: l.opacity,
    align: l.align,
    marginTop: l.marginTop,
    marginRight: l.marginRight,
    marginBottom: l.marginBottom,
    marginLeft: l.marginLeft,

    rotationDeg:l.rotationDeg ?? 0,

    bakeLayer: l.bakeLayer ?? "FRONT",
  };
}

export function rectToOverlayCfg(b: OverlayRectItem): OverlayRectConfig {
  const zBase = 10;   // обычно rectangle ниже текста
  const zTop  = 100;

  return {
    id: b.id,
    name: b.name,
    visible: b.visible !== false,

    z: Number(b.z ?? (b.alwaysOnTop ? zTop : zBase)),

    align: b.align,
    marginTop: b.marginTop,
    marginRight: b.marginRight,
    marginBottom: b.marginBottom,
    marginLeft: b.marginLeft,

    width: b.width,
    height: b.height,
    opacity: b.opacity,

    fill: b.fill,

    borderColor: b.borderColor,
    borderWidth: b.borderWidth,
    borderRadius: b.borderRadius,

    rotationDeg: b.rotationDeg ?? 0,

    bakeLayer: b.bakeLayer ?? "FRONT",
  };
}