"use client";

import React from "react";
import type {
  OverlayTextConfig,
  OverlayPicItem,
  OverlayRectConfig,
} from "../../../../features/editor/editor.types";
import { hexToRgba } from "../../../../lib/config";

export type OverlayPositionConfig = {
  align: string;
  marginTop: number;
  marginRight: number;
  marginBottom: number;
  marginLeft: number;
};

const Z_DEFAULT = {
  text: 30,
  pic: 20,
  rect: 10,
};

export function getPreviewPositionStyle(
  cfg: OverlayPositionConfig,
  scaleX: number,
  scaleY: number
): React.CSSProperties {
  const {
    align = "top-left",
    marginTop = 10,
    marginRight = 10,
    marginBottom = 10,
    marginLeft = 10,
  } = cfg;

  const topPx = marginTop * scaleY;
  const bottomPx = marginBottom * scaleY;
  const leftPx = marginLeft * scaleX;
  const rightPx = marginRight * scaleX;

  const dx = (marginLeft - marginRight) * scaleX;
  const dy = (marginTop - marginBottom) * scaleY;

  const style: React.CSSProperties = { position: "absolute" };

  switch (align) {
    case "top-center":
      style.top = topPx;
      style.left = "50%";
      style.transform = `translateX(-50%) translateX(${dx}px)`;
      break;

    case "middle-left":
      style.top = "50%";
      style.left = leftPx;
      style.transform = `translateY(-50%) translateY(${dy}px)`;
      break;

    case "middle-center":
      style.top = "50%";
      style.left = "50%";
      style.transform = `translate(-50%, -50%) translate(${dx}px, ${dy}px)`;
      break;

    case "middle-right":
      style.top = "50%";
      style.right = rightPx;
      style.transform = `translateY(-50%) translateY(${dy}px)`;
      break;

    case "bottom-center":
      style.bottom = bottomPx;
      style.left = "50%";
      style.transform = `translateX(-50%) translateX(${dx}px)`;
      break;

    case "top-left":
      style.top = topPx;
      style.left = leftPx;
      break;
    case "top-right":
      style.top = topPx;
      style.right = rightPx;
      break;
    case "bottom-left":
      style.bottom = bottomPx;
      style.left = leftPx;
      break;
    case "bottom-right":
      style.bottom = bottomPx;
      style.right = rightPx;
      break;
  }

  return style;
}

function clamp01(v: unknown, fallback: number) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(1, n));
}

export type TextsPreviewBoxProps = {
  id: string;
  isActive: boolean;
  onSelect?: (id: string) => void;
  onDeselectpic?: () => void;

  cfg: OverlayTextConfig;
  scaleX: number;
  scaleY: number;

  onChangeMargins?: (margins: {
    marginTop?: number;
    marginRight?: number;
    marginBottom?: number;
    marginLeft?: number;
  }) => void;

  onChangeRotationDeg?: (deg: number) => void;
};





