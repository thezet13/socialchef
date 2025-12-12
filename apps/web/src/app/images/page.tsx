"use client";

import { FormEvent, useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { apiFetch } from "@/lib/apiClient";
import { getErrorMessage } from "@/lib/getErrorMessage";
import { PRO_FONTS } from "@/config/proFonts";

const CANVAS_WIDTH = 1024;
const CANVAS_HEIGHT = 1024;
const PREVIEW_WIDTH = 300; // сколько хочешь в UI
const PREVIEW_HEIGHT = 300;

const PREVIEW_SCALE_X = PREVIEW_WIDTH / CANVAS_WIDTH;
const PREVIEW_SCALE_Y = PREVIEW_HEIGHT / CANVAS_HEIGHT;

const FONT_WEIGHTS = [
  { label: "Thin", value: 100 },
  { label: "Extra Light", value: 200 },
  { label: "Light", value: 300 },
  { label: "Regular", value: 400 },
  { label: "Medium", value: 500 },
  { label: "Semi Bold", value: 600 },
  { label: "Bold", value: 700 },
  { label: "Extra Bold", value: 800 },
  { label: "Black", value: 900 },
];

type OverlayAlign =
  | "top-left"
  | "top-center"
  | "top-right"
  | "middle-left"
  | "middle-center"
  | "middle-right"
  | "bottom-left"
  | "bottom-center"
  | "bottom-right";

interface OverlayItemConfig {
  text: string;
  color?: string;
  fontSize?: number;
  fontFamily?: string;
  fontWeight?: number;
  align?: OverlayAlign;
  textAlign?: "left" | "center" | "right";
  lineHeight?: number;

  plaqueWidth?: number;
  plaqueColor?: string;
  plaqueBorderColor?: string;
  plaqueBorderWidth?: number;
  borderRadius?: number;

  paddingTop?: number;
  paddingRight?: number;
  paddingBottom?: number;
  paddingLeft?: number;

  marginTop?: number;
  marginRight?: number;
  marginBottom?: number;
  marginLeft?: number;

}

interface GeneratedImage {
  id: string;
  imageUrl: string;
  width: number;
  height: number;
  prompt: string;
  style: string | null;
  tenantId: string;
  createdAt: string;
}

interface ImagesResponse {
  items: GeneratedImage[];
}
function getPreviewPositionStyle(cfg: OverlayItemConfig): React.CSSProperties {
  const {
    align = "top-left",
    marginTop = 40,
    marginRight = 40,
    marginBottom = 40,
    marginLeft = 40,
  } = cfg;

  // margin* храним в координатах CANVAS (1024x1024),
  // а в превью переводим в пиксели 300x300
  const mTop = marginTop;
  const mRight = marginRight;
  const mBottom = marginBottom;
  const mLeft = marginLeft;

  const topPx = mTop * PREVIEW_SCALE_Y;
  const bottomPx = mBottom * PREVIEW_SCALE_Y;
  const leftPx = mLeft * PREVIEW_SCALE_X;
  const rightPx = mRight * PREVIEW_SCALE_X;

  const style: React.CSSProperties = {
    position: "absolute",
  };

  switch (align) {
    case "top-left":
      style.top = topPx;
      style.left = leftPx;
      break;

    case "top-center":
      style.top = topPx;
      style.left = "50%";
      style.transform = "translateX(-50%)";
      break;

    case "top-right":
      style.top = topPx;
      style.right = rightPx;
      break;

    case "middle-left":
      style.top = "50%";
      style.left = leftPx;
      style.transform = "translateY(-50%)";
      break;

    case "middle-center":
      style.top = "50%";
      style.left = "50%";
      style.transform = "translate(-50%, -50%)";
      break;

    case "middle-right":
      style.top = "50%";
      style.right = rightPx;
      style.transform = "translateY(-50%)";
      break;

    case "bottom-left":
      style.bottom = bottomPx;
      style.left = leftPx;
      break;

    case "bottom-center":
      style.bottom = bottomPx;
      style.left = "50%";
      style.transform = "translateX(-50%)";
      break;

    case "bottom-right":
      style.bottom = bottomPx;
      style.right = rightPx;
      break;
  }

  return style;
}



function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace("#", "");
  const r = parseInt(clean.slice(0, 2), 16) || 0;
  const g = parseInt(clean.slice(2, 4), 16) || 0;
  const b = parseInt(clean.slice(4, 6), 16) || 0;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

type OverlayPreviewBoxProps = {
  cfg: OverlayItemConfig;
  onChangeMargins?: (margins: {
    marginTop?: number;
    marginRight?: number;
    marginBottom?: number;
    marginLeft?: number;
  }) => void;
};

function OverlayPreviewBox({ cfg, onChangeMargins }: OverlayPreviewBoxProps) {
  const {
    text,
    color = "#ffffff",
    fontFamily,
    fontSize = 50,
    fontWeight,
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

  if (!text?.trim()) return null;

    // === CANVAS-значения (для 1024x1024) ===
  const padTop = paddingTop ?? 0;
  const padRight = paddingRight ?? 0;
  const padBottom = paddingBottom ?? 0;
  const padLeft = paddingLeft ?? 0;
  const borderWidth = cfg.plaqueBorderWidth ?? 0;
  const radius = borderRadius ?? 0;

  // === Масштабируем в Preview (300x300) ===
  const scaledPadTop = padTop * PREVIEW_SCALE_Y;
  const scaledPadBottom = padBottom * PREVIEW_SCALE_Y;
  const scaledPadLeft = padLeft * PREVIEW_SCALE_X;
  const scaledPadRight = padRight * PREVIEW_SCALE_X;

  const scaledRadius = radius * PREVIEW_SCALE_X;
  const scaledBorderWidth = borderWidth * PREVIEW_SCALE_X;

  const scaledFontSize = fontSize * PREVIEW_SCALE_Y;
  const scaledPlaqueWidth = plaqueWidth
    ? plaqueWidth * PREVIEW_SCALE_X
    : undefined;

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!onChangeMargins) return;

    e.preventDefault();
    e.stopPropagation();

    const startX = e.clientX;
    const startY = e.clientY;

    const startTop = marginTop;
    const startRight = marginRight;
    const startBottom = marginBottom;
    const startLeft = marginLeft;

    const handleMouseMove = (ev: MouseEvent) => {
      const dxScreen = ev.clientX - startX;
      const dyScreen = ev.clientY - startY;

    // учитываем масштаб превью → переводим в координаты канваса 1024x1024
    const dx = dxScreen / PREVIEW_SCALE_X;
    const dy = dyScreen / PREVIEW_SCALE_Y;

    const next: {
    marginTop?: number;
    marginRight?: number;
    marginBottom?: number;
    marginLeft?: number;
    } = {};

      switch (align) {
        case "top-left":
          next.marginTop = startTop + dy;
          next.marginLeft = startLeft + dx;
          break;

        case "top-center":
          next.marginTop = startTop + dy;
          break;

        case "top-right":
          next.marginTop = startTop + dy;
          next.marginRight = startRight - dx;
          break;

        case "middle-left":
          next.marginLeft = startLeft + dx;
          break;

        case "middle-center":
          // можно ничего не менять или придумать свою логику
          next.marginTop = startTop + dy;
          next.marginLeft = startLeft + dx;
          break;

        case "middle-right":
          next.marginRight = startRight - dx;
          break;

        case "bottom-left":
          next.marginBottom = startBottom - dy;
          next.marginLeft = startLeft + dx;
          break;

        case "bottom-center":
          next.marginBottom = startBottom - dy;
          break;

        case "bottom-right":
          next.marginBottom = startBottom - dy;
          next.marginRight = startRight - dx;
          break;
      }

      onChangeMargins(next);
    };

    const handleMouseUp = () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
  };

    const boxStyle: React.CSSProperties = {
    ...getPreviewPositionStyle({
      ...cfg,
      marginTop,
      marginRight,
      marginBottom,
      marginLeft,
      align,
    }),
    paddingTop: scaledPadTop,
    paddingRight: scaledPadRight,
    paddingBottom: scaledPadBottom,
    paddingLeft: scaledPadLeft,
    borderRadius: scaledRadius,
    backgroundColor: plaqueColor ?? "transparent",
    border:
      plaqueColor && plaqueBorderColor && scaledBorderWidth > 0
        ? `${scaledBorderWidth}px solid ${plaqueBorderColor}`
        : "none",
    color,
    fontSize: scaledFontSize,
    fontFamily: fontFamily ?? "Inter",    
    fontWeight,
    textAlign,
    
    boxShadow: plaqueColor
      ? "0 8px 30px rgba(0,0,0,0.2)"
      : "0 4px 12px rgba(0,0,0,0.2)",
    maxWidth: scaledPlaqueWidth ? `${scaledPlaqueWidth}px` : "none",
    width: scaledPlaqueWidth ? `${scaledPlaqueWidth}px` : "auto",
    whiteSpace: plaqueWidth ? "normal" : "nowrap",
    overflowWrap: "break-word",
    cursor: onChangeMargins ? "move" : "default",
    userSelect: "none",

    lineHeight: cfg.lineHeight ? `${cfg.lineHeight}` : "1.2",
    wordBreak: "break-word",

    display: "flex",
    justifyContent: "center",
 
  };


  return (
    <div style={boxStyle} onMouseDown={handleMouseDown}>
      {text}
    </div>
  );
}


