export type OverlayAlign =
  | "top-left"
  | "top-center"
  | "top-right"
  | "middle-left"
  | "middle-center"
  | "middle-right"
  | "bottom-left"
  | "bottom-center"
  | "bottom-right";

export type OverlayPosition = {
  align: OverlayAlign;

  marginTop: number;
  marginRight: number;
  marginBottom: number;
  marginLeft: number;

  rotationDeg: number;
};


export type BakeLayer = "FRONT" | "BAKED";

export type WithBake = {
  bakeLayer?: BakeLayer;
};

export type OverlayPicRole = "DISH_SLOT";


export type OverlayTextItem = OverlayPosition & {
  id: string;

  text: string;

  name: string; 
  alwaysOnTop?: boolean;

  visible?: boolean;

  color: string;
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  fontStyle?: "normal" | "italic";

  align: OverlayAlign;
  textAlign: "left" | "center" | "right";
  lineHeight: number;
  textOpacity: number;

  plaqueWidth: number; // 0 = auto
  plaqueColor: string;
  plaqueOpacity: number;

  plaqueBorderColor: string;
  plaqueBorderOpacity: number;
  plaqueBorderWidth: number;

  borderRadius: number;

  paddingTop: number;
  paddingRight: number;
  paddingBottom: number;
  paddingLeft: number;

  shadowColor: string; 
  shadowOpacity: number; 
  shadowBlur: number;     
  shadowOffsetX: number;    
  shadowOffsetY: number; 

  posX?: number
  posY?: number

  marginTop: number;
  marginRight: number;
  marginBottom: number;
  marginLeft: number;

  rotationDeg: number;

  z?: number
} & WithBake;

export type OverlayPicItem = OverlayPosition & {
  id: string;
  name: string; // "Logo 1" ...
  url: string;

  role?: OverlayPicRole;
  
  alwaysOnTop?: boolean;

  visible?: boolean;

  width: number;   // в editor px (по умолчанию 300)
  height: number;

  opacity: number; // 0..1

  align: OverlayAlign;
  marginTop: number;
  marginRight: number;
  marginBottom: number;
  marginLeft: number;

  rotationDeg: number;
  aspectRatio?: number;
  z?: number
} & WithBake;

export type OverlayRectItem = OverlayPosition & {
  id: string,
  name: string,
  visible?: boolean;
  width: number,
  height: number,
  opacity: number,
  align: OverlayAlign,
  marginLeft: number,
  marginTop: number,
  marginRight: number,
  marginBottom: number,
  fill: OverlayRectFill,
  borderColor: string,
  borderWidth: number,
  borderRadius: number,
  alwaysOnTop?: boolean;

  rotationDeg: number;

  z?: number
} & WithBake;

export interface OverlayTextConfig {

  id?: string;
  name?: string;


  text: string;
  color?: string;
  fontSize?: number;
  fontFamily?: string;
  fontWeight?: number;
  fontStyle?: "normal" | "italic";
  align?: OverlayAlign;
  textAlign?: "left" | "center" | "right";
  lineHeight?: number;
  textOpacity?: number;
  z?: number;

  visible?: boolean;

  plaqueWidth?: number;
  plaqueColor?: string;
  plaqueBorderColor?: string;
  plaqueBorderWidth?: number;
  plaqueOpacity?: number;
  plaqueBorderOpacity?: number;
  borderRadius?: number;

  paddingTop?: number;
  paddingRight?: number;
  paddingBottom?: number;
  paddingLeft?: number;

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

  bakeLayer?: BakeLayer;

}

export interface OverlayPicConfig {

  id?: string;
  name?: string;
  url: string;        // относительный путь (/uploads/...)
  z?: number;

  role?: OverlayPicRole;

  visible?: boolean;

  width: number;      // px в canvas
  height: number;

  opacity?: number;   // 0..1

  align: OverlayAlign;

  marginTop?: number;
  marginRight?: number;
  marginBottom?: number;
  marginLeft?: number;

  rotationDeg?: number;

  bakeLayer?: BakeLayer;
}

export type OverlayRectFill =
  | { kind: "solid"; color: string } // rgba(...)
  | { kind: "linear"; from: string; to: string; angle?: number }; // 0..360



export interface OverlayRectConfig {
  id?: string;
  name?: string;

  z?: number;

  width: number;
  height: number;
  opacity?: number;

  visible?: boolean;

  align?: OverlayAlign; 
  marginTop?: number;
  marginRight?: number;
  marginBottom?: number;
  marginLeft?: number;

  fill: OverlayRectFill;

  borderColor?: string;
  borderWidth?: number;
  borderRadius?: number;

  rotationDeg?: number;

  bakeLayer?: BakeLayer;
}

export interface RenderOverlay {
  texts?: OverlayTextConfig[];
  pics?: OverlayPicConfig[];
  rects?: OverlayRectConfig[];
}