export function TextsPreviewBox({
  id,
  isActive,
  onSelect,
  onDeselectpic,
  cfg,
  scaleX,
  scaleY,
  onChangeMargins,
  onChangeRotationDeg,
  onChangeText, // ✅ NEW
}: TextsPreviewBoxProps & { onChangeText?: (nextText: string) => void }) {
  const {
    text,
    color = "#ffffff",
    fontFamily,
    fontSize = 50,
    fontWeight,
    fontStyle,
    plaqueWidth,
    plaqueColor,
    plaqueBorderColor,
    borderRadius,
    paddingTop,
    paddingRight,
    paddingBottom,
    paddingLeft,
    marginTop = 0,
    marginRight = 0,
    marginBottom = 0,
    marginLeft = 0,
    align = "top-left",
    textAlign = "left",
  } = cfg;

  const ref = React.useRef<HTMLDivElement | null>(null);
  const spanRef = React.useRef<HTMLSpanElement | null>(null);
  const [isEditing, setIsEditing] = React.useState(false);


  React.useEffect(() => {
    if (!isEditing) return;
    const el = spanRef.current;
    if (!el) return;

    // кладём актуальный текст в DOM ровно один раз при входе в edit
    el.textContent = text ?? "";

    // ставим caret в конец
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
  }, [isEditing]);

  const isEmpty = !text || !text.trim();
  if (cfg.visible === false) return null;
  if (isEmpty && !isActive && !isEditing) return null;


  const padTop = paddingTop ?? 0;
  const padRight = paddingRight ?? 0;
  const padBottom = paddingBottom ?? 0;
  const padLeft = paddingLeft ?? 0;
  const borderWidth = cfg.plaqueBorderWidth ?? 0;
  const radius = borderRadius ?? 0;

  const scaledPadTop = padTop * scaleY;
  const scaledPadBottom = padBottom * scaleY;
  const scaledPadLeft = padLeft * scaleX;
  const scaledPadRight = padRight * scaleX;

  const scaledRadius = radius * scaleX;
  const scaledBorderWidth = borderWidth * scaleX;

  const scaledFontSize = fontSize * scaleY;
  const scaledPlaqueWidth = plaqueWidth ? plaqueWidth * scaleX : undefined;

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (isEditing) return; // ✅ while editing: no drag
    e.preventDefault();
    e.stopPropagation();

    onDeselectpic?.();
    onSelect?.(id);

    if (!onChangeMargins) return;

    const startX = e.clientX;
    const startY = e.clientY;

    const startTop = marginTop;
    const startRight = marginRight;
    const startBottom = marginBottom;
    const startLeft = marginLeft;

    const handleMouseMove = (ev: MouseEvent) => {
      const dxScreen = ev.clientX - startX;
      const dyScreen = ev.clientY - startY;

      const dx = dxScreen / scaleX;
      const dy = dyScreen / scaleY;

      const next: {
        marginTop?: number;
        marginRight?: number;
        marginBottom?: number;
        marginLeft?: number;
      } = {};

      const isTop = align.startsWith("top");
      const isMiddle = align.startsWith("middle");
      const isBottom = align.startsWith("bottom");

      const isLeft = align.endsWith("left");
      const isCenter = align.endsWith("center");
      const isRight = align.endsWith("right");

      if (isTop || isMiddle) next.marginTop = startTop + dy;
      else if (isBottom) next.marginBottom = startBottom - dy;

      if (isLeft || isCenter) next.marginLeft = startLeft + dx;
      else if (isRight) next.marginRight = startRight - dx;

      onChangeMargins(next);
    };

    const handleMouseUp = () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
  };

  const textAlpha = clamp01(cfg.textOpacity, 1);
  const plaqueAlpha = clamp01(cfg.plaqueOpacity, 0);
  const plaqueBackground =
    plaqueColor && plaqueAlpha > 0 ? hexToRgba(plaqueColor, plaqueAlpha) : "transparent";

  const borderAlpha = clamp01(cfg.plaqueBorderOpacity, 1);
  const textColor = hexToRgba(color, textAlpha);
  const borderColor = plaqueBorderColor ? hexToRgba(plaqueBorderColor, borderAlpha) : "transparent";

  const shadowAlpha = clamp01(cfg.shadowOpacity, 0);
  const shadowAlphaFinal = shadowAlpha * textAlpha;

  const scaledShadowBlur = Number(cfg.shadowBlur ?? 0) * Math.min(scaleX, scaleY);
  const scaledShadowOffsetX = Number(cfg.shadowOffsetX ?? 0) * scaleX;
  const scaledShadowOffsetY = Number(cfg.shadowOffsetY ?? 0) * scaleY;

  const textShadow: React.CSSProperties["textShadow"] =
    shadowAlphaFinal > 0
      ? `${scaledShadowOffsetX}px ${scaledShadowOffsetY}px ${scaledShadowBlur}px ${hexToRgba(
        cfg.shadowColor ?? "#000000",
        shadowAlphaFinal
      )}`
      : "none";

  const rectStyle: React.CSSProperties = {
    ...getPreviewPositionStyle(
      { ...cfg, marginTop, marginRight, marginBottom, marginLeft, align },
      scaleX,
      scaleY
    ),

    paddingTop: scaledPadTop,
    paddingRight: scaledPadRight,
    paddingBottom: scaledPadBottom,
    paddingLeft: scaledPadLeft,
    borderRadius: scaledRadius,
    backgroundColor: plaqueBackground,

    border:
      plaqueBorderColor && scaledBorderWidth > 0 && borderAlpha > 0
        ? `${scaledBorderWidth}px solid ${borderColor}`
        : "none",

    color: textColor,
    fontSize: scaledFontSize,
    fontFamily: fontFamily ?? "Inter",
    fontWeight,
    fontStyle: fontStyle ?? "normal",
    textAlign,

    zIndex: cfg.z ?? Z_DEFAULT.text,

    maxWidth: scaledPlaqueWidth ? `${scaledPlaqueWidth}px` : "none",
    width: scaledPlaqueWidth ? `${scaledPlaqueWidth}px` : "auto",
    whiteSpace: plaqueWidth ? "normal" : "nowrap",
    overflowWrap: "break-word",

    cursor: isEditing ? "text" : onChangeMargins ? "move" : "default",
    userSelect: isEditing ? "text" : "none",

    lineHeight: cfg.lineHeight ? `${cfg.lineHeight}` : "1.2",
    wordBreak: "break-word",

    outline: isActive ? "1px dashed rgba(255, 255, 255, 0.3)" : "none",
    outlineOffset: 2,

    textShadow,
    overflow: "visible",
  };

  const rot = Number(cfg.rotationDeg ?? 0);
  const prevTransform = typeof rectStyle.transform === "string" ? rectStyle.transform : "";
  rectStyle.transform = `${prevTransform} rotate(${rot}deg)`.trim();
  rectStyle.transformOrigin = "center center";

  const onRotateMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (isEditing) return;
    e.preventDefault();
    e.stopPropagation();

    onDeselectpic?.();
    onSelect?.(id);

    if (!onChangeRotationDeg) return;

    const el = ref.current;
    if (!el) return;

    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;

    const startRotation = Number(cfg.rotationDeg ?? 0);
    const startAngleDeg = (Math.atan2(e.clientY - cy, e.clientX - cx) * 180) / Math.PI;

    const handleMove = (ev: MouseEvent) => {
      const angleDeg = (Math.atan2(ev.clientY - cy, ev.clientX - cx) * 180) / Math.PI;
      let next = startRotation + (angleDeg - startAngleDeg);

      if (ev.shiftKey) next = Math.round(next / 15) * 15;
      next = ((next + 180) % 360 + 360) % 360 - 180;

      onChangeRotationDeg(next);
    };

    const handleUp = () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };

    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
  };

  return (
    <div
      dir="ltr"
      ref={ref}
      style={rectStyle}
      onMouseDown={handleMouseDown}
      onDoubleClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onDeselectpic?.();
        onSelect?.(id);
        setIsEditing(true);
      }}
    >
      {isActive && !!onChangeRotationDeg && !isEditing && (
        <div
          onMouseDown={onRotateMouseDown}
          style={{
            direction: "ltr",
            unicodeBidi: "isolate",
            position: "absolute",
            left: "50%",
            top: -18,
            transform: "translateX(-50%)",
            width: 14,
            height: 14,
            borderRadius: 999,
            background: "rgba(255,255,255,0.9)",
            border: "1px solid rgba(0,0,0,0.35)",
            cursor: "grab",
            zIndex: cfg.z ?? Z_DEFAULT.text,
          }}
          title="Rotate (Shift = snap 15°)"
        />
      )}

      <span
        ref={spanRef}
        contentEditable={isEditing}
        suppressContentEditableWarning
        spellCheck={false}
        onMouseDown={(e) => { if (isEditing) e.stopPropagation(); }}
        onInput={(e) => {
          if (!onChangeText) return;
          const next = (e.currentTarget.textContent ?? "").replace(/\u00A0/g, " ");
          onChangeText(next);
        }}
        onBlur={() => setIsEditing(false)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            (e.currentTarget as HTMLSpanElement).blur();
            setIsEditing(false);
          }
          // Enter можно запретить, если хочешь single-line:
          if (!plaqueWidth && e.key === "Enter") {
            e.preventDefault();
            (e.currentTarget as HTMLSpanElement).blur();
            setIsEditing(false);
          }
        }}
        dir="ltr"
        style={{
          direction: "ltr",
          unicodeBidi: "isolate",
          textAlign,
          outline: "none",
          whiteSpace: plaqueWidth ? "pre-wrap" : "pre",
        }}
      >
        {!isEditing ? (text ?? "") : null}
      </span>


    </div>
  );
}