export default function ImagesPage() {
    const { user, token, loading, logout } = useAuth();
    const router = useRouter();

    const [images, setImages] = useState<GeneratedImage[]>([]);
    const [loadingImages, setLoadingImages] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [prompt, setPrompt] = useState("");
    const [style, setStyle] = useState("instagram_dark");
    const [title, setTitle] = useState("");
    const [subtitle, setSubtitle] = useState("");
    const [price, setPrice] = useState("");
    const [generating, setGenerating] = useState(false);

    const [uploading, setUploading] = useState(false);
    const fileInputRef = useRef<HTMLInputElement | null>(null);

    //const [showPreview, setShowPreview] = useState(false);

    // TITLE
    const [titleColor, setTitleColor] = useState("#ffffff");
    const [titleFontSize, setTitleFontSize] = useState(50);
    const [titleFontWeight, setTitleFontWeight] = useState(100);
    const [titleAlign, setTitleAlign] = useState<OverlayAlign>("top-left");
    const [titleTextAlign, setTitleTextAlign] = useState<"left" | "center" | "right">("left");
    const [titleLineHeight, setTItleLineHeight] = useState(1.2);

    // TITLE Плашка
    const [titlePlaqueWidth, setTitlePlaqueWidth] = useState(0);
    const [titlePlaqueColor, setTitlePlaqueColor] = useState("#ffffff");
    const [titlePlaqueOpacity, setTitlePlaqueOpacity] = useState(0);
    const [titlePlaqueBorderColor, setTitlePlaqueBorderColor] = useState("#ffffff");
    const [titleBorderRadius, setTitleBorderRadius] = useState(0);
    const [titlePlaqueBorderWidth, setTitlePlaqueBorderWidth] = useState(0);

    // TITLE Padding внутри плашки
    const [titlePaddingTop, setTitlePaddingTop] = useState(10);
    const [titlePaddingRight, setTitlePaddingRight] = useState(16);
    const [titlePaddingBottom, setTitlePaddingBottom] = useState(10);
    const [titlePaddingLeft, setTitlePaddingLeft] = useState(16);

    // TITLE Margin от краёв картинки
    const [titleMarginTop, setTitleMarginTop] = useState(0);
    const [titleMarginRight, setTitleMarginRight] = useState(0);
    const [titleMarginBottom, setTitleMarginBottom] = useState(0);
    const [titleMarginLeft, setTitleMarginLeft] = useState(0);

    // SUBTITLE
    const [subtitleColor, setSubtitleColor] = useState("#e5e7eb");
    const [subtitleFontSize, setSubtitleFontSize] = useState(50);
    const [subtitleFontWeight, setSubtitleFontWeight] = useState(100);
    const [subtitleAlign, setSubtitleAlign] = useState<OverlayAlign>("middle-center");
    const [subtitleTextAlign, setSubtitleTextAlign] = useState<"left" | "center" | "right">("left");
    const [subtitleLineHeight, setSubtitleLineHeight] = useState(1.2);


    // SUBTITLE Плашка
    const [subtitlePlaqueWidth, setSubtitlePlaqueWidth] = useState(0);
    const [subtitlePlaqueColor, setSubtitlePlaqueColor] = useState("#ffffff");
    const [subtitlePlaqueOpacity, setSubtitlePlaqueOpacity] = useState(0);
    const [subtitlePlaqueBorderColor, setSubtitlePlaqueBorderColor] = useState("#ffffff");
    const [subtitleBorderRadius, setSubtitleBorderRadius] = useState(0);
    const [subtitlePlaqueBorderWidth, setSubtitlePlaqueBorderWidth] = useState(0);

    // SUBTITLE Padding внутри плашки
    const [subtitlePaddingTop, setSubtitlePaddingTop] = useState(10);
    const [subtitlePaddingRight, setSubtitlePaddingRight] = useState(16);
    const [subtitlePaddingBottom, setSubtitlePaddingBottom] = useState(10);
    const [subtitlePaddingLeft, setSubtitlePaddingLeft] = useState(16);

    // SUBTITLE Margin от краёв картинки
    const [subtitleMarginTop, setSubtitleMarginTop] = useState(0);
    const [subtitleMarginRight, setSubtitleMarginRight] = useState(0);
    const [subtitleMarginBottom, setSubtitleMarginBottom] = useState(0);
    const [subtitleMarginLeft, setSubtitleMarginLeft] = useState(0);
    
    // PRICE
    const [priceColor, setPriceColor] = useState("#ffffff");
    const [priceFontFamily, setPriceFontFamily] = useState<string>("Inter");
    const [priceFontSize, setPriceFontSize] = useState(50);
    const [priceFontWeight, setPriceFontWeight] = useState(100);
    const [priceAlign, setPriceAlign] = useState<OverlayAlign>("bottom-right");
    const [priceTextAlign, setPriceTextAlign] = useState<"left" | "center" | "right">("left");
    const [priceLineHeight, setPriceLineHeight] = useState(1.2);

    // PRICE Плашка
    const [pricePlaqueWidth, setPricePlaqueWidth] = useState(0);
    const [pricePlaqueColor, setPricePlaqueColor] = useState("#ffffff");
    const [pricePlaqueOpacity, setPricePlaqueOpacity] = useState(0); 
    const [pricePlaqueBorderColor, setPricePlaqueBorderColor] = useState("#ffffff");
    const [priceBorderRadius, setPriceBorderRadius] = useState(0);
    const [pricePlaqueBorderWidth, setPricePlaqueBorderWidth] = useState(0);

    // PRICE Padding внутри плашки
    const [pricePaddingTop, setPricePaddingTop] = useState(10);
    const [pricePaddingRight, setPricePaddingRight] = useState(20);
    const [pricePaddingBottom, setPricePaddingBottom] = useState(10);
    const [pricePaddingLeft, setPricePaddingLeft] = useState(20);

    // PRICE Margin от краёв картинки
    const [priceMarginTop, setPriceMarginTop] = useState(40);
    const [priceMarginRight, setPriceMarginRight] = useState(40);
    const [priceMarginBottom, setPriceMarginBottom] = useState(40);
    const [priceMarginLeft, setPriceMarginLeft] = useState(40);

    const [proDesignId, setProDesignId] = useState<string | null>(null);
    const [proBaseImageUrl, setProBaseImageUrl] = useState<string | null>(null);
    const [proWidth, setProWidth] = useState<number>(CANVAS_WIDTH);
    const [proHeight, setProHeight] = useState<number>(CANVAS_HEIGHT);

    const computedTitlePlaqueColor =
    titlePlaqueOpacity > 0
        ? hexToRgba(titlePlaqueColor || "#000000", titlePlaqueOpacity)
        : undefined;
    const computedTitlePlaqueBorderColor =
        titlePlaqueBorderColor && titlePlaqueOpacity > 0
        ? hexToRgba(titlePlaqueBorderColor, titlePlaqueOpacity)
        : undefined;

    const titleOverlayCfg: OverlayItemConfig | undefined = title
  ? {
        text: title,
        color: titleColor || undefined,
        fontSize: titleFontSize || undefined,
        fontFamily: priceFontFamily || "Inter",
        fontWeight: titleFontWeight || undefined,
        align: titleAlign,
        textAlign: titleTextAlign,
        lineHeight: titleLineHeight,
        plaqueColor: computedTitlePlaqueColor,
        plaqueBorderColor: computedTitlePlaqueBorderColor,
        plaqueBorderWidth: titlePlaqueBorderWidth || 0,
        borderRadius: titleBorderRadius || undefined,
        paddingTop: titlePaddingTop || undefined,
        paddingRight: titlePaddingRight || undefined,
        paddingBottom: titlePaddingBottom || undefined,
        paddingLeft: titlePaddingLeft || undefined,
        marginTop: titleMarginTop || undefined,
        marginRight: titleMarginRight || undefined,
        marginBottom: titleMarginBottom || undefined,
        marginLeft: titleMarginLeft || undefined,
    }
  : undefined;

    const computedSubtitlePlaqueColor =
    subtitlePlaqueOpacity > 0
        ? hexToRgba(subtitlePlaqueColor || "#000000", subtitlePlaqueOpacity)
        : undefined;
    const computedSubtitlePlaqueBorderColor =
        subtitlePlaqueBorderColor && subtitlePlaqueOpacity > 0
        ? hexToRgba(subtitlePlaqueBorderColor, subtitlePlaqueOpacity)
        : undefined;

    const subtitleOverlayCfg: OverlayItemConfig | undefined = subtitle
    ? {
        text: subtitle,
        color: subtitleColor || undefined,
        fontSize: subtitleFontSize || undefined,
        fontFamily: priceFontFamily || "Inter",
        fontWeight: subtitleFontWeight || undefined,
        align: subtitleAlign,
        textAlign: subtitleTextAlign,
        lineHeight: subtitleLineHeight,
        plaqueColor: computedSubtitlePlaqueColor,
        plaqueBorderColor: computedSubtitlePlaqueBorderColor,
        plaqueBorderWidth: subtitlePlaqueBorderWidth || 0,
        borderRadius: subtitleBorderRadius || undefined,
        paddingTop: subtitlePaddingTop || undefined,
        paddingRight: subtitlePaddingRight || undefined,
        paddingBottom: subtitlePaddingBottom || undefined,
        paddingLeft: subtitlePaddingLeft || undefined,
        marginTop: subtitleMarginTop || undefined,
        marginRight: subtitleMarginRight || undefined,
        marginBottom: subtitleMarginBottom || undefined,
        marginLeft: subtitleMarginLeft || undefined,
        }
    : undefined;

    const computedPricePlaqueColor =
        pricePlaqueOpacity > 0
            ? hexToRgba(pricePlaqueColor || "#000000", pricePlaqueOpacity)
            : undefined;
        const computedPricePlaqueBorderColor =
            pricePlaqueBorderColor && pricePlaqueOpacity > 0
            ? hexToRgba(pricePlaqueBorderColor, pricePlaqueOpacity)
            : undefined;

    const priceOverlayCfg: OverlayItemConfig | undefined = price
    ? {
        text: price,
        color: priceColor || undefined,
        fontSize: priceFontSize || undefined,
        fontFamily: priceFontFamily || "Inter",
        fontWeight: priceFontWeight || undefined,
        align: priceAlign,
        lineHeight: priceLineHeight,
        textAlign: priceTextAlign,
        plaqueWidth: pricePlaqueWidth || undefined,
        plaqueColor: computedPricePlaqueColor,
        plaqueBorderColor: computedPricePlaqueBorderColor,
        plaqueBorderWidth: pricePlaqueBorderWidth || 0,
        borderRadius: priceBorderRadius || undefined,
        paddingTop: pricePaddingTop || undefined,
        paddingRight: pricePaddingRight || undefined,
        paddingBottom: pricePaddingBottom || undefined,
        paddingLeft: pricePaddingLeft || undefined,
        marginRight: priceMarginRight,
        marginBottom: priceMarginBottom,
        marginTop: priceMarginTop,
        marginLeft: priceMarginLeft,    
    }
    : undefined;



    type OverlayAlign =
        | "top-left"
        | "top-center"
        | "top-right"
        | "middle-left"
        | "middle-center"
        | "middle-right"
        | "bottom-left"
        | "bottom-center"
        | "bottom-right";

    
  useEffect(() => {
    if (!loading && !token) {
      router.push("/login");
    }
  }, [loading, token, router]);

  useEffect(() => {
    if (!token) return;
    setLoadingImages(true);
    apiFetch<ImagesResponse>("/images", { token })
      .then((res) => setImages(res.items))
      .catch((err) => setError(err.message ?? "Failed to load images"))
      .finally(() => setLoadingImages(false));
  }, [token]);








async function handleUploadSelectedFile(file: File) {
  if (!token) return;

  setError(null);
  setUploading(true);

  try {
    const apiBase = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4001";

    const formData = new FormData();
    formData.append("file", file);
    // если захочешь — можно сюда же докинуть prompt/style
    // formData.append("prompt", prompt);
    // formData.append("style", style);

    const res = await fetch(`${apiBase}/ai/pro-images/upload`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: formData,
    });

    if (!res.ok) {
      const data = await res.json().catch(() => null);
      throw new Error(data?.error || "Failed to upload image");
    }

    const data: {
      id: string;
      baseImageUrl: string;
      width: number;
      height: number;
    } = await res.json();

    setProDesignId(data.id);
    setProBaseImageUrl(`${apiBase}${data.baseImageUrl}`);
    setProWidth(data.width);
    setProHeight(data.height);
  } catch (err) {
    setError(getErrorMessage(err));
  } finally {
    setUploading(false);
  }
}