export function PicsPreviewBox(props: {
  id: string;
  isActive: boolean;
  onSelect?: (id: string) => void;
  item: OverlayPicItem;
  scaleX: number;
  scaleY: number;
  onChange: (patch: Partial<OverlayPicItem>) => void;
  onChangeRotationDeg?: (deg: number) => void;
}) {
  const { id, isActive, onSelect, item, scaleX, scaleY, onChange, onChangeRotationDeg } = props;

  const stylePos = getPreviewPositionStyle(item, scaleX, scaleY);
  const ref = React.useRef<HTMLDivElement | null>(null);

  const wPx = item.width * scaleX;
  const hPx = item.height * scaleY;

  const onDragMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onSelect?.(id);

    const startX = e.clientX;
    const startY = e.clientY;

    const startTop = item.marginTop;
    const startRight = item.marginRight;
    const startBottom = item.marginBottom;
    const startLeft = item.marginLeft;

    const align = item.align;

    const handleMove = (ev: MouseEvent) => {
      const dxScreen = ev.clientX - startX;
      const dyScreen = ev.clientY - startY;

      const dx = dxScreen / scaleX;
      const dy = dyScreen / scaleY;

      const next: Partial<OverlayPicItem> = {};

      const isTop = align.startsWith("top");
      const isMiddle = align.startsWith("middle");
      const isBottom = align.startsWith("bottom");

      const isLeft = align.endsWith("left");
      const isCenter = align.endsWith("center");
      const isRight = align.endsWith("right");

      if (isTop || isMiddle) next.marginTop = startTop + dy;
      else if (isBottom) next.marginBottom = startBottom - dy;

      if (isLeft || isCenter) next.marginLeft = startLeft + dx;
      else if (isRight) next.marginRight = startRight - dx;

      onChange(next);
    };

    const handleUp = () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };

    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
  };

  const onResizeMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onSelect?.(id);

    const startX = e.clientX;

    const startW = item.width;
    const startH = item.height;

    const startMR = item.marginRight;
    const startMB = item.marginBottom;

    const ratio = item.aspectRatio ?? (item.width > 0 ? item.height / item.width : 1);

    const handleMove = (ev: MouseEvent) => {
      const dx = (ev.clientX - startX) / scaleX;

      const width = Math.max(10, Math.round(startW + dx));
      const height = Math.max(10, Math.round(width * ratio));

      const dW = width - startW;
      const dH = height - startH;

      onChange({
        width,
        height,
        marginRight: startMR - dW,
        marginBottom: startMB - dH,
      });
    };

    const handleUp = () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };

    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
  };

  if (item.visible === false) return null;

  const onRotateMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();

    onSelect?.(id);
    if (!onChangeRotationDeg) return;

    const el = ref.current;
    if (!el) return;

    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;

    const startRotation = Number(item.rotationDeg ?? 0);
    const startAngleDeg = (Math.atan2(e.clientY - cy, e.clientX - cx) * 180) / Math.PI;

    const handleMove = (ev: MouseEvent) => {
      const angleDeg = (Math.atan2(ev.clientY - cy, ev.clientX - cx) * 180) / Math.PI;
      let next = startRotation + (angleDeg - startAngleDeg);

      if (ev.shiftKey) next = Math.round(next / 15) * 15;
      next = ((next + 180) % 360 + 360) % 360 - 180;

      onChangeRotationDeg(next);
    };

    const handleUp = () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };

    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
  };

  const rot = Number(item.rotationDeg ?? 0);
  const baseTransform =
    typeof (stylePos as React.CSSProperties).transform === "string"
      ? (stylePos as React.CSSProperties).transform
      : "";

  return (
    <div
      ref={ref}
      style={{
        ...stylePos,
        width: wPx,
        height: hPx,
        transform: `${baseTransform} rotate(${rot}deg)`.trim(),
        transformOrigin: "center center",
        outline: isActive ? "1px dashed rgba(255,255,255,0.3)" : "none",
        outlineOffset: 2,
        cursor: "move",
        userSelect: "none",
        zIndex: item.z ?? Z_DEFAULT.pic,
      }}
      onMouseDown={onDragMouseDown}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={item.url}
        alt={item.name}
        draggable={false}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "contain",
          opacity: item.opacity,
          pointerEvents: "none",
        }}
      />

      {isActive && !!onChangeRotationDeg && (
        <div
          onMouseDown={onRotateMouseDown}
          style={{
            position: "absolute",
            left: "50%",
            top: -18,
            transform: "translateX(-50%)",
            width: 14,
            height: 14,
            borderRadius: 999,
            background: "rgba(255,255,255,0.9)",
            border: "1px solid rgba(0,0,0,0.35)",
            cursor: "grab",
            zIndex: item.z ?? Z_DEFAULT.pic,
          }}
        />
      )}

      {isActive && (
        <div
          onMouseDown={onResizeMouseDown}
          style={{
            position: "absolute",
            right: -6,
            bottom: -6,
            width: 12,
            height: 12,
            background: "rgba(255,255,255,0.9)",
            cursor: "nwse-resize",
          }}
        />
      )}
    </div>
  );
}

export function RectsPreviewBox(props: {
  id: string;
  isActive: boolean;
  onSelect: (id: string) => void;
  cfg: OverlayRectConfig;
  scaleX: number;
  scaleY: number;
  onChange?: (patch: Partial<OverlayRectConfig>) => void;
  onChangeRotationDeg?: (deg: number) => void;
  onChangeMargins?: (m: {
    marginTop?: number;
    marginRight?: number;
    marginBottom?: number;
    marginLeft?: number;
  }) => void;
}) {
  const { id, isActive, onSelect, cfg, scaleX, scaleY, onChange, onChangeMargins, onChangeRotationDeg } = props;

  const ref = React.useRef<HTMLDivElement | null>(null);
  if (cfg.visible === false) return null;

  const w = (cfg.width ?? 0) * scaleX;
  const h = (cfg.height ?? 0) * scaleY;

  const bw = Math.max(0, parseFloat(String(cfg.borderWidth ?? 0)) || 0) * Math.min(scaleX, scaleY);
  const radius = Math.max(0, parseFloat(String(cfg.borderRadius ?? 0)) || 0) * Math.min(scaleX, scaleY);

  const borderOpacity01 =
    "borderOpacity" in cfg && typeof cfg.borderOpacity === "number" ? cfg.borderOpacity : 1;

  const borderCol =
    cfg.borderColor && bw > 0 && borderOpacity01 > 0 ? hexToRgba(cfg.borderColor, borderOpacity01) : "";

  const borderStyle: React.CSSProperties["borderStyle"] = borderCol && bw > 0 ? "solid" : "none";

  const opacity01 = Math.max(0, Math.min(1, Number(cfg.opacity ?? 1)));

  const background =
    cfg.fill?.kind === "linear"
      ? `linear-gradient(${Number(cfg.fill.angle ?? 90)}deg, ${cfg.fill.from}, ${cfg.fill.to})`
      : cfg.fill?.kind === "solid"
        ? cfg.fill.color
        : "transparent";

  const align = cfg.align ?? "top-left";

  const style: React.CSSProperties = {
    ...getPreviewPositionStyle(
      {
        ...cfg,
        align,
        marginTop: cfg.marginTop ?? 0,
        marginRight: cfg.marginRight ?? 0,
        marginBottom: cfg.marginBottom ?? 0,
        marginLeft: cfg.marginLeft ?? 0,
      },
      scaleX,
      scaleY
    ),
    width: `${w}px`,
    height: `${h}px`,
    opacity: opacity01,
    background,
    borderStyle,
    borderWidth: borderStyle === "none" ? 0 : bw,
    borderColor: borderStyle === "none" ? undefined : borderCol,
    borderRadius: `${radius}px`,
    zIndex: cfg.z ?? Z_DEFAULT.rect,
    cursor: onChangeMargins ? "move" : "default",
    userSelect: "none",
    outline: isActive ? "1px dashed rgba(255, 255, 255, 0.3)" : "none",
    outlineOffset: 2,
  };

  const rot = Number(cfg.rotationDeg ?? 0);
  const baseTransform = typeof style.transform === "string" ? style.transform : "";
  style.transform = `${baseTransform} rotate(${rot}deg)`.trim();
  style.transformOrigin = "center center";

  const onResizeMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onSelect(id);
    if (!onChange) return;

    const startX = e.clientX;
    const startY = e.clientY;

    const startW = Number(cfg.width ?? 0);
    const startH = Number(cfg.height ?? 0);

    const startMR = Number(cfg.marginRight ?? 0);
    const startMB = Number(cfg.marginBottom ?? 0);

    const handleMove = (ev: MouseEvent) => {
      const dx = (ev.clientX - startX) / scaleX;
      const dy = (ev.clientY - startY) / scaleY;

      const width = Math.max(10, Math.round(startW + dx));
      const height = Math.max(10, Math.round(startH + dy));

      const dW = width - startW;
      const dH = height - startH;

      onChange({
        width,
        height,
        marginRight: startMR - dW,
        marginBottom: startMB - dH,
      });
    };

    const handleUp = () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };

    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
  };


  const onMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();

    onSelect(id);
    if (!onChangeMargins) return;

    const startX = e.clientX;
    const startY = e.clientY;

    const startTop = cfg.marginTop ?? 0;
    const startRight = cfg.marginRight ?? 0;
    const startBottom = cfg.marginBottom ?? 0;
    const startLeft = cfg.marginLeft ?? 0;

    const handleMove = (ev: MouseEvent) => {
      const dx = (ev.clientX - startX) / scaleX;
      const dy = (ev.clientY - startY) / scaleY;

      const next: { marginTop?: number; marginRight?: number; marginBottom?: number; marginLeft?: number } = {};

      const isTop = align.startsWith("top");
      const isMiddle = align.startsWith("middle");
      const isBottom = align.startsWith("bottom");

      const isLeft = align.endsWith("left");
      const isCenter = align.endsWith("center");
      const isRight = align.endsWith("right");

      if (isTop || isMiddle) next.marginTop = startTop + dy;
      else if (isBottom) next.marginBottom = startBottom - dy;

      if (isLeft || isCenter) next.marginLeft = startLeft + dx;
      else if (isRight) next.marginRight = startRight - dx;

      onChangeMargins(next);
    };

    const handleUp = () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };

    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
  };

  const onRotateMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();

    onSelect(id);
    if (!onChangeRotationDeg) return;

    const el = ref.current;
    if (!el) return;

    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;

    const startRotation = Number(cfg.rotationDeg ?? 0);
    const startAngleDeg = (Math.atan2(e.clientY - cy, e.clientX - cx) * 180) / Math.PI;

    const handleMove = (ev: MouseEvent) => {
      const angleDeg = (Math.atan2(ev.clientY - cy, ev.clientX - cx) * 180) / Math.PI;
      let next = startRotation + (angleDeg - startAngleDeg);

      if (ev.shiftKey) next = Math.round(next / 15) * 15;
      next = ((next + 180) % 360 + 360) % 360 - 180;

      onChangeRotationDeg(next);
    };

    const handleUp = () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };

    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
  };

  return (
    <div ref={ref} style={style} onMouseDown={onMouseDown}>
      {isActive && !!onChangeRotationDeg && (
        <div
          onMouseDown={onRotateMouseDown}
          style={{
            position: "absolute",
            left: "50%",
            top: -18,
            transform: "translateX(-50%)",
            width: 14,
            height: 14,
            borderRadius: 999,
            background: "rgba(255,255,255,0.9)",
            border: "1px solid rgba(0,0,0,0.35)",
            cursor: "grab",
            zIndex: cfg.z ?? Z_DEFAULT.rect,
          }}
          title="Rotate (Shift = snap 15°)"
        />
      )}
      {isActive && (
        <div
          onMouseDown={onResizeMouseDown}
          style={{
            position: "absolute",
            right: -6,
            bottom: -6,
            width: 12,
            height: 12,
            background: "rgba(255,255,255,0.9)",
            cursor: "nwse-resize",
          }}
        />
      )}
    </div>
  );
}