async function handleGenerate(e: FormEvent) {
  e.preventDefault();
  if (!token) return;
  if (!prompt) {
    setError("Prompt is required");
    return;
  }

  setError(null);
  setGenerating(true);

  try {
    const res = await apiFetch<{
      id: string;
      baseImageUrl: string;
      width: number;
      height: number;
    }>("/ai/pro-images/base", {
      method: "POST",
      token,
      body: {
        prompt,
        style,
        width: CANVAS_WIDTH,
        height: CANVAS_HEIGHT,
      },
    });

    setProDesignId(res.id);
    setProBaseImageUrl(`${apiBase}${res.baseImageUrl}`);
    setProWidth(res.width);
    setProHeight(res.height);

    // Можно не трогать список images — Pro-mode живёт в превью
  } catch (err) {
    setError(getErrorMessage(err));
  } finally {
    setGenerating(false);
  }
}

async function handleRenderPro() {
  if (!token || !proDesignId) return;

  setError(null);

  try {
    const res = await apiFetch<{
      proDesignId: string;
      finalImageUrl: string;
      generatedImageId: string;
    }>(`/ai/pro-images/${proDesignId}/render`, {
      method: "POST",
      token,
      body: {
        overlay: {
          title: titleOverlayCfg,
          subtitle: subtitleOverlayCfg,
          price: priceOverlayCfg,
        },
      },
    });

    // подхватываем финальную картинку в общий список изображений
    setImages((prev) => [
      {
        id: res.generatedImageId,
        imageUrl: res.finalImageUrl,
        width: proWidth,
        height: proHeight,
        prompt,
        style,
        tenantId: user?.id || "", 
        createdAt: new Date().toISOString(),
      },
      ...prev,
    ]);
  } catch (err) {
    setError(getErrorMessage(err));
  }
}

async function handleDeleteImage(id: string) {
  if (!token) return;
  setError(null);

  try {
    await apiFetch(`/images/${id}`, {
      method: "DELETE",
      token,
    });

    // Оптимистично удаляем из стейта
    setImages((prev) => prev.filter((img) => img.id !== id));
  } catch (err) {
    setError(getErrorMessage(err));
  }
}


//for simple generation 
//async function handleGenerate(e: FormEvent) {
//     e.preventDefault();
//     if (!token) return;
//     if (!prompt) {
//         setError("Prompt is required");
//         return;
//     }

//   setError(null);
//   setGenerating(true);

//   try {
//     const res = await apiFetch<GeneratedImage>("/ai/images/generate", {
//       method: "POST",
//       token,
//       body: {
//         prompt,
//         style,
//         overlay: {
//           title: title
//             ? {
//                 text: title,
//                 color: titleColor || undefined,
//                 fontSize: titleFontSize || undefined,
//                 fontWeight: titleFontWeight || undefined,
//                 align: titleAlign,
//                 textAlign: priceTextAlign,

//                 plaqueColor: computedTitlePlaqueColor,
//                 plaqueBorderColor: computedTitlePlaqueBorderColor,
//                 borderRadius: titleBorderRadius || undefined,
//                 plaqueBorderWidth: titlePlaqueBorderWidth || 0,

//                 paddingTop: titlePaddingTop || undefined,
//                 paddingRight: titlePaddingRight || undefined,
//                 paddingBottom: titlePaddingBottom || undefined,
//                 paddingLeft: titlePaddingLeft || undefined,

//                 marginTop: titleMarginTop || undefined,
//                 marginRight: titleMarginRight || undefined,
//                 marginBottom: titleMarginBottom || undefined,
//                 marginLeft: titleMarginLeft || undefined,
//               }
//             : undefined,
//           subtitle: subtitle
//             ? {
//                 text: subtitle,
//                 color: subtitleColor || undefined,
//                 fontSize: subtitleFontSize || undefined,
//                 fontWeight: subtitleFontWeight || undefined,
//                 align: subtitleAlign,
//                 textAlign: priceTextAlign,

//                 plaqueColor: computedSubtitlePlaqueColor,
//                 plaqueBorderColor: computedSubtitlePlaqueBorderColor,
//                 borderRadius: subtitleBorderRadius || undefined,
//                 plaqueBorderWidth: subtitlePlaqueBorderWidth || 0,

//                 paddingTop: subtitlePaddingTop || undefined,
//                 paddingRight: subtitlePaddingRight || undefined,
//                 paddingBottom: subtitlePaddingBottom || undefined,
//                 paddingLeft: subtitlePaddingLeft || undefined,

//                 marginTop: subtitleMarginTop || undefined,
//                 marginRight: subtitleMarginRight || undefined,
//                 marginBottom: subtitleMarginBottom || undefined,
//                 marginLeft: subtitleMarginLeft || undefined,
//               }
//             : undefined,
//           price: price
//             ? {
//                 text: price,
//                 color: priceColor || undefined,
//                 fontSize: priceFontSize || undefined,
//                 fontWeight: priceFontWeight || undefined,
//                 align: priceAlign,
//                 textAlign: priceTextAlign,

//                 plaqueWidth: pricePlaqueWidth || undefined,
//                 plaqueColor: computedPricePlaqueColor,
//                 plaqueBorderColor: computedPricePlaqueBorderColor,
//                 borderRadius: priceBorderRadius || undefined,
//                 plaqueBorderWidth: pricePlaqueBorderWidth || 0,

//                 paddingTop: pricePaddingTop || undefined,
//                 paddingRight: pricePaddingRight || undefined,
//                 paddingBottom: pricePaddingBottom || undefined,
//                 paddingLeft: pricePaddingLeft || undefined,

//                 marginTop: priceMarginTop || undefined,
//                 marginRight: priceMarginRight || undefined,
//                 marginBottom: priceMarginBottom || undefined,
//                 marginLeft: priceMarginLeft || undefined,
//                 }
//             : undefined,
//         },
//       },
//     });

//     setImages((prev) => [res, ...prev]);

//   } catch (err) {
//     setError(getErrorMessage(err));
//   } finally {
//     setGenerating(false);
//   }
// }  

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950">
        <div className="text-slate-300 text-sm">Loading...</div>
      </div>
    );
  }

  if (!token) return null;

  const apiBase = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4001";

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50">
      <header className="border-b border-slate-800 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">SocialChef Images</h1>
          <p className="text-xs text-slate-400">
            {user?.fullName || user?.email}
          </p>
        </div>
        <div className="flex gap-3 items-center">
          <button
            onClick={() => router.push("/dashboard")}
            className="text-xs px-3 py-1 rounded-md border border-slate-700 hover:bg-slate-800"
          >
            Dashboard
          </button>
          <button
            onClick={logout}
            className="text-xs px-3 py-1 rounded-md border border-slate-700 hover:bg-slate-800"
          >
            Logout
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        {error && (
          <div className="text-sm text-red-400 bg-red-900/20 border border-red-800 rounded-md px-3 py-2">
            {error}
          </div>
        )}

        <section className="bg-slate-900 border border-slate-800 rounded-2xl p-4 text-sm">
          <h2 className="text-sm font-semibold mb-3">Generate image</h2>

          <form onSubmit={handleGenerate} className="space-y-3">
            <div>
              <label className="block text-xs mb-1">Prompt (dish / scene)</label>
              <textarea
                className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-xs min-h-[60px]"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="e.g. BBQ burger on dark wooden table, moody lighting"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs mb-1">Style</label>
                <select
                  className="w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs"
                  value={style}
                  onChange={(e) => setStyle(e.target.value)}
                >
                  <option value="instagram_dark">Instagram dark</option>
                  <option value="clean_white">Clean white</option>
                  <option value="rustic">Rustic</option>
                  <option value="premium">Premium</option>
                </select>
              </div>
            </div>
              
            <div className="flex gap-3">
              {/* TITLE SETTINGS */}
                <div className="w-[33%] border border-slate-800 rounded-xl p-3 space-y-2">
                <div className="text-xs font-semibold text-slate-200">Text 1</div>

                <input
                    className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-1.5 text-base"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g. New Burger BBQ"
                />

                {/* Цвет и размер текста */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <div>
                    <label className="block text-[10px] mb-1 text-slate-400">
                        Text color
                    </label>
                    <div className="flex items-center gap-2">
                        <input
                        type="color"
                        value={titleColor}
                        onChange={(e) => setTitleColor(e.target.value)}
                        className="w-9 h-6 rounded p-0"
                        />
                        {/* <input
                        className="flex-1 rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-[10px]"
                        value={titleColor}
                        onChange={(e) => setTitleColor(e.target.value)}
                        /> */}
                    </div>
                    </div>

                    <div>
                    <label className="block text-[10px] mb-1 text-slate-400">
                        Font size (px)
                    </label>
                    <input
                        type="number"
                        min={10}
                        max={200}
                        value={titleFontSize}
                        onChange={(e) => setTitleFontSize(Number(e.target.value) || 0)}
                        className="rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-[10px]"
                    />
                    </div>

                    <div>
                    <label className="block text-[10px] mb-1 text-slate-400">
                        Font weight
                    </label>
                    <select
                        value={titleFontWeight}
                        onChange={(e) => setTitleFontWeight(Number(e.target.value))}
                        className="rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-[10px]"
                        >
                        {FONT_WEIGHTS.map((fw) => (
                            <option key={fw.value} value={fw.value}>
                            {fw.label}
                            </option>
                        ))}
                        </select>
                    </div>


                </div>



                {/* Цвет плашки + обводка */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div>
                    <label className="block text-[10px] mb-1 text-slate-400">
                        Plaque color
                    </label>
                    <div className="flex items-center gap-2">
                        <input
                        type="color"
                        value={titlePlaqueColor}
                        onChange={(e) => setTitlePlaqueColor(e.target.value)}
                        className="w-9 h-6 rounded p-0"
                        />
                        {/* <input
                        className="flex-1 rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-[10px]"
                        value={titlePlaqueColor}
                        onChange={(e) => setTitlePlaqueColor(e.target.value)}
                        /> */}
                    </div>
                    </div>

                    <div>
                    <label className="block text-[10px] mb-1 text-slate-400">
                        Plaque border color
                    </label>
                    <div className="flex items-center gap-2">
                        <input
                        type="color"
                        value={titlePlaqueBorderColor}
                        onChange={(e) => setTitlePlaqueBorderColor(e.target.value)}
                        className="w-9 h-6 rounded p-0"
                        />
                        {/* <input
                        className="flex-1 rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-[10px]"
                        value={titlePlaqueBorderColor}
                        onChange={(e) => setTitlePlaqueBorderColor(e.target.value)}
                        /> */}
                    </div>
                    </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {/* Border size */}
                    <div>
                    <label className="block text-[10px] mb-1 text-slate-400">
                        Border size (px)
                    </label>
                    <input
                        type="number"
                        min={0}
                        max={50}
                        value={titlePlaqueBorderWidth}
                        onChange={(e) => setTitlePlaqueBorderWidth(Number(e.target.value))}
                        className="rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-[10px]"
                    />
                    </div>

                {/* Border radius */}
                <div>
                    <label className="block text-[10px] mb-1 text-slate-400">
                    Border radius (px)
                    </label>
                    <input
                    type="number"
                    min={0}
                    max={64}
                    value={titleBorderRadius}
                    onChange={(e) => setTitleBorderRadius(Number(e.target.value) || 0)}
                    className="rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-[10px]"
                    />
                </div>
                </div>

                {/* Padding */}
                <div>
                    <label className="block text-[10px] mb-1 text-slate-400">
                    Padding (plaque)
                    </label>
                    <div className="grid grid-cols-4 gap-1">
                    <input
                        type="number"
                        className="rounded-md border border-slate-700 bg-slate-950 px-1 py-1 text-[10px]"
                        value={titlePaddingTop}
                        onChange={(e) => setTitlePaddingTop(Number(e.target.value) || 0)}
                        placeholder="Top"
                    />
                    <input
                        type="number"
                        className="rounded-md border border-slate-700 bg-slate-950 px-1 py-1 text-[10px]"
                        value={titlePaddingRight}
                        onChange={(e) => setTitlePaddingRight(Number(e.target.value) || 0)}
                        placeholder="Right"
                    />
                    <input
                        type="number"
                        className="rounded-md border border-slate-700 bg-slate-950 px-1 py-1 text-[10px]"
                        value={titlePaddingBottom}
                        onChange={(e) => setTitlePaddingBottom(Number(e.target.value) || 0)}
                        placeholder="Bottom"
                    />
                    <input
                        type="number"
                        className="rounded-md border border-slate-700 bg-slate-950 px-1 py-1 text-[10px]"
                        value={titlePaddingLeft}
                        onChange={(e) => setTitlePaddingLeft(Number(e.target.value) || 0)}
                        placeholder="Left"
                    />
                    </div>
                </div>

                {/* Margin */}
                <div>
                    <label className="block text-[10px] mb-1 text-slate-400">
                    Margin (from canvas edges)
                    </label>
                    <div className="grid grid-cols-4 gap-1">
                    <input
                        type="number"
                        className="rounded-md border border-slate-700 bg-slate-950 px-1 py-1 text-[10px]"
                        value={titleMarginTop}
                        onChange={(e) => setTitleMarginTop(Number(e.target.value) || 0)}
                        placeholder="Top"
                    />
                    <input
                        type="number"
                        className="rounded-md border border-slate-700 bg-slate-950 px-1 py-1 text-[10px]"
                        value={titleMarginRight}
                        onChange={(e) => setTitleMarginRight(Number(e.target.value) || 0)}
                        placeholder="Right"
                    />
                    <input
                        type="number"
                        className="rounded-md border border-slate-700 bg-slate-950 px-1 py-1 text-[10px]"
                        value={titleMarginBottom}
                        onChange={(e) => setTitleMarginBottom(Number(e.target.value) || 0)}
                        placeholder="Bottom"
                    />
                    <input
                        type="number"
                        className="rounded-md border border-slate-700 bg-slate-950 px-1 py-1 text-[10px]"
                        value={titleMarginLeft}
                        onChange={(e) => setTitleMarginLeft(Number(e.target.value) || 0)}
                        placeholder="Left"
                    />
                    </div>
                </div>
                </div>



                {/* SUBTITLE SETTINGS */}
                <div className="w-[33%] border border-slate-800 rounded-xl p-3 space-y-2">
                <div className="text-xs font-semibold text-slate-200">Text 2</div>

                <input
                    className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-1.5 text-base"
                    value={subtitle}
                    onChange={(e) => setSubtitle(e.target.value)}
                    placeholder="e.g. Discount -20%"
                />

                {/* Цвет и размер текста */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <div>
                    <label className="block text-[10px] mb-1 text-slate-400">
                        Text color
                    </label>
                    <div className="flex items-center gap-2">
                        <input
                        type="color"
                        value={subtitleColor}
                        onChange={(e) => setSubtitleColor(e.target.value)}
                        className="w-9 h-6 rounded p-0"
                        />
                        {/* <input
                        className="flex-1 rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-[10px]"
                        value={subtitleColor}
                        onChange={(e) => setSubtitleColor(e.target.value)}
                        /> */}
                    </div>
                    </div>

                    <div>
                    <label className="block text-[10px] mb-1 text-slate-400">
                        Font size (px)
                    </label>
                    <input
                        type="number"
                        min={10}
                        max={200}
                        value={subtitleFontSize}
                        onChange={(e) => setSubtitleFontSize(Number(e.target.value) || 0)}
                        className="rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-[10px]"
                    />
                    </div>

                    <div>
                    <label className="block text-[10px] mb-1 text-slate-400">
                        Font weight
                    </label>
                    <select
                        value={subtitleFontWeight}
                        onChange={(e) => setSubtitleFontWeight(Number(e.target.value))}
                        className="rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-[10px]"
                        >
                        {FONT_WEIGHTS.map((fw) => (
                            <option key={fw.value} value={fw.value}>
                            {fw.label}
                            </option>
                        ))}
                        </select>
                    </div>
                </div>

                {/* Цвет плашки + обводка */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div>
                    <label className="block text-[10px] mb-1 text-slate-400">
                        Plaque color
                    </label>
                    <div className="flex items-center gap-2">
                        <input
                        type="color"
                        value={subtitlePlaqueColor}
                        onChange={(e) => setSubtitlePlaqueColor(e.target.value)}
                        className="w-9 h-6 rounded p-0"
                        />
                        {/* <input
                        className="flex-1 rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-[10px]"
                        value={subtitlePlaqueColor}
                        onChange={(e) => setSubtitlePlaqueColor(e.target.value)}
                        /> */}
                    </div>
                    </div>

                    <div>
                    <label className="block text-[10px] mb-1 text-slate-400">
                        Plaque border color
                    </label>
                    <div className="flex items-center gap-2">
                        <input
                        type="color"
                        value={subtitlePlaqueBorderColor}
                        onChange={(e) => setSubtitlePlaqueBorderColor(e.target.value)}
                        className="w-9 h-6 rounded p-0"
                        />
                        {/* <input
                        className="flex-1 rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-[10px]"
                        value={subtitlePlaqueBorderColor}
                        onChange={(e) => setSubtitlePlaqueBorderColor(e.target.value)}
                        /> */}
                    </div>
                    </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {/* Border size */}
                    <div>
                    <label className="block text-[10px] mb-1 text-slate-400">
                        Border size (px)
                    </label>
                    <input
                        type="number"
                        min={0}
                        max={50}
                        value={subtitlePlaqueBorderWidth}
                        onChange={(e) => setSubtitlePlaqueBorderWidth(Number(e.target.value))}
                        className="rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-[10px]"
                    />
                    </div>

                {/* Border radius */}
                <div>
                    <label className="block text-[10px] mb-1 text-slate-400">
                    Border radius (px)
                    </label>
                    <input
                    type="number"
                    min={0}
                    max={64}
                    value={subtitleBorderRadius}
                    onChange={(e) => setSubtitleBorderRadius(Number(e.target.value) || 0)}
                    className="rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-[10px]"
                    />
                </div>
                </div>

                {/* Padding */}
                <div>
                    <label className="block text-[10px] mb-1 text-slate-400">
                    Padding (plaque)
                    </label>
                    <div className="grid grid-cols-4 gap-1">
                    <input
                        type="number"
                        className="rounded-md border border-slate-700 bg-slate-950 px-1 py-1 text-[10px]"
                        value={subtitlePaddingTop}
                        onChange={(e) => setSubtitlePaddingTop(Number(e.target.value) || 0)}
                        placeholder="Top"
                    />
                    <input
                        type="number"
                        className="rounded-md border border-slate-700 bg-slate-950 px-1 py-1 text-[10px]"
                        value={subtitlePaddingRight}
                        onChange={(e) => setSubtitlePaddingRight(Number(e.target.value) || 0)}
                        placeholder="Right"
                    />
                    <input
                        type="number"
                        className="rounded-md border border-slate-700 bg-slate-950 px-1 py-1 text-[10px]"
                        value={subtitlePaddingBottom}
                        onChange={(e) => setSubtitlePaddingBottom(Number(e.target.value) || 0)}
                        placeholder="Bottom"
                    />
                    <input
                        type="number"
                        className="rounded-md border border-slate-700 bg-slate-950 px-1 py-1 text-[10px]"
                        value={subtitlePaddingLeft}
                        onChange={(e) => setSubtitlePaddingLeft(Number(e.target.value) || 0)}
                        placeholder="Left"
                    />
                    </div>
                </div>

                {/* Margin */}
                <div>
                    <label className="block text-[10px] mb-1 text-slate-400">
                    Margin (from canvas edges)
                    </label>
                    <div className="grid grid-cols-4 gap-1">
                    <input
                        type="number"
                        className="rounded-md border border-slate-700 bg-slate-950 px-1 py-1 text-[10px]"
                        value={subtitleMarginTop}
                        onChange={(e) => setSubtitleMarginTop(Number(e.target.value) || 0)}
                        placeholder="Top"
                    />
                    <input
                        type="number"
                        className="rounded-md border border-slate-700 bg-slate-950 px-1 py-1 text-[10px]"
                        value={subtitleMarginRight}
                        onChange={(e) => setSubtitleMarginRight(Number(e.target.value) || 0)}
                        placeholder="Right"
                    />
                    <input
                        type="number"
                        className="rounded-md border border-slate-700 bg-slate-950 px-1 py-1 text-[10px]"
                        value={subtitleMarginBottom}
                        onChange={(e) => setSubtitleMarginBottom(Number(e.target.value) || 0)}
                        placeholder="Bottom"
                    />
                    <input
                        type="number"
                        className="rounded-md border border-slate-700 bg-slate-950 px-1 py-1 text-[10px]"
                        value={subtitleMarginLeft}
                        onChange={(e) => setSubtitleMarginLeft(Number(e.target.value) || 0)}
                        placeholder="Left"
                    />
                    </div>
                </div>
                </div>




                {/* PRICE SETTINGS */}
                <div className="w-[33%] border border-slate-800 rounded-xl p-3 space-y-3">
                <div className="text-xs font-semibold text-slate-200">Text 3</div>

                {/* Текст цены */}
                <input
                    className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-1.5 text-base"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    placeholder="e.g. 4.90₼"
                />

                {/* Цвет и размер текста */}
                <div className="flex gap-2">
                    <div>
                        <label className="block text-[10px] mb-1 text-slate-400">
                            Text color
                        </label>
                        <div className="flex items-center gap-2">
                            <input
                            type="color"
                            value={priceColor}
                            onChange={(e) => setPriceColor(e.target.value)}
                            className="w-9 h-6 rounded p-0"
                            />
                            {/* <input
                            className="flex-1 rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-[10px]"
                            value={priceColor}
                            onChange={(e) => setPriceColor(e.target.value)}
                            /> */}
                        </div>
                    </div>

                     <div>
                        <label className="block text-[10px] mb-1 text-slate-400">
                            Font
                        </label>
                        <div className="flex items-center gap-1">
                            <select
                            value={priceFontFamily}
                            className="rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-[10px]"
                            onChange={(e) => setPriceFontFamily(e.target.value)}
                            >
                            {PRO_FONTS.map((font) => (
                                <option key={font.id} value={font.family}>
                                {font.label}
                                </option>
                            ))}
                            </select>

                        </div>
                    </div>

                    <div>
                        <label className="block text-[10px] mb-1 text-slate-400">
                            Font size (px)
                        </label>

                        <div className="flex items-center gap-1">
                            <input
                            type="number"
                            min={10}
                            max={175}
                            value={priceFontSize}
                            onChange={(e) => setPriceFontSize(Number(e.target.value) || 0)}
                            className="w-12 rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-[10px]"
                            />
                            <div className="flex gap-1">
                            {[50, 75, 95].map((size) => (
                                <button
                                key={size}
                                type="button"
                                onClick={() => setPriceFontSize(size)}
                                className={`
                                    px-2 py-1 rounded-md border text-[10px]
                                    ${
                                    priceFontSize === size
                                        ? "border-emerald-500 text-emerald-400 bg-slate-900"
                                        : "border-slate-700 text-slate-300 hover:border-slate-500"
                                    }
                                `}
                                >
                                {size}
                                </button>
                            ))}
                            </div>
                        </div>
                        <div>
                        <label className="block text-[10px] mb-1 text-slate-400">
                            Font weight
                        </label>
                        <select
                            value={priceFontWeight}
                            onChange={(e) => setPriceFontWeight(Number(e.target.value))}
                            className="rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-[10px]"
                            >
                            {FONT_WEIGHTS.map((fw) => (
                                <option key={fw.value} value={fw.value} >
                                {fw.label}
                                </option>
                            ))}
                            </select>
                        </div>

                    <div className="flex flex-col gap-1">
                    <label className="text-[10px] text-slate-400">Line height</label>
                    <input
                        type="number"
                        min={0.6}
                        max={3}
                        step={0.1}
                        value={priceLineHeight}
                        onChange={(e) => setPriceLineHeight(Number(e.target.value))}
                        className="rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-[10px]"
                    />
                    </div>
                    </div>
                    
                    
                </div>

                <div>
                    <label className="block text-[10px] mb-1 text-slate-400">
                        Text align
                    </label>
                    <select
                        value={priceTextAlign}
                        onChange={(e) =>
                        setPriceTextAlign(e.target.value as "left" | "center" | "right")
                        }
                        className="w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-[10px]"
                    >
                        <option value="left">Left</option>
                        <option value="center">Center</option>
                        <option value="right">Right</option>
                    </select>
                </div>

                <div className="flex gap-2">
                {/* Plaque width */}
                    <label className="block text-[10px] mb-1 text-slate-400">
                        Plaque width (px)
                    </label>
                    <input
                        type="number"
                        min={0}
                        max={1000}
                        value={pricePlaqueWidth}
                        onChange={(e) => setPricePlaqueWidth(Number(e.target.value))}
                        className="rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-[10px]"
                    />
                    </div>

                {/* Цвет плашки + обводка */}
                <div className="flex gap-2">
                    <div>
                    <label className="block text-[10px] mb-1 text-slate-400">
                        Plaque color
                    </label>
                    <div className="flex items-center gap-2">
                        <input
                        type="color"
                        value={pricePlaqueColor}
                        onChange={(e) => setPricePlaqueColor(e.target.value)}
                        className="w-9 h-6 rounded p-0"
                        />
                        {/* <input
                        className="flex-1 rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-[10px]"
                        value={pricePlaqueColor}w-9 h-6
                        onChange={(e) => setPricePlaqueColor(e.target.value)}
                        /> */}
                    </div>
                    </div>

                    <div>
                    <label className="block text-[10px] mb-1 text-slate-400">
                        Plaque border color
                    </label>
                    <div className="flex items-center gap-2">
                        <input
                        type="color"
                        value={pricePlaqueBorderColor}
                        onChange={(e) => setPricePlaqueBorderColor(e.target.value)}
                        className="w-9 h-6 rounded p-0"
                        />
                        {/* <input
                        className="flex-1 rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-[10px]"
                        value={pricePlaqueBorderColor}
                        onChange={(e) => setPricePlaqueBorderColor(e.target.value)}
                        /> */}
                    </div>
                    </div>
                </div>

                <div>
                <label className="block text-[10px] mb-1 text-slate-400">
                Opacity ({Math.round(pricePlaqueOpacity * 100)}%)
                </label>
                <input
                type="number"
                min={0}
                max={100}
                value={Math.round(pricePlaqueOpacity * 100)}
                onChange={(e) =>
                    setPricePlaqueOpacity(
                    Math.min(100, Math.max(0, Number(e.target.value) || 0)) / 100
                    )
                }
                className="w-20 rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-[10px]"
                />
            </div>

                <div className="flex gap-2">
                {/* Border size */}
                    <div>
                    <label className="block text-[10px] mb-1 text-slate-400">
                        Border size (px)
                    </label>
                    <input
                        type="number"
                        min={0}
                        max={50}
                        value={pricePlaqueBorderWidth}
                        onChange={(e) => setPricePlaqueBorderWidth(Number(e.target.value))}
                        className="rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-[10px]"
                    />
                    </div>

                {/* Border radius */}
                <div>
                    <label className="block text-[10px] mb-1 text-slate-400">
                    Border radius (px)
                    </label>
                    <input
                    type="number"
                    min={0}
                    max={64}
                    value={priceBorderRadius}
                    onChange={(e) => setPriceBorderRadius(Number(e.target.value) || 0)}
                    className="rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-[10px]"
                    />
                </div>
                </div>

                {/* Padding */}
                <div>
                    <label className="block text-[10px] mb-1 text-slate-400">
                    Padding (plaque)
                    </label>
                    <div className="grid grid-cols-4 gap-1">
                    <input
                        type="number"
                        className="rounded-md border border-slate-700 bg-slate-950 px-1 py-1 text-[10px]"
                        value={pricePaddingTop}
                        onChange={(e) => setPricePaddingTop(Number(e.target.value) || 0)}
                        placeholder="Top"
                    />
                    <input
                        type="number"
                        className="rounded-md border border-slate-700 bg-slate-950 px-1 py-1 text-[10px]"
                        value={pricePaddingRight}
                        onChange={(e) => setPricePaddingRight(Number(e.target.value) || 0)}
                        placeholder="Right"
                    />
                    <input
                        type="number"
                        className="rounded-md border border-slate-700 bg-slate-950 px-1 py-1 text-[10px]"
                        value={pricePaddingBottom}
                        onChange={(e) => setPricePaddingBottom(Number(e.target.value) || 0)}
                        placeholder="Bottom"
                    />
                    <input
                        type="number"
                        className="rounded-md border border-slate-700 bg-slate-950 px-1 py-1 text-[10px]"
                        value={pricePaddingLeft}
                        onChange={(e) => setPricePaddingLeft(Number(e.target.value) || 0)}
                        placeholder="Left"
                    />
                    </div>
                </div>

                {/* Margin */}
                <div>
                    <label className="block text-[10px] mb-1 text-slate-400">
                    Margin (from canvas edges)
                    </label>
                    <div className="grid grid-cols-4 gap-1">
                    <input
                        type="number"
                        className="rounded-md border border-slate-700 bg-slate-950 px-1 py-1 text-[10px]"
                        value={priceMarginTop}
                        onChange={(e) => setPriceMarginTop(Number(e.target.value) || 0)}
                        placeholder="Top"
                    />
                    <input
                        type="number"
                        className="rounded-md border border-slate-700 bg-slate-950 px-1 py-1 text-[10px]"
                        value={priceMarginRight}
                        onChange={(e) => setPriceMarginRight(Number(e.target.value) || 0)}
                        placeholder="Right"
                    />
                    <input
                        type="number"
                        className="rounded-md border border-slate-700 bg-slate-950 px-1 py-1 text-[10px]"
                        value={priceMarginBottom}
                        onChange={(e) => setPriceMarginBottom(Number(e.target.value) || 0)}
                        placeholder="Bottom"
                    />
                    <input
                        type="number"
                        className="rounded-md border border-slate-700 bg-slate-950 px-1 py-1 text-[10px]"
                        value={priceMarginLeft}
                        onChange={(e) => setPriceMarginLeft(Number(e.target.value) || 0)}
                        placeholder="Left"
                    />
                    </div>
                </div>
                </div>
            </div>

            {/* <button
              type="submit"
              disabled={generating}
              className="rounded-md bg-emerald-500 hover:bg-emerald-400 text-slate-900 font-medium px-4 py-1.5 text-xs disabled:opacity-60"
            >
              {generating ? "Generating base..." : "Generate image"}
            </button> */}

            {/* скрытый file input */}
            <input
            type="file"
            accept="image/*"
            ref={fileInputRef}
            className="hidden"
            onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                void handleUploadSelectedFile(file);
                // чтобы можно было выбрать тот же файл ещё раз
                e.target.value = "";
                }
            }}
            />

            <div className="flex gap-2 mt-3">
                <button
                    type="submit"
                    className="px-4 py-2 rounded-md bg-emerald-600 text-xs font-semibold hover:bg-emerald-500 disabled:opacity-50"
                    disabled={generating}
                >
                    {generating ? "Generating base..." : "Generate base image (Pro)"}
                </button>

                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="px-4 py-2 rounded-md bg-slate-700 text-xs font-semibold hover:bg-slate-600 disabled:opacity-50"
                    disabled={uploading}
                >
                    {uploading ? "Uploading..." : "Upload image"}
                </button>

                {proDesignId && (
                    <button
                    type="button"
                    onClick={handleRenderPro}
                    className="px-4 py-2 rounded-md bg-sky-600 text-xs font-semibold hover:bg-sky-500"
                    >
                    Render Pro image
                </button>
            )}
            </div>
          </form>
        </section>




        {proBaseImageUrl && (
        <section className="mt-4 bg-slate-900 border border-slate-800 rounded-2xl p-4">
            <h3 className="text-xs font-semibold text-slate-200 mb-2">
            Pro preview (drag text on image)
            </h3>

            <div
            className="relative mx-auto border border-slate-700 rounded-xl overflow-hidden"
            style={{
                width: PREVIEW_WIDTH,
                height: PREVIEW_HEIGHT,
            }}
            >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
                src={proBaseImageUrl}
                alt="Base"
                className="w-full h-full object-cover"
            />

            {/* TITLE */}
            {titleOverlayCfg && (
                <OverlayPreviewBox
                cfg={titleOverlayCfg}
                onChangeMargins={(next) => {
                    if (next.marginTop !== undefined) {
                    setTitleMarginTop(next.marginTop);
                    }
                    if (next.marginRight !== undefined) {
                    setTitleMarginRight(next.marginRight);
                    }
                    if (next.marginBottom !== undefined) {
                    setTitleMarginBottom(next.marginBottom);
                    }
                    if (next.marginLeft !== undefined) {
                    setTitleMarginLeft(next.marginLeft);
                    }
                }}
                />
            )}

            {/* SUBTITLE */}
            {subtitleOverlayCfg && (
                <OverlayPreviewBox
                cfg={subtitleOverlayCfg}
                onChangeMargins={(next) => {
                    if (next.marginTop !== undefined) {
                    setSubtitleMarginTop(next.marginTop);
                    }
                    if (next.marginRight !== undefined) {
                    setSubtitleMarginRight(next.marginRight);
                    }
                    if (next.marginBottom !== undefined) {
                    setSubtitleMarginBottom(next.marginBottom);
                    }
                    if (next.marginLeft !== undefined) {
                    setSubtitleMarginLeft(next.marginLeft);
                    }
                }}
                />
            )}

            {/* PRICE */}
            {priceOverlayCfg && (
                <OverlayPreviewBox
                cfg={priceOverlayCfg}
                onChangeMargins={(next) => {
                    if (next.marginTop !== undefined) {
                    setPriceMarginTop(next.marginTop);
                    }
                    if (next.marginRight !== undefined) {
                    setPriceMarginRight(next.marginRight);
                    }
                    if (next.marginBottom !== undefined) {
                    setPriceMarginBottom(next.marginBottom);
                    }
                    if (next.marginLeft !== undefined) {
                    setPriceMarginLeft(next.marginLeft);
                    }
                }}
                />
            )}
            </div>
        </section>
        )}










        <section className="bg-slate-900 border border-slate-800 rounded-2xl p-4 text-sm">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold">History</h2>
            {loadingImages && (
              <span className="text-[10px] text-slate-500">Loading...</span>
            )}
          </div>

          {images.length === 0 && !loadingImages ? (
            <div className="text-xs text-slate-500">
              No images yet. Generate your first promo visual!
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              {images.map((img) => (
                <div
                  key={img.id}
                  className="border border-slate-800 rounded-xl overflow-hidden bg-slate-900/60"
                >
                  <div className="aspect-square bg-slate-800">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`${apiBase}${img.imageUrl}`}
                      alt={img.prompt}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="p-2">
                    <div className="text-[10px] text-slate-400 line-clamp-2">
                      {img.prompt}
                    </div>
                    <div className="text-[10px] text-slate-500 mt-1">
                      {new Date(img.createdAt).toLocaleString()}
                    </div>
                    <div className="flex gap-2">
                        <div><a
                        href={`${apiBase}${img.imageUrl}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-block mt-1 text-[10px] text-emerald-400 hover:text-emerald-300"
                        >
                        Download
                        </a></div>
                        <div>
                        <button
                            type="button"
                            onClick={() => {
                                if (window.confirm("Delete this image from the history?")) {
                                    void handleDeleteImage(img.id);
                                }
                                }}
                            className="text-[10px] text-red-400 hover:text-red-300"
                            >
                            Delete
                        </button>
                        </div>

                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
