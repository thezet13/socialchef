"use client";

import React from "react";
import { useEffect, useState, useRef, useMemo, useCallback } from "react";
import { useAuth } from "@/context/AuthContext";
import { readCookie, ApiError, apiFetch } from "@/lib/apiClient";
import { getErrorMessage } from "@/lib/getErrorMessage";
import { useT } from "@/i18n/LanguageProvider";

import { OverlayTextItem, OverlayPicItem, OverlayTextConfig, OverlayPicConfig, OverlayRectItem, OverlayRectConfig, OverlayRectFill, RenderOverlay, BakeLayer } from "@/features/editor/editor.types";
import { hexToRgbaString, rgbaToAlpha, rgbaToHex } from "@/lib/config";
import { toRelativeUploadPath } from "@/features/presets/useHydrateEditorFromPreset";
import { PresetBuilderPanel } from "@/features/presets/builder/PresetBuilderPanel";
import { POST_FORMATS, getFormatById, type PostFormatId, toPresetFormat, getExportSizeByFormatId } from "@/features/formats/postFormats";
import { itemToOverlayCfg, picToOverlayCfg, rectToOverlayCfg } from "@/features/presets/toOverlay";
import { buildPresetOverlay } from "@/features/presets/buildPresetOverlay";
import { Image as ImageIcon, Square, Trash as TrashIcon, Trash2, Type, X, RotateCcw, Upload, Flame, SendToBack, Save, SquareScissors } from "lucide-react";
import { TextsPreviewBox, PicsPreviewBox, RectsPreviewBox } from "../_components/image_editor/PreviewBoxes";
import { PresetsBlock } from "../_components/image_editor/PresetsBlock";
import { usePresets } from "../_components/image_editor/usePresets";
import { useFonts, getFontCaps, weightLabel } from "../_components/image_editor/useFonts";
import { CustomFontsStyle } from "../_components/image_editor/CustomFontsStyle";
import { ImageAdjustmentsPanel, DEFAULT_IMAGE_ADJUSTMENTS, buildPreviewStyles, type ImageAdjustments } from "../_components/image_editor/ImageAdjustmentsPanel";
import type { CustomFont } from "../_components/image_editor/useFonts";
import {
  PREVIEW_WIDTH, TEXT_LIMIT_FREE, PIC_LIMIT_FREE, RECT_LIMIT_FREE,
  BaseTransform, GenKind, Layer, ActiveLayer, GeneratedImage, ImagesResponse, ProDesignDTO,
} from "@/features/editor/editor.constants";
import { Section, Label, Num } from "@/components/uiHelpers"
import { makeDefaultRect, makeDefaultText } from "../_components/image_editor/addConsts";
import { buildHttpErrorMessage, validateImageFile } from "@/components/errorsHelpers";
import { Portal } from "@/lib/portal";

import { FormatPickerCompact } from "@/components/FormatPickerCompact";
import { StylePreviewModal } from "@/components/StylePreviewModal";
import { commitPreviewToBase } from "@/lib/commitPreviewToBase";

import { StylePickerGrid } from "@/components/StylePickerGrid";
import type { StyleListItem, ListStylesResponse } from "@/features/styles/styles.types";
import { createUserStyleFromImage } from "@/features/styles/createUserStyleFromImage";
import { deleteStyle } from "@/features/styles/styles.api";
import { Spinner } from "@/components/Spinner";

import { parseBaseTransform } from "@/features/editor/baseTransform";
import { parseImageAdjustments } from "@/features/editor/imageAdjustments";

import { useCapabilities } from "@/features/auth/useCapabilities";
import { getActionCostCredits, formatCredits } from "@socialchef/shared";
import { applyCreditsFromResponse } from "@/lib/applyCreditsFromResponse";
import { AppliedPresetDesign, EditorPreset } from "@/features/presets/preset.editor.types";

import { BaseSource } from "@/components/BaseImageChooserModal";
import { applyPresetToDesign } from "@/features/presets/presets.api";
import { buildEditorStateFromRenderOverlay } from "@/features/presets/hydrateEditorFromPreset";

import { uploadBrandStyleImage, analyzeBrandStyle, createBrandStyle, listBrandStyles, deleteBrandStyle } from "@/features/brandStyles/brandStyles.api";
import { BrandStylePickerGrid } from "@/components/BrandStylePickerGrid";

import { BakeBrandStyleModal } from "@/components/BakeBrandStyleModal";
import type { BrandStyleListItem } from "@socialchef/shared/brand-styles";
import { useGlobalDialog } from "@/components/GlobalDialogProvider";

import { ApplyPresetModal } from "@/components/ApplyPresetModal";
import { useApplyPresetFlow } from "@/features/presets/useApplyPresetFlow";

import { ComboPreviewModal } from "@/components/ComboPreviewModal";


const apiBase = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:4001";

function toAbsUrl(apiBase: string, url?: string | null) {
  if (!url) return null;
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  // url типа "/uploads/..."
  return `${apiBase}${url}`;
}

export default function ImagesPage() {
  const { user, me } = useAuth();
  const authed = !!user;

  const { isSuperAdmin } = useCapabilities();
  const t = useT();
  const dlg = useGlobalDialog();

  const {
    presets,
    presetsLoading,
    presetsError,
    fetchPreset,
    removePreset,
    reloadPresets,
    createAndRenderThumbnail,
    presetsHasMore,
    presetsLoadingMore,
    loadMorePresets,
    presetCounts,
  } = usePresets();


  const applyFlow = useApplyPresetFlow();

  const { tenant } = useAuth();
  const { openPaywall } = useAuth();

  const EXPORT_CAP = 10;

  const plan = tenant?.plan ?? "FREE";
  const creditsBalance = tenant?.creditsBalance ?? 0;

  const { setCreditsBalance, refreshMe } = useAuth();

  const isPro = plan === "PRO" || plan === "PRO_PLUS";

  const previewCost = getActionCostCredits("RESTYLE_PREVIEW");
  const presetSwapCost = getActionCostCredits("DISH_CUTOUT_PIC");
  const expandCost = getActionCostCredits("EXPAND_BACKGROUND");
  const addStyleCost = getActionCostCredits("ADD_STYLE");
  const addBrandStyleCost = getActionCostCredits("ADD_BRANDSTYLE");
  const bakeBrandStyleCost = getActionCostCredits("BAKE_BRANDSTYLE");
  const comboCost = getActionCostCredits("COMBO_PREVIEW");

  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const [builderName, setBuilderName] = useState("");
  const [builderThumbnailUrl, setBuilderThumbnailUrl] = useState("");

  const [maxExportPx, setMaxExportPx] = useState<number>(1024);
  const [generatingKind, setGeneratingKind] = useState<GenKind>(null);

  const [images, setImages] = useState<GeneratedImage[]>([]);
  const [imagesCursor, setImagesCursor] = useState<string | null>(null);
  const [imagesHasMore, setImagesHasMore] = useState(true);
  const [loadingImages, setLoadingImages] = useState(false);
  const [loadingImagesMore, setLoadingImagesMore] = useState(false);
  const [imagesTotal, setImagesTotal] = useState(0);

  const imagesLoadingRef = useRef(false);
  const scrollRootRef = useRef<HTMLDivElement | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const [prompt, setPrompt] = useState("");


  const [comboMode, setComboMode] = useState(false);
  const [comboModalOpen, setComboModalOpen] = useState(false);

  type ComboItem = { id: string; imageUrl: string; absUrl: string };
  const [comboItems, setComboItems] = useState<ComboItem[]>([]);

  const [styleId, setStyleId] = useState<string | null>(null);
  const [dbStyles, setDbStyles] = useState<StyleListItem[]>([]);
  const [loadingStyles, setLoadingStyles] = useState(false);
  const [stylePreview, setStylePreview] = useState<string | null>(null);

  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);


  const [brandStyles, setBrandStyles] = useState<BrandStyleListItem[]>([]);

  const [brandCounts, setBrandCounts] = useState<{ all: number; system: number; mine: number }>({
    all: 0,
    system: 0,
    mine: 0,
  });


  const [brandCursor, setBrandCursor] = useState<number | null>(0);
  const brandHasMore = brandCursor !== null; // cursor null => больше нет
  const [loadingBrandMore, setLoadingBrandMore] = useState(false);

  const [selectedBrandStyleId, setSelectedBrandStyleId] = useState<string | null>(null);

  const selected: BrandStyleListItem | null =
    brandStyles.find((s) => s.id === selectedBrandStyleId) ?? null;

  const [loadingBrandStyles, setLoadingBrandStyles] = useState(false);
  const [brandFile, setBrandFile] = useState<File | null>(null);
  const [brandPreview, setBrandPreview] = useState<string | null>(null);

  type BrandStyleFilter = "system" | "mine" | "all";

  const [brandFilter, setBrandFilter] = React.useState<BrandStyleFilter>("all");

  const brandScope = useMemo<"ALL" | "SYSTEM" | "TENANT">(() => {
    if (brandFilter === "system") return "SYSTEM";
    if (brandFilter === "mine") return "TENANT";
    return "ALL";
  }, [brandFilter]);



  const [bakingAi, setBakingAi] = useState(false);
  const [bakeErr, setBakeErr] = useState<string | null>(null);

  const [brandErr, setBrandErr] = useState<string | null>(null);
  const [creatingBrand, setCreatingBrand] = useState(false);


  const pickerStyles = useMemo(() => {
    return dbStyles.map((s) => ({
      id: s.id,
      previewThumbUrl: s.thumbnailUrl,
      label: s.title,
      description: s.scope === "TENANT" ? "My style" : "System style",
      scope: s.scope,
    }));
  }, [dbStyles]);

  const selectedStyleThumbUrl = useMemo(() => {
    if (!styleId) return null;
    const s = dbStyles.find((x) => x.id === styleId);
    return s?.thumbnailUrl ?? null;   // тут именно thumbnail
  }, [dbStyles, styleId]);

  const modalStyleRefUrl = toAbsUrl(apiBase, selectedStyleThumbUrl);



  const [restyleLoading, setRestyleLoading] = useState(false);
  const [restyleError, setRestyleError] = useState<string | null>(null);

  const [addStyleBusy, setAddStyleBusy] = useState(false);
  const [addStyleErr, setAddStyleErr] = useState<string | null>(null);

  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);
  const [previewModalOpen, setPreviewModalOpen] = useState(false);
  const [bakeModalOpen, setBakeModalOpen] = useState(false);

  type BakeOverlaySnap = {
    texts: OverlayTextItem[];
    pics: OverlayPicItem[];
    rects: OverlayRectItem[];
  };

  const [bakeOverlaySnap, setBakeOverlaySnap] = useState<BakeOverlaySnap>({
    texts: [],
    pics: [],
    rects: [],
  });


  function openBakeModal() {
    setBakeOverlaySnap({
      texts: [...items],
      pics: [...pics],
      rects: [...rects],
    });
    setBakeModalOpen(true);
  }


  const [swapError, setSwapError] = useState<string | null>(null);


  const [generating, setGenerating] = useState(false);
  const [formatId, setFormatId] = useState<PostFormatId>("1_1");
  const activeChoosenFormat = getFormatById(formatId);

  const [savingPreset, setSavingPreset] = useState(false);
  const isGenerating = generatingKind !== null;
  const hasPrompt = Boolean(prompt && prompt.trim().length > 0);

  const [infoMsg, setInfoMsg] = useState<string | null>(null);
  const [infoVisible, setInfoVisible] = useState(false);

  const {
    customFonts,
    setCustomFonts,
    allFonts,
    computeWeightUi,
    enforceFontWeight,
    enforceFontCaps,
  } = useFonts();


  type TabId = "styles" | "brandStyles" | "presets";
  const [tab, setTab] = useState<TabId>("styles");
  const [presetsFetchedOnce, setPresetsFetchedOnce] = useState(false);

  const openTabAtLeft = (next: TabId) => {
    setTab(next);

    if (next === "presets" && !presetsFetchedOnce) {
      setPresetsFetchedOnce(true);
      void reloadPresets();
    }
  };


  type PresetFilter = "all" | "system" | "mine";



  type StyleFilter = "system" | "mine" | "all";

  const [styleFilter, setStyleFilter] = React.useState<StyleFilter>("all");

  const [styleCounts, setStyleCounts] = React.useState({ all: 0, system: 0, mine: 0 });

  const filteredStyles = useMemo(() => {
    if (styleFilter === "system") return dbStyles.filter((x) => x.scope === "SYSTEM");
    if (styleFilter === "mine") return dbStyles.filter((x) => x.scope === "TENANT");
    return dbStyles;
  }, [dbStyles, styleFilter]);

  const stylePickerItems = useMemo(() => {
    return filteredStyles.map((s) => ({
      id: s.id,
      previewThumbUrl: s.thumbnailUrl,
      label: s.title,
      scope: s.scope,
    }));
  }, [filteredStyles]);



  const [presetFilter, setPresetFilter] = React.useState<PresetFilter>("all");

  const filteredPresets = React.useMemo(() => {
    const list = presets ?? [];
    if (presetFilter === "all") return list;
    if (presetFilter === "system") {
      return list.filter((p) => p.scope !== "TENANT");
    }
    return list.filter((p) => p.scope === "TENANT");
  }, [presets, presetFilter]);


  function StyleFilterSwitch(props: {
    value: StyleFilter;
    onChange: (v: StyleFilter) => void;
    counts: { all: number; system: number; mine: number };
  }) {
    const { value, onChange, counts } = props;

    const tabs: { key: StyleFilter; title: string; count: number }[] = [
      { key: "system", title: "Built-in", count: counts.system },
      { key: "mine", title: "My styles", count: counts.mine },
      { key: "all", title: "All", count: counts.all },
    ];

    return (
      <div className="flex ml-2 mr-3 mt-2 gap-1 rounded-lg border border-slate-900 bg-slate-950 p-1">
        {tabs.map((t) => {
          const active = value === t.key;

          return (
            <button
              key={t.key}
              type="button"
              onClick={() => onChange(t.key)}
              className={[
                "flex-1 rounded-md px-1 py-1 text-[11px] transition",
                "flex items-center justify-center gap-1",
                active ? "text-white/90 bg-slate-700" : "text-white/50 hover:bg-slate-500/10",
              ].join(" ")}
            >
              <span>{t.title}</span>
              <span className="text-[11px] leading-none text-white/30">{t.count}</span>
            </button>
          );
        })}
      </div>
    );
  }

  function BrandStyleFilterSwitch(props: {
    value: BrandStyleFilter;
    onChange: (v: BrandStyleFilter) => void;
    counts: { all: number; system: number; mine: number };
  }) {
    const { value, onChange, counts } = props;

    const tabs: { key: BrandStyleFilter; title: string; count: number }[] = [
      { key: "system", title: "Built-in", count: counts.system },
      { key: "mine", title: "My styles", count: counts.mine },
      { key: "all", title: "All", count: counts.all },
    ];
    return (
      <div className="flex ml-2 mr-3 mt-2 gap-1 rounded-lg border border-slate-900 bg-slate-950 p-1">
        {tabs.map((t) => {
          const active = value === t.key;

          return (
            <button
              key={t.key}
              type="button"
              onClick={() => onChange(t.key)}
              className={[
                "flex-1 rounded-md px-1 py-1 text-[11px] transition",
                "flex items-center justify-center gap-1",
                active ? "text-white/90 bg-slate-700" : "text-white/50 hover:bg-slate-500/10",
              ].join(" ")}
            >
              <span>{t.title}</span>
              <span className="text-[11px] leading-none text-white/30">{t.count}</span>
            </button>
          );
        })}
      </div>
    );
  }


  function PresetFilterSwitch(props: {
    value: PresetFilter;
    onChange: (v: PresetFilter) => void;
    counts: { all: number; system: number; mine: number };
  }) {
    const { value, onChange, counts } = props;

    const tabs: { key: PresetFilter; title: string; count: number }[] = [
      { key: "system", title: "Built-in", count: counts.system },
      { key: "mine", title: "My templates", count: counts.mine },
      { key: "all", title: "All", count: counts.all },
    ];
    return (
      <div className="flex ml-2 mr-3 mt-2 gap-1 rounded-lg border border-slate-900 bg-slate-950 p-1">
        {tabs.map((t) => {
          const active = value === t.key;

          return (
            <button
              key={t.key}
              type="button"
              onClick={() => onChange(t.key)}
              className={[
                "flex-1 rounded-md px-1 py-1 text-[11px] transition",
                "flex items-center justify-center gap-1",
                active
                  ? "text-white/90 bg-slate-700"
                  : "text-white/50 hover:bg-slate-500/10",
              ].join(" ")}
            >
              <span>{t.title}</span>

              <span
                className={[
                  "text-[11px] leading-none",
                  active
                    ? "text-white/30"
                    : "text-white/30",
                ].join(" ")}
              >
                {t.count}
              </span>
            </button>
          );
        })}
      </div>
    );
  }




  const [baseSource, setBaseSource] = React.useState<BaseSource>("preset");

  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(null);
  const [selectedPreset, setSelectedPreset] = useState<EditorPreset | null>(null);

  const [applyPresetErr, setApplyPresetErr] = useState<string | null>(null);

  const [applyingPreset, setApplyingPreset] = useState(false);



  type uploadProps = {
    disabled?: boolean;
    onFile: (file: File) => void | Promise<void>;
    accept?: string; // e.g. "image/*"
    maxSizeMb?: number; // optional
  };


  /* LAYERS */

  const [activeLayer, setActiveLayer] = useState<ActiveLayer>(null);
  const activeLayerRef = useRef<ActiveLayer>(null);

  useEffect(() => {
    activeLayerRef.current = activeLayer;
  }, [activeLayer]);

  const selectText = useCallback((id: string) => setActiveLayer({ kind: "text", id }), []);
  const selectPic = useCallback((id: string) => setActiveLayer({ kind: "pic", id }), []);
  const selectRect = useCallback((id: string) => setActiveLayer({ kind: "rect", id }), []);
  const clearSelection = useCallback(() => setActiveLayer(null), []);

  const selectedPicId = React.useMemo(() => {
    return activeLayer?.kind === "pic" ? activeLayer.id : null;
  }, [activeLayer]);


  const [items, setItems] = useState<OverlayTextItem[]>([]);
  const activeTextId = activeLayer?.kind === "text" ? activeLayer.id : null;
  const activeItem = useMemo(
    () => (activeTextId ? items.find((x) => x.id === activeTextId) ?? null : null),
    [items, activeTextId]
  );

  const [pics, setPics] = useState<OverlayPicItem[]>([]);
  const activePicId = activeLayer?.kind === "pic" ? activeLayer.id : null;
  const activepic = useMemo(
    () => (activePicId ? pics.find((x) => x.id === activePicId) ?? null : null),
    [pics, activePicId]
  );

  const [rects, setRects] = useState<OverlayRectItem[]>([]);
  const activeRectId = activeLayer?.kind === "rect" ? activeLayer.id : null;
  const ActiveRect = activeRectId ? rects.find((b) => b.id === activeRectId) ?? null : null;


  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const picInputRef = useRef<HTMLInputElement | null>(null);
  const cutPicInputRef = useRef<HTMLInputElement | null>(null);


  const updateActive = useCallback((patch: Partial<OverlayTextItem>) => {
    const cur = activeLayerRef.current;
    if (!cur || cur.kind !== "text") return;
    setItems((prev) => prev.map((x) => (x.id === cur.id ? { ...x, ...patch } : x)));
  }, []);


  const updateActivePic = useCallback((patch: Partial<OverlayPicItem>) => {
    const cur = activeLayerRef.current;
    if (!cur || cur.kind !== "pic") return;
    setPics((prev) => prev.map((l) => (l.id === cur.id ? { ...l, ...patch } : l)));
  }, []);

  const updateActiveRect = useCallback((patch: Partial<OverlayRectItem>) => {
    const cur = activeLayerRef.current;
    if (!cur || cur.kind !== "rect") return;
    setRects((prev) => prev.map((b) => (b.id === cur.id ? { ...b, ...patch } : b)));
  }, []);


  function markDishSlot(picId: string) {
    setPics((prev) =>
      prev.map((p) => {
        // ✅ только один слот
        if (p.role === "DISH_SLOT" && p.id !== picId) {
          const { role: _r, ...rest } = p as OverlayPicItem & { role?: string };
          return rest as OverlayPicItem;
        }
        if (p.id === picId) return { ...p, role: "DISH_SLOT" };
        return p;
      })
    );
  }

  /* ///LAYERS */

  const weightUi = useMemo(() => computeWeightUi(activeItem), [computeWeightUi, activeItem]);

  const MIN_ZOOM = 0.2;
  const MAX_ZOOM = 3;

  const weightsForSelect = weightUi.weightsForSelect;
  const weightSelectDisabled = weightUi.weightSelectDisabled;
  const nextBold = weightUi.nextBold;

  const activeFormat = POST_FORMATS.find((f) => f.id === formatId) ?? POST_FORMATS[0];
  const standardMaxSide = Math.max(activeFormat.width, activeFormat.height);

  const canvasWidth = activeFormat.width;
  const canvasHeight = activeFormat.height;

  const previewHostRef = useRef<HTMLDivElement | null>(null);
  const [previewWidthPx, setPreviewWidthPx] = useState(PREVIEW_WIDTH);

  const previewWidth = previewWidthPx;
  const previewHeight = Math.round(
    (canvasHeight / canvasWidth) * previewWidth
  );

  const editorW = canvasWidth;
  const editorH = canvasHeight;

  const previewScaleX = previewWidth / editorW;
  const previewScaleY = previewHeight / editorH;

  const caps = activeItem
    ? getFontCaps(activeItem.fontFamily)
    : { bold: false, italic: false };

  const canBold = caps.bold;
  const canItalic = caps.italic;
  const isBold = activeItem ? (activeItem.fontWeight ?? 400) >= 700 : false;
  const isItalic = activeItem ? activeItem.fontStyle === "italic" : false;

  const [proDesignId, setProDesignId] = useState<string | null>(null);
  const [proBaseImageUrl, setProBaseImageUrl] = useState<string | null>(null);

  const editorBaseImageUrl = previewImageUrl || proBaseImageUrl;

  const modalBaseImageUrl = toAbsUrl(apiBase, editorBaseImageUrl);

  const bakeBaseAbs = toAbsUrl(apiBase, editorBaseImageUrl);
  const bakeStyleAbs = toAbsUrl(apiBase, selected?.sourceImageUrl ?? null);

  const baseThumbUrl =
    editorBaseImageUrl
      ? (editorBaseImageUrl.startsWith("http") ? editorBaseImageUrl : `${apiBase}${editorBaseImageUrl}`)
      : null;

  const changePhotoInputRef = useRef<HTMLInputElement | null>(null);

  const [importingDesign, setImportingDesign] = useState(false);

  const textLimit = isPro ? Infinity : TEXT_LIMIT_FREE;
  const picLimit = isPro ? Infinity : PIC_LIMIT_FREE;
  const rectLimit = isPro ? Infinity : RECT_LIMIT_FREE;

  const canAddText = items.length < textLimit;
  const canAddPic = pics.length < picLimit;
  const canAddRect = rects.length < rectLimit;

  const [baseScale, setBaseScale] = useState(1);     // zoom
  const [baseOffsetX, setBaseOffsetX] = useState(0); // pan X (в px канваса preview)
  const [baseOffsetY, setBaseOffsetY] = useState(0); // pan Y
  const rotationDeg = Number(ActiveRect?.rotationDeg ?? 0);

  const isPanningRef = useRef(false);
  const panStartRef = useRef({ x: 0, y: 0, ox: 0, oy: 0 });

  const [fitMode, setFitMode] = useState<"cover" | "contain">("contain");
  const [expandingBg, setExpandingBg] = useState(false);

  const [backgroundImageUrl, setBackgroundImageUrl] = useState<string | null>(null);
  const [foregroundImageUrl, setForegroundImageUrl] = useState<string | null>(null);

  function nextBakeLayer(cur?: BakeLayer): BakeLayer {
    return cur === "BAKED" ? "FRONT" : "BAKED";
  }

  function toggleBakeLayer(l: { kind: "text" | "pic" | "rect"; id: string }) {
    if (l.kind === "text") {
      setItems((prev) => prev.map((t) => (t.id === l.id ? { ...t, bakeLayer: nextBakeLayer(t.bakeLayer) } : t)));
    }
    if (l.kind === "pic") {
      setPics((prev) => prev.map((p) => (p.id === l.id ? { ...p, bakeLayer: nextBakeLayer(p.bakeLayer) } : p)));
    }
    if (l.kind === "rect") {
      setRects((prev) => prev.map((r) => (r.id === l.id ? { ...r, bakeLayer: nextBakeLayer(r.bakeLayer) } : r)));
    }
  }

  const [backgroundTransform, setBackgroundTransform] = useState<BaseTransform>({
    scale: 1,
    offsetX: 0,
    offsetY: 0,
    fitMode: "cover",
  });

  const [foregroundTransform, setForegroundTransform] = useState<BaseTransform>({
    scale: 1,
    offsetX: 0,
    offsetY: 0,
    fitMode: "contain", // для cutout PNG обычно логичнее contain
  });

  const [baseNaturalSize, setBaseNaturalSize] = useState<{ w: number; h: number } | null>(null);

  // Image adjustments (Canva-like)
  const [imageAdj, setImageAdj] = useState<ImageAdjustments>(DEFAULT_IMAGE_ADJUSTMENTS);
  const previewAdj = useMemo(() => buildPreviewStyles(imageAdj), [imageAdj]);




  // MVP-правило: если в Fit пользователь zoom-in > 1, считаем что пустот “не гарантируем” => disable
  const hasImage =
    !!proBaseImageUrl &&
    !!proDesignId &&
    baseNaturalSize !== null;

  const hasEmptyZones = (() => {
    if (!hasImage) return false;
    if (fitMode !== "contain") return false;

    const W = previewWidth;
    const H = previewHeight;

    const iw = baseNaturalSize.w;
    const ih = baseNaturalSize.h;

    const s = Math.min(W / iw, H / ih) * baseScale;

    const dw = iw * s;
    const dh = ih * s;

    const dx = (W - dw) / 2 + baseOffsetX;
    const dy = (H - dh) / 2 + baseOffsetY;

    const eps = 0.5;

    const coversLeft = dx <= 0 + eps;
    const coversTop = dy <= 0 + eps;
    const coversRight = dx + dw >= W - eps;
    const coversBottom = dy + dh >= H - eps;

    // если НЕ покрывает хотя бы одну сторону — значит есть пустоты
    return !(coversLeft && coversTop && coversRight && coversBottom);
  })();



  const canExpandBg = hasImage && !expandingBg && hasEmptyZones;

  const [expandPhase, setExpandPhase] = useState<
    "Analyzing…" | "Expanding background…" | "Blending details…"
  >("Analyzing…");

  type AiPhase =
    | "Analyzing…"
    | "Expanding background…"
    | "Blending details…"
    | "Generating preview…"
    | "Applying style…"
    | "Applying template…"
    | "Applying brand style…"
    | "Swapping dish…"
    | "Cutting dish…";
  const [aiBusy, setAiBusy] = useState(false);
  const [aiPhase, setAiPhase] = useState<AiPhase>("Analyzing…");

  useEffect(() => {
    if (!expandingBg) return;

    setExpandPhase("Analyzing…");

    const t1 = window.setTimeout(() => setExpandPhase("Expanding background…"), 800);
    const t2 = window.setTimeout(() => setExpandPhase("Blending details…"), 2500);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [expandingBg]);


  const expandTitle = !hasImage
    ? "Add or generate a base image first"
    : fitMode !== "contain"
      ? "Switch to Fit to expand background"
      : !hasEmptyZones
        ? "Zoom out or move image to reveal empty areas"
        : "Expand background with AI";



  const [presetBaseImageUrl, setPresetBaseImageUrl] = React.useState<string | null>(null);
  const [userBaseImageUrl, setUserBaseImageUrl] = React.useState<string | null>(null);
  const [userProDesignId, setUserProDesignId] = React.useState<string | null>(null);
  const [baseBeforeChooser, setBaseBeforeChooser] = React.useState<string | null>(null);
  const [proDesignBeforeChooser, setProDesignBeforeChooser] = React.useState<string | null>(null);


  function addText() {
    setItems((prev) => {
      const limit = isPro ? Infinity : TEXT_LIMIT_FREE;
      if (prev.length >= limit) {
        setError(`Text limit reached (${limit})`);
        return prev;
      }

      const newText = makeDefaultText(prev.length + 1);

      queueMicrotask(() => {
        selectText(newText.id);
      });

      return [...prev, newText];
    });
  }

  function addRect() {
    setRects((prev) => {
      const limit = isPro ? Infinity : RECT_LIMIT_FREE;

      if (prev.length >= limit) {
        setError(`Rect limit reached (${limit})`);
        return prev;
      }

      const newRect = makeDefaultRect(prev.length + 1);

      queueMicrotask(() => {
        selectRect(newRect.id);
      });

      return [...prev, newRect];
    });
  }



  useEffect(() => {
    setBaseScale(1);
    setBaseOffsetX(0);
    setBaseOffsetY(0);
  }, [formatId]);

  useEffect(() => {
    if (tab !== "styles") {
      setComboMode(false);
      setComboItems([]);
      setComboModalOpen(false);
    }
  }, [tab]);


  useEffect(() => {
    enforceFontWeight(activeItem, updateActive);
  }, [activeItem, enforceFontWeight, updateActive]);

  useEffect(() => {
    enforceFontCaps(activeItem, updateActive);
  }, [activeItem, enforceFontCaps, updateActive]);

  useEffect(() => {
    const el = previewHostRef.current;
    if (!el) return;

    const ro = new ResizeObserver(() => {
      const w = el.clientWidth;

      if (!w || w < 50) return; // 🔑 защита от мусора

      const usable = Math.floor(w - 24);
      if (usable <= 0) return;

      const next = Math.max(300, Math.min(PREVIEW_WIDTH, usable));
      setPreviewWidthPx(next);
    });

    ro.observe(el);
    return () => ro.disconnect();
  }, [activeFormat.width, activeFormat.height]);


  function stripQuery(pathOrUrl: string) {
    const i = pathOrUrl.indexOf("?");
    return i >= 0 ? pathOrUrl.slice(0, i) : pathOrUrl;
  }

  /* LOAD IMAGES */
  const loadImages = useCallback(async () => {
    if (!authed) return;

    imagesLoadingRef.current = true;
    setLoadingImages(true);

    try {
      const r = await apiFetch<{ items: GeneratedImage[]; nextCursor: string | null; totalCount: number }>(
        `/images?limit=10`,
      );

      setImages(r.items ?? []);
      setImagesTotal(r.totalCount ?? 0);
      setImagesCursor(r.nextCursor ?? null);
      setImagesHasMore(Boolean(r.nextCursor));
    } finally {
      imagesLoadingRef.current = false;
      setLoadingImages(false);
    }
  }, [authed]);


  const loadMoreImages = useCallback(async () => {
    if (!authed) return;
    if (!imagesHasMore) return;
    if (!imagesCursor) return;
    if (imagesLoadingRef.current) return;

    imagesLoadingRef.current = true;
    setLoadingImagesMore(true);

    try {
      const r = await apiFetch<{ items: GeneratedImage[]; nextCursor: string | null }>(
        `/images?limit=10&cursor=${encodeURIComponent(imagesCursor)}`,
      );

      setImages((prev) => {
        const map = new Map<string, GeneratedImage>();
        for (const x of prev) map.set(x.id, x);
        for (const x of r.items ?? []) map.set(x.id, x);
        return Array.from(map.values());
      });

      setImagesCursor(r.nextCursor ?? null);
      setImagesHasMore(Boolean(r.nextCursor));
    } finally {
      imagesLoadingRef.current = false;
      setLoadingImagesMore(false);
    }
  }, [authed, imagesCursor, imagesHasMore]);

  useEffect(() => {
    if (!authed) return;
    void loadImages();
  }, [authed, loadImages]);


  useEffect(() => {
    const rootEl = scrollRootRef.current;
    const sentinelEl = sentinelRef.current;
    if (!rootEl || !sentinelEl) return;

    const io = new IntersectionObserver(
      (entries) => {
        const e = entries[0];
        if (!e?.isIntersecting) return;
        void loadMoreImages();
      },
      {
        root: rootEl,
        rootMargin: "400px",
        threshold: 0,
      }
    );

    io.observe(sentinelEl);
    return () => io.disconnect();
  }, [loadMoreImages]);



  /* LOAD STYLES */

  const loadStyles = useCallback(async () => {
    if (!authed) return;

    setLoadingStyles(true);

    try {
      setDbStyles([]);
      setCursor(null);
      setHasMore(true);

      const scope =
        styleFilter === "system" ? "SYSTEM" :
          styleFilter === "mine" ? "TENANT" :
            "ALL";

      const data = await apiFetch<{
        items: StyleListItem[];
        nextCursor: string | null;
        counts?: { all: number; system: number; mine: number };
      }>(
        `/styles/list?limit=10&scope=${scope}`,
      );

      setDbStyles(data.items);
      setCursor(data.nextCursor);
      setHasMore(Boolean(data.nextCursor));

      // ✅ counts берём только с бэка
      if (data.counts) setStyleCounts(data.counts);
    } finally {
      setLoadingStyles(false);
    }
  }, [authed, styleFilter]);



  const loadMoreStyles = useCallback(async () => {
    if (!authed) return;
    if (loadingMore || !hasMore) return;
    if (!cursor) return;

    setLoadingMore(true);
    try {
      const scope =
        styleFilter === "system" ? "SYSTEM" :
          styleFilter === "mine" ? "TENANT" :
            "ALL";

      const data = await apiFetch<{
        items: StyleListItem[];
        nextCursor: string | null;
        counts?: { all: number; system: number; mine: number };
      }>(
        `/styles/list?limit=10&scope=${scope}&cursor=${encodeURIComponent(cursor)}`,
      );

      setDbStyles((prev) => [...prev, ...data.items]);
      setCursor(data.nextCursor);
      setHasMore(Boolean(data.nextCursor));
    } finally {
      setLoadingMore(false);
    }
  }, [authed, styleFilter, loadingMore, hasMore, cursor]);



  // -------------- Styles (как у тебя было)
  useEffect(() => {
    if (!authed) return;
    void loadStyles();
  }, [authed, styleFilter, loadStyles]);

  // -------------- BrandStyles

  const brandLoadingRef = useRef(false);

  // ✅ защита от двойного вызова loadBrandStyles (React StrictMode)
  const brandFirstLoadRef = useRef(false);

  // ✅ при смене фильтра (вкладки) разрешаем новый "first load"
  useEffect(() => {
    brandFirstLoadRef.current = false;
  }, [brandScope]);

  const loadBrandStyles = useCallback(async () => {
    if (!authed) return;

    // ✅ reset paging + list
    brandLoadingRef.current = false;
    setBrandCursor(0);
    setBrandStyles([]);
    setLoadingBrandStyles(true);

    try {
      const r = await listBrandStyles({
        scope: brandScope,
        status: "ACTIVE",
        take: 10,
        cursor: 0,
      });

      const items = r.items ?? [];
      setBrandStyles(items);
      setBrandCursor(r.nextCursor ?? null);

      // ✅ counts приходят с бэка — ставим один раз на reset
      if (r.counts) setBrandCounts(r.counts);

      setSelectedBrandStyleId((prev) => {
        if (!prev) return null;
        return items.some((x) => x.id === prev) ? prev : null;
      });
    } finally {
      setLoadingBrandStyles(false);
    }
  }, [authed, brandScope]);

  const loadMoreBrandStyles = useCallback(async () => {
    if (!authed) return;
    if (brandCursor == null) return;

    if (brandLoadingRef.current) return;
    brandLoadingRef.current = true;
    setLoadingBrandMore(true);

    try {
      const r = await listBrandStyles({
        scope: brandScope,
        status: "ACTIVE",
        take: 10,
        cursor: brandCursor,
      });

      const items = r.items ?? [];

      setBrandStyles((prev) => {
        const map = new Map<string, BrandStyleListItem>();
        for (const x of prev) map.set(x.id, x);
        for (const x of items) map.set(x.id, x);

        // ✅ стабилизируем порядок, чтобы UI не “прыгал”
        return Array.from(map.values()).sort((a, b) => {
          const ta = new Date(a.updatedAt).getTime();
          const tb = new Date(b.updatedAt).getTime();
          return tb - ta;
        });
      });

      setBrandCursor(r.nextCursor ?? null);
    } finally {
      brandLoadingRef.current = false;
      setLoadingBrandMore(false);
    }
  }, [brandScope, brandCursor]);

  useEffect(() => {
    void loadBrandStyles();
  }, [loadBrandStyles]);


  const handleApplyPreset = async () => {
    setError(null);

    if (!authed) return;
    if (!selectedPreset) return;
    if (aiBusy) return;

    // 🛡️ Guard against stale selection
    const presetStillExists = presets.some(p => p.id === selectedPreset.id);

    if (!presetStillExists) {
      setSelectedPreset(null);
      return;
    }

    const hasCurrentBaseImage = !!proBaseImageUrl;

    const presetImageRel =
      selectedPreset.backgroundImageUrl ?? selectedPreset.baseImageUrl ?? null;

    const presetHasImage = !!presetImageRel;

    const choice = await applyFlow.requestApplyPreset({
      currentOverlay: { texts: items, pics, rects },
      presetOverlay: selectedPreset.overlay,
      hasCurrentImage: hasCurrentBaseImage,
      presetHasImage,
    });

    if (!choice) return;

    setAiBusy(true);
    setAiPhase("Applying template…");

    try {
      let targetDesignId: string | null = proDesignId ?? userProDesignId ?? null;

      // ✅ If editor is empty -> create a design container first
      if (!targetDesignId) {
        if (presetImageRel) {
          const cleanRel = stripQuery(presetImageRel);

          const created = await apiFetch<{
            id: string;
            baseImageUrl: string;
            width: number;
            height: number;
          }>("/presets/load-image", {
            method: "POST",
            body: {
              baseImageUrl: cleanRel, // must be /uploads/...
              width: activeFormat.width,
              height: activeFormat.height,
              baseWidth: activeFormat.width,
              baseHeight: activeFormat.height,
              imageAdjustments: imageAdj,
            },
          });

          targetDesignId = created.id;
          setProDesignId(created.id);
          setProBaseImageUrl(`${apiBase}${created.baseImageUrl}`);
        } else {
          const created = await apiFetch<{
            id: string;
            baseImageUrl: string;
            width: number;
            height: number;
          }>("/presets/create-empty-design", {
            method: "POST",
            body: {
              width: activeFormat.width,
              height: activeFormat.height,
            },
          });

          targetDesignId = created.id;
          setProDesignId(created.id);
          setProBaseImageUrl(`${apiBase}${created.baseImageUrl}`);
        }

        // reset transforms for clean start
        setBaseScale(1);
        setBaseOffsetX(0);
        setBaseOffsetY(0);
        setFitMode("cover");
      }

      // Safety: should never happen, but keeps TS happy and avoids bad URL
      if (!targetDesignId) {
        throw new Error("Failed to resolve targetDesignId");
      }

      const updated = await apiFetch<AppliedPresetDesign>(`/presets/${targetDesignId}/apply-preset`, {
        method: "POST",
        body: {
          presetId: selectedPreset.id,
          overlayMode: choice.overlayMode,
          imageMode: choice.imageMode,
          zOffset: 100,
          currentOverlay: {
            texts: items,
            pics,
            rects,
          },
        },
      });

      loadDesignIntoEditor(updated);

    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);

      if (msg.includes("Template not found") || msg.includes("404")) {
        await dlg.alert("This template no longer exists.", {
          title: "Template removed",
        });

        setSelectedPreset(null);
        return;
      }

      if (msg.includes("PRESET_ALREADY_APPLIED") || msg.includes("TEMPLATE_ALREADY_APPLIED") || msg.includes("409")) {
        await dlg.alert("This template is already applied.", {
          title: "Warning",
        });
        return;
      }

      throw err;
    } finally {
      setAiBusy(false);
    }
  };




  // const handleApplyPreset = async () => {
  //   if (!selectedPreset) return;

  //   // const ok = await dlg.confirm(
  //   //   "Apply preset? Current editor changes will be replaced.",
  //   //   {
  //   //     title: "Warning",
  //   //     okText: "Apply",
  //   //     cancelText: "Cancel",
  //   //   }
  //   // );

  //   // if (!ok) return;

  //   const choice = await applyFlow.requestApplyPreset({
  //     currentOverlay: { texts: items, pics, rects },     // подстрой под твои переменные
  //     presetOverlay: selectedPreset.overlay,
  //     hasCurrentImage: !!backgroundImageUrl || !!proBaseImageUrl,
  //     presetHasImage: !!selectedPreset.backgroundImageUrl || !!selectedPreset.baseImageUrl,
  //   });

  //   if (!choice) return;


  //   setAiBusy(true);
  //   setAiPhase("Applying template…");

  //   try {
  //     loadOverlayIntoEditor({
  //       texts: selectedPreset.overlay.texts,
  //       pics: selectedPreset.overlay.pics ?? [],
  //       rects: selectedPreset.overlay.rects ?? [],
  //     });

  //     setBaseScale(1); setBaseOffsetX(0); setBaseOffsetY(0); setFitMode("cover");

  //     setBackgroundImageUrl(selectedPreset.backgroundImageUrl ?? null);
  //     setForegroundImageUrl(selectedPreset.foregroundImageUrl ?? null);

  //     setBackgroundTransform(parseBaseTransform(selectedPreset.backgroundTransformJson));
  //     setForegroundTransform(parseBaseTransform(selectedPreset.foregroundTransformJson));
  //   } finally {
  //     setAiBusy(false);
  //   }
  // };


    async function handleAddStyle() {
    setAddStyleErr(null);

    const cost = getActionCostCredits("ADD_STYLE");
    const balance = me?.tenant?.creditsBalance ?? 0;
    if (balance < cost) {
      openPaywall({
        code: "INSUFFICIENT_CREDITS",
        action: "ADD_STYLE",
        requiredCredits: cost,
        balanceCredits: balance,
        creditsBalance: balance,
      }
      ); return;
    }

    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/png,image/jpeg,image/webp";

    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;

      try {
        if (!authed) throw new Error("Not authorized");

        setAddStyleBusy(true);

        const r = await createUserStyleFromImage({
          apiBase,
          file,
        });

        if (typeof r.creditsBalance === "number") {
          setCreditsBalance(r.creditsBalance);
        } else {
          await refreshMe();
        }

        const { createdStyleId } = r;

        // обновить список (твоя функция, которую мы добавили ранее)
        await loadStyles();

        // авто-выбор нового стиля
        setStyleId(createdStyleId);
      } catch (err) {
        setAddStyleErr(err instanceof Error ? err.message : "Failed to add style");
      } finally {
        setAddStyleBusy(false);
      }
    };

    input.click();
  }


  async function handleCreateBrandStyle(file?: File) {
    setBrandErr(null);

    const f = file ?? brandFile;
    if (!f) return;

    try {
      if (!authed) throw new Error("Not authorized");

      setCreatingBrand(true);

      const upload = await uploadBrandStyleImage(f);

      const analyzed = await analyzeBrandStyle({
        imageUrl: upload.imageUrl,
      });

      if (typeof analyzed.creditsBalance === "number") {
        setCreditsBalance(analyzed.creditsBalance);
      } else {
        await refreshMe();
      }

      const created = await createBrandStyle({
        scope: "TENANT",
        name: analyzed.name ?? "My Brand Style",
        sourceImageUrl: upload.imageUrl,
        thumbnailUrl: upload.thumbnailUrl,
        sourceW: upload.imageW,
        sourceH: upload.imageH,
        styleRecipeJson: analyzed.styleRecipeJson,
        fontMetaJson: analyzed.fontMetaJson ?? null,
      });

      await loadBrandStyles();

      setSelectedBrandStyleId(created.id);

      setBrandFile(null);
      setBrandPreview(null);
    } catch (err) {
      setBrandErr(err instanceof Error ? err.message : "Failed to create brand style");
    } finally {
      setCreatingBrand(false);
    }
  }


  async function onDeleteStyle(id: string) {
    if (!authed) return;
    const ok = await dlg.confirm(
      `Delete this style? This cannot be undone.`,
      {
        title: "Warning",
        okText: "Delete",
        cancelText: "Cancel",
      }
    );
    if (!ok) return;

    await deleteStyle({ apiBase, styleId: id });
    await loadStyles();

    setStyleId((prev) => (prev === id ? null : prev));
  }


  async function onDeleteBrandStyle(id: string) {
    if (!authed) return;

    const ok = await dlg.confirm(
      `Delete this style? This cannot be undone.`,
      {
        title: "Warning",
        okText: "Delete",
        cancelText: "Cancel",
      }
    );
    if (!ok) return;

    await deleteBrandStyle({ apiBase, brandStyleId: id });

    await loadBrandStyles();

    setSelectedBrandStyleId((prev) => {
      if (prev !== id) return prev;
      return items.length ? items[0]!.id : null;
    });
  }

  function absUploadsUrl(maybeRel: string | null | undefined) {
    if (!maybeRel) return null;
    if (maybeRel.startsWith("http")) return maybeRel;
    if (maybeRel.startsWith("/uploads/")) return `${apiBase}${maybeRel}`;
    return maybeRel;
  }

  function loadOverlayIntoEditor(raw: unknown) {
    const o = (raw && typeof raw === "object" ? raw : null) as RenderOverlay | null;
    const next = buildEditorStateFromRenderOverlay(o ?? {});
    setItems(next.items);
    setPics(next.pics);
    setRects(next.rects);
  }

  function loadDesignIntoEditor(design: AppliedPresetDesign, opts?: { skipBase?: boolean }) {
    // overlay всегда грузим
    loadOverlayIntoEditor(design.overlayJson);

    // base/background/foreground — грузим только если не просили skipBase
    if (!opts?.skipBase) {
      setProBaseImageUrl(absUploadsUrl(design.baseImageUrl));
      setBackgroundImageUrl(absUploadsUrl(design.backgroundImageUrl));
      setForegroundImageUrl(absUploadsUrl(design.foregroundImageUrl));

      const baseT = parseBaseTransform(design.baseTransformJson);
      setBaseScale(baseT.scale);
      setBaseOffsetX(baseT.offsetX);
      setBaseOffsetY(baseT.offsetY);
      setFitMode(baseT.fitMode);

      const adj = parseImageAdjustments(design.imageAdjustmentsJson);
      setImageAdj(adj);

      setBackgroundTransform(parseBaseTransform(design.backgroundTransformJson));
      setForegroundTransform(parseBaseTransform(design.foregroundTransformJson));
    } else {
      // если base не трогаем — всё равно безопасно обновим слои, если они используются UI
      setBackgroundImageUrl(absUploadsUrl(design.backgroundImageUrl));
      setForegroundImageUrl(absUploadsUrl(design.foregroundImageUrl));
      setBackgroundTransform(parseBaseTransform(design.backgroundTransformJson));
      setForegroundTransform(parseBaseTransform(design.foregroundTransformJson));
    }
  }




  // async function handleDesignImportMvp() {
  //   if (!authed) return;

  //   if (!proBaseImageUrl) {
  //     setError("Upload or generate a base image first");
  //     return;
  //   }

  //   setError(null);
  //   setImportingDesign(true);

  //   try {
  //     const rel = toRelativeUploadPath(proBaseImageUrl, apiBase);
  //     if (!rel) throw new Error("Invalid base image URL");

  //     const data = await apiFetch<{
  //       overlay: {
  //         meta?: { width?: number; height?: number; version?: number };
  //         texts?: OverlayTextConfig[];
  //         rects?: OverlayRectConfig[];
  //         pics?: OverlayPicConfig[]
  //       };
  //       cleanBaseImageUrl?: string | null;
  //     }>("/ai/design-import/analyze", {
  //       method: "POST",
  //       body: {
  //         imageUrl: rel,
  //         clean: true,
  //         maskPad: 24,
  //       },
  //     });

  //     const overlay = data.overlay ?? ({});
  //     const textsCfg = overlay.texts ?? [];
  //     const rectsCfg = overlay.rects ?? [];
  //     const picsCfg = overlay.pics ?? [];

  //     // ---- map Texts ----
  //     const nextTexts: OverlayTextItem[] = textsCfg.map((t, idx) => ({
  //       id: crypto.randomUUID(),
  //       name: `Text ${idx + 1}`,
  //       text: t.text,

  //       alwaysOnTop: false,

  //       color: t.color ?? "#ffffff",
  //       fontFamily: t.fontFamily ?? "Inter",
  //       fontSize: t.fontSize ?? 48,
  //       fontWeight: t.fontWeight ?? 400,
  //       fontStyle: t.fontStyle ?? "normal",

  //       align: (t.align) ?? "top-left",
  //       textAlign: t.textAlign ?? "left",
  //       lineHeight: (t.lineHeight ?? 1.2),
  //       textOpacity: (t.textOpacity ?? 1),

  //       plaqueWidth: (t).plaqueWidth ?? 0,
  //       plaqueColor: t.plaqueColor ?? "#ffffff",
  //       plaqueOpacity: t.plaqueOpacity ?? 0,
  //       plaqueBorderColor: t.plaqueBorderColor ?? "#000000",
  //       plaqueBorderOpacity: t.plaqueBorderOpacity ?? 1,
  //       plaqueBorderWidth: t.plaqueBorderWidth ?? 0,
  //       borderRadius: (t).borderRadius ?? 0,

  //       paddingTop: t.paddingTop ?? 0,
  //       paddingRight: t.paddingRight ?? 0,
  //       paddingBottom: t.paddingBottom ?? 0,
  //       paddingLeft: t.paddingLeft ?? 0,

  //       marginTop: t.marginTop ?? 0,
  //       marginRight: t.marginRight ?? 0,
  //       marginBottom: t.marginBottom ?? 0,
  //       marginLeft: t.marginLeft ?? 0,

  //       shadowColor: t.shadowColor ?? "#000000",
  //       shadowOpacity: t.shadowOpacity ?? 0,
  //       shadowBlur: t.shadowBlur ?? 0,
  //       shadowOffsetX: t.shadowOffsetX ?? 0,
  //       shadowOffsetY: t.shadowOffsetY ?? 0,

  //       rotationDeg: t.rotationDeg ?? 0,
  //     }));

  //     // ---- map Rects ----
  //     const nextRects: OverlayRectItem[] = rectsCfg.map((r, idx) => ({
  //       id: crypto.randomUUID(),
  //       name: `Rectangle ${idx + 1}`,

  //       width: r.width,
  //       height: r.height,
  //       opacity: r.opacity ?? 1,

  //       align: (r.align) ?? "top-left",
  //       marginTop: r.marginTop ?? 0,
  //       marginRight: r.marginRight ?? 0,
  //       marginBottom: r.marginBottom ?? 0,
  //       marginLeft: r.marginLeft ?? 0,

  //       rotationDeg: r.rotationDeg ?? 0,
  //       fill: r.fill,

  //       borderColor: r.borderColor ?? "#000000",
  //       borderWidth: r.borderWidth ?? 0,
  //       borderRadius: r.borderRadius ?? 0,

  //       alwaysOnTop: false,
  //     }));

  //     // ---- map Pics (MVP: backend чаще вернёт [] — ок) ----
  //     const nextPics: OverlayPicItem[] = picsCfg.map((p, idx) => ({
  //       id: crypto.randomUUID(),
  //       name: `Pic ${idx + 1}`,

  //       // у тебя в UI обычно абсолютный URL (apiBase + relative)
  //       url: p.url?.startsWith("http") ? p.url : `${apiBase}${p.url}`,

  //       alwaysOnTop: false,
  //       width: p.width,
  //       height: p.height,
  //       opacity: p.opacity ?? 1,

  //       align: p.align ?? "top-left",
  //       marginTop: p.marginTop ?? 0,
  //       marginRight: p.marginRight ?? 0,
  //       marginBottom: p.marginBottom ?? 0,
  //       marginLeft: p.marginLeft ?? 0,

  //       aspectRatio: (p.height ?? 1) / (p.width ?? 1),
  //       rotationDeg: p.rotationDeg ?? 0,
  //     }));

  //     // if (data.cleanBaseImageUrl) {
  //     //   setProBaseImageUrl(`${apiBase}${data.cleanBaseImageUrl}`);
  //     // }

  //     setItems(nextTexts);
  //     setRects(nextRects);
  //     setPics(nextPics);

  //     if (data.cleanBaseImageUrl) {
  //       const cleanRel = stripQuery(data.cleanBaseImageUrl);
  //       const created = await apiFetch<{
  //         id: string;
  //         baseImageUrl: string;
  //         width: number;
  //         height: number;
  //       }>("/ai/pro-images/from-existing", {
  //         method: "POST",
  //         body: {
  //           baseImageUrl: cleanRel,
  //           baseWidth: activeFormat.width,
  //           baseHeight: activeFormat.height,
  //           imageAdjustments: imageAdj,
  //         },
  //       });

  //       setProDesignId(created.id);
  //       setProBaseImageUrl(`${apiBase}${created.baseImageUrl}`);

  //       setImageAdj(imageAdj);

  //       // reset transform for new base
  //       setBaseScale(1);
  //       setBaseOffsetX(0);
  //       setBaseOffsetY(0);
  //       setFitMode("contain");

  //       setInfoMsg("Background expanded. Click Export to add it to History");
  //       setInfoVisible(true);

  //       setTimeout(() => {
  //         setInfoVisible(false);
  //       }, 3000);

  //       // ещё через 300мс (длительность анимации) — убираем из DOM
  //       setTimeout(() => {
  //         setInfoMsg(null);
  //       }, 3300);


  //     }
  //   } catch (err) {
  //     setError(getErrorMessage(err));
  //   } finally {
  //     setImportingDesign(false);
  //   }
  // }


  function UploadDropzone({
    disabled,
    onFile,
    accept = "image/*",
    maxSizeMb = 5,
  }: uploadProps) {
    const inputRef = useRef<HTMLInputElement | null>(null);
    const [isDragOver, setIsDragOver] = useState(false);
    const [err, setErr] = useState<string | null>(null);

    const pick = useCallback(() => {
      if (disabled) return;
      setErr(null);
      inputRef.current?.click();
    }, [disabled]);

    const validateAndSend = useCallback(
      async (file: File | null | undefined) => {
        if (!file) return;
        setErr(null);

        if (!file.type.startsWith("image/")) {
          setErr("Please upload an image file.");
          return;
        }

        const maxBytes = maxSizeMb * 1024 * 1024;
        if (file.size > maxBytes) {
          setErr(`Image is too large. Max ${maxSizeMb}MB.`);
          return;
        }

        await onFile(file);

      },
      [maxSizeMb, onFile]
    );

    const onChange = useCallback(
      async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        // important: reset value so selecting same file again triggers change
        e.target.value = "";
        await validateAndSend(file);
      },
      [validateAndSend]
    );

    const onDragEnter = useCallback((e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (disabled) return;
      setIsDragOver(true);
    }, [disabled]);

    const onDragOver = useCallback((e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (disabled) return;
      setIsDragOver(true);
    }, [disabled]);

    const onDragLeave = useCallback((e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(false);
    }, []);

    const onDrop = useCallback(
      async (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragOver(false);
        if (disabled) return;

        const file = e.dataTransfer.files?.[0];
        await validateAndSend(file);
      },
      [disabled, validateAndSend]
    );

    return (
      <div className="w-full h-full flex justify-center text-center">
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          onChange={onChange}
          className="hidden"
        />

        <button
          type="button"
          disabled={disabled}
          onClick={pick}
          onDragEnter={onDragEnter}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          className={[
            "rounded-2xl border border-dashed p-8 w-full",
            "transition-colors select-none",
            disabled ? "opacity-60 cursor-not-allowed" : "cursor-pointer",
            isDragOver
              ? "border-blue-500/70 bg-blue-500/10"
              : "border-slate-700 hover:bg-slate-950/70 hover:border-blue-500/70",
          ].join(" ")}
        >

          <div className="space-y-1">
            <div className="text-sm text-slate-100 opacity-70">
              Click or drop your photo here
            </div>
            <div className="text-xs text-slate-400 opacity-50">
              JPG/PNG/WebP · up to {maxSizeMb}MB
            </div>
          </div>

          <div className="flex flex-col mt-5 justify-center items-center text-center gap-3">
            <div
              className={[
                "h-12 w-12 rounded-2xl flex items-center justify-center",
                isDragOver ? "text-black" : "text-slate-400",
              ].join(" ")}
            >
              <Upload size={30} />
            </div>




            {err ? <div className="text-xs text-red-400">{err}</div> : null}


          </div>
        </button>
      </div>
    );
  }

  <div className="w-full text-slate-500 opacity-75 mt-10 text-center">We don’t store originals forever…</div>


  async function handleUploadSelectedFile(file: File) {
    if (!authed) return;
    setError(null);
    setUploading(true);

    const err = validateImageFile(file, {
      allow: ["image/png", "image/jpeg", "image/webp"],
      maxBytes: 12 * 1024 * 1024, // 12MB
      action: "Upload image",
    });
    if (err) {
      setUploading(false);
      setError(err);
      return;
    }

    try {
      const formData = new FormData();
      formData.append("file", file);

      const csrf = readCookie("sc_csrf");

      const res = await fetch(`${apiBase}/ai/pro-images/upload`, {
        method: "POST",
        body: formData,
        credentials: "include",
        headers: csrf ? { "x-csrf-token": csrf } : {},
      });

      if (!res.ok) {
        throw new Error(await buildHttpErrorMessage(res, "Failed to upload image", { file, action: "Upload image" }));
      }

      const data: {
        id: string;
        baseImageUrl: string;
        width: number;
        height: number;
        aspectRatio?: number;
      } = await res.json();

      setProDesignId(data.id);
      const url = `${data.baseImageUrl}`;
      //setProBaseImageUrl(`${apiBase}${data.baseImageUrl}`);
      setProBaseImageUrl(url);
      setUserBaseImageUrl(url);
      setUserProDesignId(data.id);


    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setUploading(false);
    }
  }


  async function handleUploadComboItem(file: File) {
    if (!authed) return;

    const err = validateImageFile(file, {
      allow: ["image/png", "image/jpeg", "image/webp"],
      maxBytes: 12 * 1024 * 1024,
      action: "Upload combo photo",
    });
    if (err) {
      setError(err);
      return;
    }

    // лимит 4
    setError(null);

    const fd = new FormData();
    fd.append("file", file);

    const csrf = readCookie("sc_csrf");

    const res = await fetch(`${apiBase}/ai/pro-images/upload-combo`, {
      method: "POST",
      body: fd,
      credentials: "include",
      headers: csrf ? { "x-csrf-token": csrf } : {},
    });

    if (!res.ok) {
      throw new Error(await buildHttpErrorMessage(res, "Failed to upload combo photo", { file, action: "Upload combo photo" }));
    }

    const data = await res.json();

    const rel =
      (typeof data.imageUrl === "string" && data.imageUrl) ||
      (typeof data.baseImageUrl === "string" && data.baseImageUrl);

    if (!rel) {
      throw new Error("Upload response has no imageUrl/baseImageUrl");
    }

    const abs = rel.startsWith("http") ? rel : `${apiBase}${rel}`;

    setComboItems(prev => [...prev, { id: makeId("combo"), imageUrl: rel, absUrl: abs }]);
  }




  function makeId(prefix: string) {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

  function addDishSlotPic() {
    const id = makeId("dish_slot");

    const dishSlot: OverlayPicItem = {
      id,
      name: "Dish Slot",
      role: "DISH_SLOT",

      // временно можно поставить текущую base картинку (чтобы слот был видим),
      // потом он будет заменён cutoutUrl
      url: proBaseImageUrl ? `${apiBase}${proBaseImageUrl}` : "",

      visible: true,
      alwaysOnTop: false,

      width: Math.round(activeFormat.width * 0.7),
      height: Math.round(activeFormat.height * 0.7),

      opacity: 1,
      align: "middle-center",
      marginTop: 0,
      marginRight: 0,
      marginBottom: 0,
      marginLeft: 0,

      rotationDeg: 0,
      aspectRatio: undefined,
      z: 30,
      bakeLayer: "FRONT",
    };

    setPics((prev) => {
      // ✅ один слот на пресет — если уже есть, просто выделим
      const exists = prev.find((p) => p.role === "DISH_SLOT");
      if (exists) {
        queueMicrotask(() => selectPic(exists.id));
        return prev;
      }
      return [...prev, dishSlot];
    });

    queueMicrotask(() => selectPic(id));
  }


  async function handleUploadpicPng(file: File) {
    if (!authed) return;

    const picLimit = isPro ? Infinity : PIC_LIMIT_FREE;

    if (!isPro && pics.length >= PIC_LIMIT_FREE) {
      setError("Upgrade to PRO to add more pics");
      return;
    }

    if (pics.length >= picLimit) {
      setError(`Image overlay limit reached (${picLimit})`);
      return;
    }

    const err = validateImageFile(file, {
      allow: ["image/png", "image/jpeg"],
      maxBytes: 8 * 1024 * 1024,
      action: "Upload image overlay",
    });
    if (err) {
      setError(err);
      return;
    }

    const fd = new FormData();
    fd.append("file", file);

    const csrf = readCookie("sc_csrf");

    const res = await fetch(`${apiBase}/ai/pro-assets/upload-image`, {
      method: "POST",
      body: fd,
      credentials: "include",
      headers: csrf ? { "x-csrf-token": csrf } : {},
    });

    if (!res.ok) {
      throw new Error(await buildHttpErrorMessage(res, "Failed to upload PNG overlay", { file, action: "Upload PNG overlay" }));
    }

    const data = (await res.json()) as { url: string };

    const imageUrl = `${apiBase}${data.url}`;

    const img = new Image();
    img.src = imageUrl;


    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error(`Upload PNG overlay: uploaded file could not be loaded as an image.`));
    });


    const width = 300;

    const naturalW = img.naturalWidth || 1;
    const naturalH = img.naturalHeight || 1;
    const ratio = naturalH / naturalW;

    const height = Math.round(width * ratio);



    const newpic: OverlayPicItem = {
      id: crypto.randomUUID(),
      name: `pic ${pics.length + 1}`,
      url: `${apiBase}${data.url}`, // чтобы сразу отображалось в preview
      alwaysOnTop: false,
      width,
      height,
      opacity: 1,
      align: "top-left",
      marginTop: 40,
      marginRight: 0,
      marginBottom: 0,
      marginLeft: 40,
      aspectRatio: ratio,
      rotationDeg: 0,
    };

    setPics((prev) => [...prev, newpic]);

    queueMicrotask(() => {
      selectPic(newpic.id);
    });
  }


  async function handleUploadCuttedPic(file: File) {
    if (!authed) return;

    const picLimit = isPro ? Infinity : PIC_LIMIT_FREE;

    if (!isPro && pics.length >= PIC_LIMIT_FREE) {
      setError("Upgrade to PRO to add more pics");
      return;
    }

    if (pics.length >= picLimit) {
      setError(`Image overlay limit reached (${picLimit})`);
      return;
    }

    // ✅ лучше разрешить jpg/jpeg/png (блюда обычно jpg)
    const err = validateImageFile(file, {
      allow: ["image/png", "image/jpeg", "image/jpg", "image/webp"],
      maxBytes: 12 * 1024 * 1024, // 12MB (можешь 8MB оставить)
      action: "Cut dish photo",
    });
    if (err) {
      setError(err);
      return;
    }

    // ✅ credits check как у тебя
    const cost = getActionCostCredits("DISH_CUTOUT_PIC"); // или новый action
    const balance = me?.tenant?.creditsBalance ?? 0;

    if (balance < cost) {
      openPaywall({
        code: "INSUFFICIENT_CREDITS",
        action: "DISH_CUTOUT_PIC",
        requiredCredits: cost,
        balanceCredits: balance,
        creditsBalance: balance,
      });
      return;
    }

    setAiBusy(true);
    setAiPhase("Cutting dish…");

    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("formatId", formatId);

      const csrf = readCookie("sc_csrf");

      const res = await fetch(`${apiBase}/ai/pro-images/dish-cutout-upload`, {
        method: "POST",
        body: fd,
        credentials: "include",
        headers: csrf ? { "x-csrf-token": csrf } : {},
      });

      // 402 paywall
      if (res.status === 402) {
        const pay = await res.json();
        openPaywall(pay);
        return;
      }

      if (!res.ok) {
        throw new Error(
          await buildHttpErrorMessage(res, "Failed to cut dish photo", { file, action: "Cut dish photo" })
        );
      }

      const data = (await res.json()) as { cutoutUrl: string; creditsBalance?: number };

      // ✅ обновляем баланс кредитов, как ты уже делаешь
      const done = applyCreditsFromResponse(data, setCreditsBalance);
      if (!done) await refreshMe();

      const imageUrl = `${apiBase}${data.cutoutUrl}`;

      // ✅ получаем ratio через Image() как в твоём add pic
      const img = new Image();
      img.src = imageUrl;

      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error(`Cut dish photo: cutout could not be loaded as an image.`));
      });

      const naturalW = img.naturalWidth || 1;
      const naturalH = img.naturalHeight || 1;
      const ratio = naturalH / naturalW;

      // ✅ размер как у обычного pic
      const width = 600;
      const height = Math.round(width * ratio);

      // ✅ ВСТАВКА ПО ЦЕНТРУ
      // если у тебя есть editor base size (например baseWidth/baseHeight)
      const cw = Number(1024);   // подставь реальные стейты
      const ch = Number(1024);

      const marginLeft = Math.round((cw - width) / 2);
      const marginTop = Math.round((ch - height) / 2);

      const newpic: OverlayPicItem = {
        id: crypto.randomUUID(),
        name: `cut ${pics.length + 1}`,
        url: imageUrl,
        alwaysOnTop: false,
        width,
        height,
        opacity: 1,
        align: "top-left",
        marginTop,
        marginRight: 0,
        marginBottom: 0,
        marginLeft,
        aspectRatio: ratio,
        rotationDeg: 0,
      };

      setPics((prev) => [...prev, newpic]);

      queueMicrotask(() => {
        selectPic(newpic.id);
      });
    } finally {
      setAiBusy(false);
    }
  }



  async function handleGenerateGpt15() {
    setGeneratingKind("gpt15");
    if (!authed) return;

    setError(null);
    setGenerating(true);

    try {
      const data = await apiFetch<{
        id: string;
        baseImageUrl: string;
        width: number;
        height: number;
      }>("/ai/pro-images/generate-gpt15", {
        method: "POST",
        body: {
          prompt,
          styleId,
          width: activeFormat.width,
          height: activeFormat.height,
        },
      });

      setProDesignId(data.id);


      //setProBaseImageUrl(`${apiBase}${data.baseImageUrl}`);
      const url = `${data.baseImageUrl}`;
      setProBaseImageUrl(url);
      setUserBaseImageUrl(url);
      setUserProDesignId(data.id);

      setBaseScale(1);
      setBaseOffsetX(0);
      setBaseOffsetY(0);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setGenerating(false);
      setGeneratingKind(null);
    }

  }

  async function handleGenerateSDXL(e?: React.FormEvent) {
    setGeneratingKind("sdxl");

    e?.preventDefault();
    if (!prompt) {
      setError("Prompt is required");
      return;
    }
    setError(null);
    setGenerating(true);

    try {
      const data = await apiFetch<{
        id: string;
        baseImageUrl: string;
        width: number;
        height: number;
      }>("/ai/images/generate", {
        method: "POST",
        body: {
          prompt,
          styleId,
          width: activeFormat.width,
          height: activeFormat.height,
        },
      });

      setProDesignId(data.id);
      //setProBaseImageUrl(`${apiBase}${data.baseImageUrl}`);
      const url = `${data.baseImageUrl}`;
      setUserProDesignId(data.id);
      setProBaseImageUrl(url);
      setUserBaseImageUrl(url);
      setProDesignId(data.id);

    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setGenerating(false);
      setGeneratingKind(null);
    }
  }

  async function handleRender() {

    if (!authed) {
      setError("Not authorized. Please sign in again.");
      return;
    }
    if (!proDesignId) {
      setError("Render is unavailable: generate or upload a base image first (no proDesignId).");
      return;
    }

    setError(null);

    const overlayFromItems: RenderOverlay = {
      texts: items
        .filter((t) => t.visible !== false)
        .map((t) => itemToOverlayCfg(t)),

      pics: pics
        .filter((p) => p.visible !== false)
        .map((p) => picToOverlayCfg(p, apiBase)),

      rects: rects
        .filter((r) => r.visible !== false)
        .map((r) => rectToOverlayCfg(r)),
    };

    const kx = activeFormat.width / previewWidth;
    const ky = activeFormat.height / previewHeight;

    const offsetXOut = baseOffsetX * kx;
    const offsetYOut = baseOffsetY * ky;

    try {
      const res = await apiFetch<{
        proDesignId: string;
        finalImageUrl: string;
        generatedImageId: string;
        width: number;
        height: number;


      }>(`/ai/pro-images/${proDesignId}/render`, {
        method: "POST",
        body: {
          outputWidth: activeFormat.width,
          outputHeight: activeFormat.height,
          baseWidth: activeFormat.width,
          baseHeight: activeFormat.height,
          baseTransform: { scale: baseScale, offsetX: offsetXOut, offsetY: offsetYOut, fitMode },
          imageAdjustments: imageAdj,
          overlay: overlayFromItems,
        },
      });

      setImages((prev) => {
        const next = [
          {
            id: res.generatedImageId,
            imageUrl: res.finalImageUrl,
            proDesignId: res.proDesignId,
            width: res.width ?? activeFormat.width,
            height: res.height ?? activeFormat.height,
            prompt,
            styleId: styleId ?? null,
            tenantId: user?.id || "",
            createdAt: new Date().toISOString(),
          },
          ...prev,
        ];

        const map = new Map<string, GeneratedImage>();
        for (const x of next) map.set(x.id, x);

        return Array.from(map.values()).slice(0, EXPORT_CAP);
      });

      setImagesTotal((prev) => Math.min(prev + 1, EXPORT_CAP));

      //setInfoMsg("Image exported to history.");
      setInfoVisible(true);

      setTimeout(() => {
        setInfoVisible(false);
      }, 3000);

      // ещё через 300мс (длительность анимации) — убираем из DOM
      setTimeout(() => {
        setInfoMsg(null);
      }, 3300);

    } catch (err) {
      setError(getErrorMessage(err));
    }
  }



  async function handleExpandBackground() {

    const cost = getActionCostCredits("EXPAND_BACKGROUND");
    const balance = me?.tenant?.creditsBalance ?? 0;
    if (balance < cost) {
      openPaywall({
        code: "INSUFFICIENT_CREDITS",
        action: "EXPAND_BACKGROUND",
        requiredCredits: cost,
        balanceCredits: balance,
        creditsBalance: balance,
      }
      ); return;
    }

    if (!authed) {
      setError("Not authorized. Please sign in again.");
      return;
    }
    if (!proDesignId) {
      setError("Expand is unavailable: generate or upload a base image first.");
      return;
    }
    if (!proBaseImageUrl) {
      setError("No base image.");
      return;
    }
    if (fitMode === "cover") {
      setError("Switch to Fit mode first (contain) — Expand background is meant for empty zones.");
      return;
    }

    setError(null);
    setAiBusy(true);
    setAiPhase("Analyzing…");

    try {
      setAiPhase("Expanding background…");
      // same math as in handleRender()
      const kx = activeFormat.width / previewWidth;
      const ky = activeFormat.height / previewHeight;

      const offsetXOut = baseOffsetX * kx;
      const offsetYOut = baseOffsetY * ky;

      const res = await apiFetch<{
        proDesignId: string;
        baseImageUrl: string;
        width: number;
        height: number;
        creditsBalance?: number;
      }>(`/ai/pro-images/${proDesignId}/expand-background`, {
        method: "POST",
        body: {
          outputWidth: activeFormat.width,
          outputHeight: activeFormat.height,
          baseTransform: {
            scale: baseScale,
            offsetX: offsetXOut,
            offsetY: offsetYOut,
            fitMode,
          },
        },
      });

      if (!applyCreditsFromResponse(res, setCreditsBalance)) {
        await refreshMe();
      }

      setAiPhase("Blending details…");

      // подменяем base
      setProBaseImageUrl(res.baseImageUrl);

      // считаем, что теперь это "user base"
      setUserBaseImageUrl(res.baseImageUrl);
      setUserProDesignId(res.proDesignId);

      // reset transforms — потому что позиция уже запечена
      setBaseScale(1);
      setBaseOffsetX(0);
      setBaseOffsetY(0);
      setFitMode("contain");
    } catch (err) {
      if (err instanceof ApiError && err.status === 402) {
        openPaywall(err.data); // из AuthContext
        return;
      }
      setError(getErrorMessage(err));
    } finally {
      setAiBusy(false);
    }
  }


  async function handleRenderExportFromHistory(
    proDesignId: string,
    maxSide: number
  ) {
    if (!authed) return;

    const { width, height } = getExportSizeByFormatId(formatId, maxSide);

    // 1) берём сохранённый overlay/transform из БД
    const design = await apiFetch<ProDesignDTO>(`/ai/pro-images/${proDesignId}`);

    const overlay: RenderOverlay = design.overlayJson ?? {};
    const baseTransform: BaseTransform =
      design.baseTransformJson ?? { scale: 1, offsetX: 0, offsetY: 0, fitMode: "cover" };

    const csrf = readCookie("sc_csrf");
    // 2) export: ждём PNG (не JSON)
    const r = await fetch(`${apiBase}/ai/pro-images/${proDesignId}/render`, {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...(csrf ? { "x-csrf-token": csrf } : {}),
      },
      body: JSON.stringify({
        outputWidth: width,
        outputHeight: height,
        baseWidth: design.baseWidth ?? activeFormat.width,
        baseHeight: design.baseHeight ?? activeFormat.height,
        baseTransform,
        overlay,
        saveToHistory: false,
      }),
    });

    if (!r.ok) {
      const txt = await r.text().catch(() => "");
      console.error("export failed", r.status, txt);
      return;
    }

    const blob = await r.blob();
    const url = URL.createObjectURL(blob);

    //window.open(url, "_blank", "noreferrer");
    const a = document.createElement("a");
    a.href = url;
    a.download = `export_${width}x${height}.png`;
    a.click();
    // опционально освобождать
    setTimeout(() => URL.revokeObjectURL(url), 10_000);

  }

  async function handleDeleteImage(id: string) {
    if (!authed) return;
    setError(null);

    try {
      await apiFetch(`/images/${id}`, {
        method: "DELETE",
      });

      // Оптимистично удаляем из стейта
      setImages((prev) => prev.filter((img) => img.id !== id));

      setImagesTotal((prev) => Math.max(prev - 1, 0));

    } catch (err) {
      setError(getErrorMessage(err));
    }
  }

  function handleDeleteBaseImage() {

    setProBaseImageUrl(null);
    setProDesignId(null);
    setPresetBaseImageUrl(null);
    setUserBaseImageUrl(null);
    setUserProDesignId(null);
    setBaseSource("preset");

    // --- transforms ---
    setBaseScale(1);
    setBaseOffsetX(0);
    setBaseOffsetY(0);
    setFitMode("contain");
    setBaseNaturalSize(null);

    clearSelection()
  }

  function setActivePicWidth(nextW: number) {
    if (!activePicId) return;

    setPics((prev) =>
      prev.map((p) => {
        if (p.id !== activePicId) return p;
        const ratio = p.aspectRatio ?? (p.height / p.width);
        const width = Math.max(1, Math.round(nextW));
        const height = Math.max(1, Math.round(width * ratio));
        return { ...p, width, height };
      })
    );
  }


  const deleteActiveLayer = useCallback(() => {
    const cur = activeLayerRef.current;
    if (!cur) return;

    if (cur.kind === "text") setItems((prev) => prev.filter((x) => x.id !== cur.id));
    if (cur.kind === "pic") setPics((prev) => prev.filter((x) => x.id !== cur.id));
    if (cur.kind === "rect") setRects((prev) => prev.filter((x) => x.id !== cur.id));

    clearSelection();
  }, [clearSelection]);

  function deleteLayer(l: Layer) {
    setItems((prev) => (l.kind === "text" ? prev.filter((x) => x.id !== l.id) : prev));
    setPics((prev) => (l.kind === "pic" ? prev.filter((x) => x.id !== l.id) : prev));
    setRects((prev) => (l.kind === "rect" ? prev.filter((x) => x.id !== l.id) : prev));

    const cur = activeLayerRef.current;
    if (cur && cur.kind === l.kind && cur.id === l.id) {
      clearSelection();
    }
  }


  function layerTitleForText(t: OverlayTextItem) {
    const s = (t.text ?? "").trim();
    if (!s) return "Text";
    return s.length > 28 ? s.slice(0, 28) + "…" : s;
  }

  const layers: Layer[] = useMemo(() => {
    const arr: Layer[] = [];

    items.forEach((t) => arr.push({
      kind: "text",
      id: t.id,
      title: layerTitleForText(t), // ✅
      z: Number(t.z ?? 20),
      bakeLayer: t.bakeLayer ?? "FRONT"
    }));

    pics.forEach((l, idx) => arr.push({
      kind: "pic",
      id: l.id,
      title: `Image ${idx + 1}`,
      z: Number(l.z ?? 10),
      bakeLayer: l.bakeLayer ?? "FRONT"
    }));

    rects.forEach((b, idx) => arr.push({
      kind: "rect",
      id: b.id,
      title: `Rectangle ${idx + 1}`,
      z: Number(b.z ?? 5),
      bakeLayer: b.bakeLayer ?? "FRONT"
    }));

    arr.sort((a, b) => b.z - a.z);

    return arr;
  }, [items, pics, rects]);

  const selectedLayerKey = useMemo(() => {
    if (!activeLayer) return null;
    return `${activeLayer.kind}:${activeLayer.id}`;
  }, [activeLayer]);


  function renumberZ(nextLayersTopToBottom: Layer[]) {

    const bottomToTop = [...nextLayersTopToBottom].reverse();

    const zStep = 10;
    const z = 10;

    setRects(prev => prev.map(x => {
      const layer = bottomToTop.find(l => l.kind === "rect" && l.id === x.id);
      return layer ? { ...x, z: z + (bottomToTop.indexOf(layer) * zStep) } : x;
    }));

    setPics(prev => prev.map(x => {
      const layer = bottomToTop.find(l => l.kind === "pic" && l.id === x.id);
      return layer ? { ...x, z: z + (bottomToTop.indexOf(layer) * zStep) } : x;
    }));

    setItems(prev => prev.map(x => {
      const layer = bottomToTop.find(l => l.kind === "text" && l.id === x.id);
      return layer ? { ...x, z: z + (bottomToTop.indexOf(layer) * zStep) } : x;
    }));
  }

  function moveLayer(layerKey: string, dir: "up" | "down") {
    const idx = layers.findIndex((l) => `${l.kind}:${l.id}` === layerKey);
    if (idx === -1) return;

    const swapWith = dir === "up" ? idx - 1 : idx + 1;
    if (swapWith < 0 || swapWith >= layers.length) return;

    const next = [...layers];
    [next[idx], next[swapWith]] = [next[swapWith], next[idx]];

    renumberZ(next);
  }

  function isLayerVisible(l: Layer): boolean {
    if (l.kind === "text") {
      return items.find(x => x.id === l.id)?.visible !== false;
    }
    if (l.kind === "pic") {
      return pics.find(x => x.id === l.id)?.visible !== false;
    }
    if (l.kind === "rect") {
      return rects.find(x => x.id === l.id)?.visible !== false;
    }
    return true;
  }

  function toggleLayerVisible(l: Layer) {
    if (l.kind === "text") {
      setItems(prev =>
        prev.map(x =>
          x.id === l.id ? { ...x, visible: x.visible === false ? true : false } : x
        )
      );
    }

    if (l.kind === "pic") {
      setPics(prev =>
        prev.map(x =>
          x.id === l.id ? { ...x, visible: x.visible === false ? true : false } : x
        )
      );
    }

    if (l.kind === "rect") {
      setRects(prev =>
        prev.map(x =>
          x.id === l.id ? { ...x, visible: x.visible === false ? true : false } : x
        )
      );
    }
  }

  function hasAnyVisibleLayer() {
    return (
      items.some((t) => t.visible !== false) ||
      pics.some((p) => p.visible !== false) ||
      rects.some((r) => r.visible !== false)
    );
  }


  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Delete" && e.key !== "Backspace") return;

      const el = document.activeElement as HTMLElement | null;
      const tag = el?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || el?.isContentEditable) return;

      if (activeLayerRef.current) {
        e.preventDefault();
        deleteActiveLayer();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [deleteActiveLayer]);


  function setRectFillSolid(color: string) {
    updateActiveRect({ fill: { kind: "solid", color } });
  }

  function setRectFillLinear(next: Partial<Extract<OverlayRectFill, { kind: "linear" }>>) {
    if (!ActiveRect) return;

    // гарантируем, что база - linear
    const base: Extract<OverlayRectFill, { kind: "linear" }> =
      ActiveRect.fill.kind === "linear"
        ? ActiveRect.fill
        : { kind: "linear", from: "rgba(0,0,0,0.65)", to: "rgba(0,0,0,0.0)", angle: 90 };

    updateActiveRect({
      fill: {
        kind: "linear",
        from: next.from ?? base.from,
        to: next.to ?? base.to,
        angle: next.angle ?? base.angle ?? 90,
      },
    });
  }

  function setRectFillKind(kind: OverlayRectFill["kind"]) {
    if (kind === "solid") {
      setRectFillSolid("rgba(0,0,0,0.6)");
    } else {
      setRectFillLinear({}); // переключит в linear с дефолтами
    }
  }

  const effectiveBaseImageUrl =
    baseSource === "user" && userBaseImageUrl
      ? userBaseImageUrl
      : presetBaseImageUrl;

  React.useEffect(() => {
    setProBaseImageUrl(effectiveBaseImageUrl ?? null);
  }, [effectiveBaseImageUrl, setProBaseImageUrl]);

  const shouldConfirm =
    items.length > 0 ||
    pics.length > 0 ||
    rects.length > 0 ||

    proBaseImageUrl !== null ||
    proDesignId !== null ||
    presetBaseImageUrl !== null ||
    userBaseImageUrl !== null ||
    userProDesignId !== null;


  const resetEditor = useCallback(() => {
    // --- layers ---
    setItems([]);
    setPics([]);
    setRects([]);
    setActiveLayer(null);

    // --- base image ---
    setProBaseImageUrl(null);
    setProDesignId(null);
    setPresetBaseImageUrl(null);
    setUserBaseImageUrl(null);
    setUserProDesignId(null);
    setBaseSource("preset");

    // --- transforms ---
    setBaseScale(1);
    setBaseOffsetX(0);
    setBaseOffsetY(0);
    setFitMode("contain");
    setBaseNaturalSize(null);

    // --- prompt / style ---
    setPrompt("");
    //setStyle("instagram_dark");

    // optional: clear “AI tool” errors too
    setRestyleError(null);
    setSwapError(null);

    setImageAdj(DEFAULT_IMAGE_ADJUSTMENTS);

    // --- builder / misc ---
    setBuilderName("My Template");
    setBuilderThumbnailUrl("");

    // --- ui state ---
    setError(null);
    setInfoMsg(null);
    setInfoVisible(false);
    setExpandingBg(false);

    // --- modal snapshots ---
    setBaseBeforeChooser(null);
    setProDesignBeforeChooser(null);
    setEditorKey((k) => k + 1);

  }, []);
  const [editorKey, setEditorKey] = useState(0);

  if (!authed) return null;


  const isPresetsMode = tab === "presets";
  const isStylesMode = tab === "styles";
  const isBrandStylesMode = tab === "brandStyles";

  const canBake = hasAnyVisibleLayer() && !bakingAi && !!selectedBrandStyleId;

  const ids = images.map((x) => x.id);
  const dup = ids.find((id, i) => ids.indexOf(id) !== i);
  if (dup) console.warn("DUPLICATE image id:", dup);


  return (

    <div className="bg-slate-950 text-slate-50">
      <CustomFontsStyle customFonts={customFonts} apiBase={apiBase} />
      <aside className="fixed z-20 hidden lg:block w-[340px] top-[80px] bottom-[10px] left-[20px]">
        <section className="h-full flex flex-col bg-slate-900 border border-slate-800 rounded-2xl text-sm">

          <div className="">
            <div className="flex rounded-xl rounded-b-none border-b-none border-slate-800">
              <button
                type="button"
                onClick={async () => {
                  if (shouldConfirm) {
                    const ok = await dlg.confirm(
                      "Switching to Image Styles will reset the editor.\nSave or export your changes, otherwise they will be lost.",
                      {
                        title: "Warning",
                        okText: "Continue",
                        cancelText: "Cancel",
                      }
                    );

                    if (!ok) return;

                    resetEditor();
                  }

                  openTabAtLeft("styles");
                }}
                className={[
                  "flex-1 text-center text-[13px] font-medium py-4 rounded-tl-[16px] rounded-lg rounded-tr-none rounded-b-none transition-all",
                  tab === "styles"
                    ? "text-slate-100"
                    : "bg-slate-950/80 text-slate-500 hover:text-slate-500 shadow hover:bg-slate-950/50",
                ].join(" ")}
              >
                Image styles
              </button>

              <button
                type="button"
                onClick={() => openTabAtLeft("brandStyles")}
                className={[
                  "flex-1 text-center text-[13px] font-medium py-4 rounded-tl-none rounded-tr-none rounded-b-none transition-all",
                  tab === "brandStyles"
                    ? "text-slate-100"
                    : "bg-slate-950/80 text-slate-500 hover:text-slate-500 shadow hover:bg-slate-950/50",
                ].join(" ")}
              >
                Typo styles
              </button>

              <button
                type="button"
                onClick={() => openTabAtLeft("presets")}
                className={[
                  "flex-1 text-center text-[13px] font-medium py-4 rounded-tl-none rounded-tr-[16px] rounded-b-none transition-all",
                  tab === "presets"
                    ? "text-slate-100"
                    : "bg-slate-950/80 text-slate-500 hover:text-slate-500 shadow hover:bg-slate-950/50",
                ].join(" ")}
              >
                Templates
              </button>
            </div>
          </div>





          {tab === "styles" && (
            <>
              <StyleFilterSwitch value={styleFilter} onChange={setStyleFilter} counts={styleCounts} />
              <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin-custom">

                <div className="p-3 h-full">

                  {loadingStyles ? (
                    <div className="flex h-full items-center justify-center gap-2 text-xs text-slate-500">
                      <Spinner size={55} thickness={5} />
                    </div>
                  ) : dbStyles.length === 0 ? (
                    <div className="text-sm text-slate-400 p-3">No image styles</div>
                  ) : (
                    <StylePickerGrid
                      styles={stylePickerItems}
                      value={styleId}
                      onChange={setStyleId}
                      onView={(id) => void setStylePreview(id)}
                      onDelete={(id) => void onDeleteStyle(id)}
                      hasMore={hasMore}
                      isLoadingMore={loadingMore}
                      onLoadMore={() => void loadMoreStyles()}
                    />

                  )}
                </div>

              </div>
              <div className="pb-3 pt-1 px-3 justify-center">
                {loadingStyles ? (
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <span>Loading…</span>
                  </div>
                ) : (
                  <>
                    {addStyleErr ? (
                      <div className="mt-2 text-[12px] rounded-md text-red-400 p-3 bg-red-500/10 border border-red-300/50 mb-2">{addStyleErr}</div>
                    ) : null}
                    <div className="w-full mb-1">
                      {styleFilter === "mine" && (<button
                        type="button"
                        onClick={handleAddStyle}
                        disabled={addStyleBusy}
                        className={[
                          "w-full py-4 px-4 rounded-lg border border-dashed",
                          "flex flex-col items-center justify-center",
                          addStyleBusy
                            ? "border-slate-800 cursor-not-allowed pointer-events-none"
                            : "border-slate-700 hover:bg-blue-500/10 hover:border-blue-500/30 cursor-pointer"
                        ].join(" ")}
                      >
                        <div className="w-full gap-2 flex items-center justify-center text-slate-400">
                          {addStyleBusy ? (
                            <>
                              <Spinner size={16} thickness={3} className="text-slate-300" />
                              <span>Creating…</span>
                            </>
                          ) : (
                            <span className="inline-flex items-center gap-1">
                              Add Image style
                              <div className="flex items-center px-1 whitespace-nowrap">
                                <Flame className="w-4 h-4 text-orange-500" />
                                <span className="text-orange-500 pl-1">{formatCredits(addStyleCost)}</span>
                              </div>
                            </span>

                          )}
                        </div>
                      </button>)}

                    </div>

                    <div className="w-full">



                      {comboMode ? (
                        <button
                          type="button"
                          onClick={async () => {

                            if (!styleId || comboItems.length < 2) return;

                            if (comboItems.length < 2) {
                              void dlg.alert("Add at least 2 photos for Combo mode.", { title: "Combo mode" });
                              return;
                            }

                            const cost = getActionCostCredits("COMBO_PREVIEW");
                            const balance = typeof me?.tenant?.creditsBalance === "number" ? me.tenant.creditsBalance : 0;

                            if (balance < cost) {
                              openPaywall({
                                code: "INSUFFICIENT_CREDITS",
                                action: "COMBO_PREVIEW",
                                requiredCredits: cost,
                                balanceCredits: balance,
                                creditsBalance: balance,
                              });
                              return;
                            }
                            setComboModalOpen(true);
                          }}
                          disabled={!styleId || comboItems.length < 2}
                          className={[
                            "rounded-lg px-3 py-2 text-md font-medium w-full",
                            "border border-slate-800",
                            "bg-blue-500/50 hover:bg-blue-500/70",
                            (!styleId || comboItems.length < 2) ? "opacity-50 cursor-not-allowed" : "",
                          ].join(" ")}
                        >
                          <span className="inline-flex items-center gap-1">
                            Combo preview
                            <div className="flex items-center px-1 whitespace-nowrap">
                              <Flame className="w-4 h-4 text-orange-500" />
                              <span className="text-orange-500 pl-1">{formatCredits(comboCost)}</span>
                            </div>
                          </span>
                        </button>
                      ) : (

                        <button
                          type="button"
                          title={!styleId && proDesignId ? ("Choose a style to enable “Apply style”") : ("")}
                          onClick={() => {
                            const cost = getActionCostCredits("RESTYLE_PREVIEW");
                            const balance = typeof me?.tenant?.creditsBalance === "number" ? me.tenant.creditsBalance : 0;

                            if (balance < cost) {
                              openPaywall({
                                code: "INSUFFICIENT_CREDITS",
                                action: "RESTYLE_PREVIEW",
                                requiredCredits: cost,
                                balanceCredits: balance,
                                creditsBalance: balance,
                              });
                              return;
                            }

                            setPreviewModalOpen(true);
                          }}
                          disabled={restyleLoading || !proDesignId || !styleId}
                          className={[
                            "rounded-lg px-3 py-2 text-md font-medium w-full",
                            "border border-slate-800",
                            "bg-blue-500/50 hover:bg-blue-500/70",
                            (!proDesignId || !styleId || restyleLoading) ? "opacity-50 cursor-not-allowed" : "",
                          ].join(" ")}
                        >
                          <span className="inline-flex items-center gap-1">
                            Restyle preview
                            <div className="flex items-center px-1 whitespace-nowrap">
                              <Flame className="w-4 h-4 text-orange-500" />
                              <span className="text-orange-500 pl-1">{formatCredits(previewCost)}</span>
                            </div>
                          </span>
                        </button>

                      )}



                    </div>
                  </>
                )}

              </div>
            </>
          )}


          {tab === "brandStyles" && (
            <>
              <BrandStyleFilterSwitch value={brandFilter} onChange={setBrandFilter} counts={brandCounts} />
              <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin-custom">
                <div className="p-3 h-full">
                  {loadingBrandStyles ? (
                    <div className="flex h-full items-center justify-center gap-2 text-xs text-slate-500">
                      <Spinner size={55} thickness={5} />
                    </div>
                  ) : brandStyles.length === 0 ? (
                    <div className="text-sm text-slate-400 p-3">No brand styles</div>
                  ) : (
                    <>
                      <BrandStylePickerGrid
                        styles={brandStyles}
                        value={selectedBrandStyleId}
                        onChange={setSelectedBrandStyleId}
                        onView={(url) => setBrandPreview(url)}
                        onDelete={(id) => void onDeleteBrandStyle(id)}
                        hasMore={brandHasMore}
                        isLoadingMore={loadingBrandMore}
                        onLoadMore={() => void loadMoreBrandStyles()}
                      />
                    </>
                  )}
                </div>
              </div>

              <div className="pb-3 pt-1 px-3 justify-center">
                {loadingBrandStyles ? (
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <span>Loading…</span>
                  </div>
                ) : (
                  <>
                    {brandErr ? (
                      <div className="mt-2 text-[12px] rounded-md text-red-400 p-3 bg-red-500/10 border border-red-300/50 mb-2">
                        {brandErr}
                      </div>
                    ) : null}

                    {/* ADD brand style reference -> auto create */}
                    <div className="w-full mb-1">
                      {brandFilter === "mine" && (
                        <button
                          type="button"
                          disabled={creatingBrand}
                          onClick={() => {
                            if (creatingBrand) return;

                            const costRaw = getActionCostCredits("ADD_BRANDSTYLE");
                            const cost = Number(costRaw);
                            const balance = me?.tenant?.creditsBalance ?? 0;

                            // ✅ safety: if cost is missing/0/NaN, treat as paid action (force paywall)
                            const effectiveCost = Number.isFinite(cost) && cost > 0 ? cost : 1;

                            if (balance < effectiveCost) {
                              openPaywall({
                                code: "INSUFFICIENT_CREDITS",
                                action: "ADD_BRANDSTYLE",
                                requiredCredits: effectiveCost,
                                balanceCredits: balance,
                                creditsBalance: balance,
                              });
                              return;
                            }

                            // ✅ open picker only if enough credits
                            const input = fileInputRef.current;
                            if (!input) return;
                            input.value = ""; // allow selecting same file again
                            input.click();
                          }}
                          className={[
                            "w-full py-4 px-4 rounded-lg border border-dashed",
                            "flex flex-col items-center justify-center",

                            creatingBrand
                              ? "border-slate-800 cursor-not-allowed pointer-events-none"
                              : "border-slate-700 hover:bg-blue-500/10 hover:border-blue-500/30 cursor-pointer",
                          ].join(" ")}
                        >
                          <div className="w-full gap-2 flex items-center justify-center text-slate-400">
                            {creatingBrand ? (
                              <>
                                <Spinner size={16} thickness={3} className="text-slate-300" />
                                <span>Creating…</span>
                              </>
                            ) : (
                              <span className="inline-flex items-center gap-1">
                                Add style reference
                                <div className="flex items-center px-1 whitespace-nowrap">
                                  <Flame className="w-4 h-4 text-orange-500" />
                                  <span className="text-orange-500 pl-1">
                                    {formatCredits(addBrandStyleCost)}
                                  </span>
                                </div>
                              </span>
                            )}
                          </div>
                        </button>
                      )}

                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0] ?? null;
                          e.currentTarget.value = "";
                          if (!file) return;

                          setBrandFile(file);
                          // setBrandPreview(URL.createObjectURL(file));

                          void handleCreateBrandStyle(file);
                        }}
                      />
                    </div>


                    {/* BAKE (no modal) */}
                    <div className="w-full">
                      <button
                        type="button"
                        title={!hasAnyVisibleLayer() ? "Add or show at least one layer to apply typo style" : undefined}
                        disabled={bakingAi || !proDesignId || !selectedBrandStyleId || !canBake}
                        onClick={() => {
                          const cost = getActionCostCredits("BAKE_BRANDSTYLE");
                          const balance = typeof me?.tenant?.creditsBalance === "number" ? me.tenant.creditsBalance : 0;

                          if (balance < cost) {
                            openPaywall({
                              code: "INSUFFICIENT_CREDITS",
                              action: "BAKE_BRANDSTYLE",
                              requiredCredits: cost,
                              balanceCredits: balance,
                              creditsBalance: balance,
                            });
                            return;
                          }

                          openBakeModal();
                        }}
                        className={[
                          "rounded-lg px-3 py-2 text-md font-medium w-full",
                          "border border-slate-800",
                          "bg-blue-500/40 hover:bg-blue-500/60",
                          (!proDesignId || !selectedBrandStyleId || bakingAi || !canBake) ? "opacity-50 cursor-not-allowed" : "",
                        ].join(" ")}
                      >
                        <span className="inline-flex items-center gap-1">
                          {bakingAi ? "Applying..." : "Apply typo style"}
                          <div className="flex items-center px-1 whitespace-nowrap">
                            <Flame className="w-4 h-4 text-orange-500" />
                            <span className="text-orange-500 pl-1">{formatCredits(bakeBrandStyleCost)}</span>
                          </div>
                        </span>
                      </button>
                    </div>
                  </>
                )}
              </div>
            </>
          )}



          {tab === "presets" && (
            <>
              <PresetFilterSwitch value={presetFilter} onChange={setPresetFilter} counts={presetCounts} />
              <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin-custom">
                <PresetsBlock
                  layout="masonry"
                  title="Presets"
                  items={filteredPresets}
                  loading={presetsLoading}
                  loadingMore={presetsLoadingMore}
                  hasMore={presetsHasMore}
                  onEndReached={loadMorePresets}
                  endReachedMarginPx={500}
                  error={presetsError}
                  getId={(p) => p.id}
                  gap={2}
                  renderCard={(p) => {
                    const isCustom = p.scope === "TENANT" && "SYSTEM";
                    const isSelected = selectedPresetId === p.id;
                    return (
                      <div
                        className={[
                          "relative p-1",
                          isCustom ? "" : "",
                        ].join(" ")}
                      >
                        {/* Delete icon (only for TENANT) */}
                        {isCustom && (
                          <button
                            type="button"
                            title="Delete template"
                            className="
                                    absolute right-2 top-2 z-10
                                    rounded-full
                                    bg-black/60 hover:bg-red-500/80
                                    p-2
                                    text-white
                                    transition
                                  "
                            onClick={async (e) => {
                              e.preventDefault();
                              e.stopPropagation();

                              const label = p.title ?? "Untitled";

                              const ok = await dlg.confirm(
                                `Delete template "${label}"? This cannot be undone.`,
                                {
                                  title: "Delete template",
                                  okText: "Delete",
                                  cancelText: "Cancel",
                                }
                              );

                              if (!ok) return;

                              try {
                                await removePreset(p.id);
                                setSelectedPresetId(null);
                              } catch (err: unknown) {
                                console.error("Failed to delete template", err);

                                await dlg.alert(getErrorMessage(err), {
                                  title: "Failed to delete template",
                                });
                              }
                            }}

                          >
                            <Trash2 size={14} />
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={async () => {
                            try {
                              if (!authed) return;

                              setSelectedPresetId(p.id);

                              const full = await fetchPreset(p.id);

                              setSelectedPreset(full);

                            } catch (e) {
                              console.error("Failed to select template", e);
                            }
                          }}
                          className={[
                            "group text-left rounded-2xl border overflow-hidden",
                            "bg-slate-950/60 hover:bg-slate-950",
                            "transition-colors",
                            isSelected
                              ? "border-blue-500/70 border-[2px] ring-3 ring-blue-500/30"
                              : "border-slate-800 hover:border-slate-700",
                          ].join(" ")}>

                          <div className="aspect-[auto]">
                            <div
                              className="
                                absolute top-2 left-2 z-10
                                rounded-[7px]
                                bg-black/50
                                px-2 py-1
                                text-[10px]
                                text-white-700
                                backdrop-blur
                                pointer-events-none
                              "
                            >
                              {p.format}
                            </div>

                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={`${apiBase}${p.thumbnailUrl}`}
                              alt={p.title ?? "Preset"}
                              className="w-full h-full object-contain"
                              draggable={false}
                            />
                          </div>

                          {/* <div className="px-3 py-2 bg-slate-950/60 hover:bg-slate-950">
                            <div className="text-xs truncate">
                              {p.title ?? p.name ?? "Untitled"}
                            </div>
                          </div> */}
                        </button>
                      </div>
                    );
                  }}
                />

              </div>


              <div className="pb-3 pt-1 px-3 justify-center">
                {addStyleErr ? (
                  <div className="mt-2 text-[12px] rounded-md text-red-400 p-3 bg-red-500/10 border border-red-300/50 mb-2">{addStyleErr}</div>
                ) : null}
                {/* <div className="w-full mb-1">
                  <button
                    type="button"
                    disabled={uploading}
                    onClick={() => changePhotoInputRef.current?.click()}
                    className={[
                      "w-full py-1 px-1 rounded-lg border border-dashed",
                      "flex flex-col items-center justify-center",
                      addStyleBusy
                        ? "border-slate-800 text-slate-500 cursor-not-allowed pointer-events-none"
                        : "border-slate-700 hover:bg-blue-500/10 hover:border-blue-500/30 cursor-pointer"
                    ].join(" ")}
                  >
                    <div className="w-full gap-2 flex text-slate-400">

                      <span className="inline-flex items-center gap-1 whitespace-nowrap">
                        <>
                          <div className="w-11 h-11 rounded-md border border-slate-800 hover:border-slate-100 overflow-hidden mr-5">
                            {baseThumbUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={baseThumbUrl} className="w-full h-full object-cover" alt="Dish" />) : (
                              <span className="w-full h-full flex items-center justify-center text-[10px] text-slate-500"><Upload size={20} /></span>
                            )}
                          </div>
                          <div className="justify-center">{proBaseImageUrl ? "Change your photo" : "Upload photo for swap"}</div>
                          <input
                            ref={changePhotoInputRef}
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={async (e) => {
                              const file = e.target.files?.[0];
                              e.currentTarget.value = "";
                              if (!file) return;
                              await handleUploadSelectedFile(file);
                            }}
                          />
                        </>


                      </span>
                    </div>


                  </button>

                </div> */}

                <div className="w-full flex gap-1">
                  <button
                    type="button"
                    disabled={!selectedPreset || !presets.some(p => p.id === selectedPreset.id)}
                    onClick={handleApplyPreset}
                    className={[
                      "w-full min-w-[100px] rounded-lg px-4 py-2 text-md font-medium",
                      "border border-slate-800",
                      "bg-blue-500/50 hover:bg-blue-500/70",
                      !selectedPreset ? "opacity-50 cursor-not-allowed" : "",
                    ].join(" ")}
                  >
                    Apply template
                  </button>

                  {/* <button
                    type="button"
                    disabled={!selectedPreset || applyingPreset || !authed || !(proDesignId ?? userProDesignId)}
                    onClick={handleApplyPresetAndCutout}
                    className={[
                      "rounded-lg px-2 py-2 text-md font-medium w-full",
                      "border border-slate-800",
                      "bg-blue-500/50 hover:bg-blue-500/70",
                      (!selectedPreset || applyingPreset || !authed || !(proDesignId ?? userProDesignId))
                        ? "opacity-50 cursor-not-allowed"
                        : "",
                    ].join(" ")}
                  >
                    <span className="inline-flex items-center gap-1">
                      {applyingPreset ? "Applying..." : "Apply with dish swap"}
                      <div className="flex items-center px-1 whitespace-nowrap">
                        <Flame className="w-4 h-4 text-orange-500" />
                        <span className="text-orange-500 pl-1">{formatCredits(presetSwapCost)}</span>
                      </div>
                    </span>
                  </button> */}
                </div>
              </div>
            </>
          )}
        </section>
      </aside>

      <aside className="fixed z-20 hidden lg:block w-[340px] top-[80px] bottom-[10px] right-[20px]">

        <section className="h-full flex flex-col bg-slate-900 border border-slate-800 rounded-2xl p-0 text-sm">
          <div className="flex items-center justify-between mb-3 mx-5 mt-5">
            <span className="text-lg text-slate-400 leading-tight">Export history</span>
            <div>
              <div className="text-[11px] text-slate-400 p-0 text-right">{imagesTotal} of {EXPORT_CAP}</div>
              <div className="text-[9px] text-slate-500">old images will be deleted</div>
            </div>
            {loadingImages && (
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <Spinner size={14} thickness={2} />
                <span>Loading…</span>
              </div>
            )}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin-custom p-4 pt-2" ref={scrollRootRef}>


            {loadingImages ? (
              <div className="flex h-full items-center justify-center gap-2 text-xs text-slate-500">
                <Spinner size={55} thickness={5} />
              </div>
            ) : images.length === 0 ? (
              <div className="text-xs text-slate-500">No images yet.</div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-1 gap-4">
                {images.map((img) => (

                  <div
                    key={img.id}
                    className="border border-slate-800 rounded-xl overflow-hidden bg-slate-900/60"
                  >

                    <div className="aspect-square">

                      { /* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={`${apiBase}${img.imageUrl}`}
                        alt={img.prompt}
                        className="w-full h-full object-contain"
                      />
                    </div>

                    <div className="p-2">
                      <div className="text-[10px] text-slate-400 line-clamp-2">
                        <div className="">{img.prompt}</div>
                        {/* <span>{getAspectLabel(img.width, img.height)}</span>
                          <span>-</span> */}
                        <div className="">{img.width}×{img.height}</div>
                        {/* <span>-</span>
                          <span>{getScaleLabel(1024, 1024, img.width, img.height)}</span> */}
                      </div>
                      <div className="text-[10px] text-slate-500 mt-1 mb-2">
                        {new Date(img.createdAt).toLocaleString()}
                      </div>

                      <div className="flex gap-2 items-center">

                        <button
                          type="button"
                          disabled={!img.proDesignId}
                          onClick={() => {
                            if (!img.proDesignId) return;
                            void handleRenderExportFromHistory(
                              img.proDesignId,
                              standardMaxSide
                            );
                          }}
                          className="text-[10px] px-2 py-1 text-xs rounded border text-blue-400 hover:text-blue-300 disabled:opacity-50"
                          title={`Download ${activeFormat.width}×${activeFormat.height}`}
                        >
                          Download
                        </button>

                        <button
                          type="button"
                          disabled={!img.proDesignId || maxExportPx < 2048}
                          onClick={() => img.proDesignId && void handleRenderExportFromHistory(img.proDesignId, 2048)}
                          className="text-[10px] px-2 py-1 text-xs rounded border text-blue-400 hover:text-blue-300 disabled:opacity-50"
                          title={
                            !img.proDesignId
                              ? "No design id for export"
                              : maxExportPx < 2048
                                ? "Upgrade to Editor to unlock 2K"
                                : "Render & download 2K"
                          }
                        >
                          2K
                        </button>

                        <button
                          type="button"
                          disabled={!img.proDesignId || maxExportPx < 4096}
                          onClick={() => img.proDesignId && void handleRenderExportFromHistory(img.proDesignId, 4096)}
                          className="text-[10px] px-2 py-1 text-xs rounded border text-blue-400 hover:text-blue-300 disabled:opacity-50"
                          title={
                            !img.proDesignId
                              ? "No design id for export"
                              : maxExportPx < 4096
                                ? "Upgrade to Pro to unlock 4K"
                                : "Render & download 4K"
                          }
                        >
                          4K
                        </button>

                        <button
                          type="button"
                          onClick={async () => {
                            const ok = await dlg.confirm(
                              "Delete this image from the history?",
                              {
                                title: "Warning",
                                okText: "Delete",
                                cancelText: "Cancel",
                              }
                            );

                            if (!ok) return;

                            await handleDeleteImage(img.id);
                          }}

                          className="text-[10px] px-2 py-1 text-xs rounded border text-red-400 hover:text-red-300"
                        >
                          Delete
                        </button>
                      </div>


                    </div>
                  </div>


                ))}

                <div ref={sentinelRef} className="h-1 w-full" />

                {loadingImagesMore && (
                  <div className="flex text-xs text-slate-500 mt-2 justify-center">Loading…</div>
                )}
              </div>
            )}
          </div>

          <div className="py-3 px-5 flex justify-center">

            {loadingImages ? (
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <span>Loading…</span>
              </div>
            ) : (
              <button
                type="button"
                onClick={handleRender}
                disabled={!proDesignId}
                //disabled={!proBaseImageUrl}
                className={`
                rounded-lg px-3 py-2 text-md font-medium w-full border border-slate-800 
                ${proBaseImageUrl
                    ? "bg-emerald-500/70 hover:bg-emerald-500/90"
                    : "bg-emerald-600 opacity-40 cursor-not-allowed border-slate-700"}
                          `}
                title={!proBaseImageUrl ? "First generate or upload an image" : undefined}
              >
                Render / Export
              </button>
            )}


            <div>

            </div>
          </div>
        </section>

      </aside>


      <main className="relative z-10 w-full px-4 py-6 pl-[380px] pr-[380px] mt-[58px]">
        <div className="mx-auto max-w-[1100px]">
          <section className="bg-slate-900 border border-slate-800 rounded-2xl p-4 text-sm pb-100">
            <div className="">

              <div className="overflow-hidden">

                <div className="flex gap-0">

                  {/* LEFT: Layers */}
                  <div className="w-[60%]">
                    <div className="space-y-2">

                      {error && (
                        <div className="p-4 m-3 text-sm text-red-400 bg-red-900/20 border border-red-800 rounded-md px-3 py-2">
                          {error}
                        </div>
                      )}
                      {restyleError ? (
                        <div className="p-4 m-3 text-sm text-red-400 bg-red-900/20 border border-red-800 rounded-md px-3 py-2">
                          {restyleError}</div>
                      ) : null}

                      {bakeErr ? (
                        <div className="p-4 m-3 text-sm text-red-400 bg-red-900/20 border border-red-800 rounded-md px-3 py-2">
                          {bakeErr}
                        </div>
                      ) : null}

                      <div className="w-full min-w-0 my-2 flex justify-between">
                        <div className="flex pl-3">
                          <FormatPickerCompact
                            formats={POST_FORMATS}
                            value={formatId}
                            onChange={setFormatId}
                            // опционально:
                            columns={3}
                            boxSizePx={26}
                          // previewMaxPx={26}
                          />
                          <div className="text-xs text-slate-400 pl-2 pt-1">
                            <span className="text-slate-200 text-[11px] flex">{activeChoosenFormat.width}x{activeChoosenFormat.height}</span>{" "}
                            <span className="text-slate-400 text-[10px]">{activeChoosenFormat.description}</span>
                          </div>
                        </div>

                        {tab === "styles" && (
                          <div className="flex justify-center mr-3 border border-slate-700 rounded-lg pr-1 pl-2 bg-slate-950/50 h-8">
                            <button
                              type="button"

                              onClick={async () => {
                                const ok = await dlg.confirm(
                                  "Switching to Combo mode will reset the editor.\nAll current changes will be lost. Continue?",
                                  {
                                    title: t("dialog.warning"),
                                    okText: "Continue",
                                    cancelText: "Cancel",
                                  }
                                );

                                if (!ok) return;

                                resetEditor();

                                setComboMode(v => {
                                  const next = !v;
                                  if (!next) setComboItems([]);
                                  return next;
                                });
                              }}

                              className="flex items-center gap-2"
                            >
                              <span className="text-xs text-slate-400">Combo</span>

                              <div
                                className={[
                                  "relative inline-flex h-5 w-9 items-center rounded-full transition-colors",
                                  comboMode ? "bg-blue-500/70" : "bg-slate-700",
                                ].join(" ")}
                              >
                                <span
                                  className={[
                                    "inline-block h-4 w-4 transform rounded-full transition-transform",
                                    comboMode ? "translate-x-5 bg-slate-200" : "translate-x-0 bg-slate-800",
                                  ].join(" ")}
                                />
                              </div>
                            </button>


                          </div>)}
                      </div>


                      <div ref={previewHostRef} className="w-full min-w-0 flex justify-center px-1">

                        <div
                          className="bg-checker relative border border-slate-700 rounded-xl overflow-hidden bg-slate-950"
                          style={{ width: previewWidth, height: previewHeight }}
                          onMouseDown={(e) => {
                            if (e.target !== e.currentTarget) return;
                            clearSelection();

                            // если зума нет — pan не нужен
                            if (!proBaseImageUrl) return;
                            //if (baseScale <= 1) return;

                            isPanningRef.current = true;
                            panStartRef.current = {
                              x: e.clientX,
                              y: e.clientY,
                              ox: baseOffsetX,
                              oy: baseOffsetY,
                            };
                          }}
                          onMouseMove={(e) => {
                            if (!isPanningRef.current) return;

                            const dx = e.clientX - panStartRef.current.x;
                            const dy = e.clientY - panStartRef.current.y;

                            setBaseOffsetX(panStartRef.current.ox + dx);
                            setBaseOffsetY(panStartRef.current.oy + dy);
                          }}
                          onMouseUp={() => {
                            isPanningRef.current = false;
                          }}
                          onMouseLeave={() => {
                            isPanningRef.current = false;
                          }}
                        >

                          {editorBaseImageUrl ? (
                            <>
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={editorBaseImageUrl ?? undefined}
                                onLoad={(e) => {
                                  setBaseNaturalSize({
                                    w: e.currentTarget.naturalWidth,
                                    h: e.currentTarget.naturalHeight,
                                  });
                                }}
                                alt="Base"
                                draggable={false}
                                className={`absolute inset-0 w-full h-full select-none pointer-events-none ${fitMode === "cover" ? "object-cover" : "object-contain"
                                  }`}
                                style={{
                                  transform: `translate(${baseOffsetX}px, ${baseOffsetY}px) scale(${baseScale})`,
                                  transformOrigin: "center",
                                  filter: previewAdj.filter,
                                }}
                              />

                              {/* Vignette + Grain (preview overlays) */}
                              {(previewAdj.vignetteOpacity > 0 || previewAdj.grainOpacity > 0) && (
                                <div className="absolute inset-0 pointer-events-none">
                                  {previewAdj.vignetteOpacity > 0 && (
                                    <div
                                      className="absolute inset-0"
                                      style={{
                                        background:
                                          "radial-gradient(ellipse at center, rgba(0,0,0,0) 50%, rgba(0,0,0,1) 100%)",
                                        opacity: previewAdj.vignetteOpacity * 2,
                                      }}
                                    />
                                  )}

                                  {previewAdj.grainOpacity > 0 && (
                                    <div
                                      className="absolute inset-0 pointer-events-none mix-blend-soft-light"
                                      style={{
                                        opacity: previewAdj.grainOpacity * 2.2,
                                        backgroundImage:
                                          "repeating-linear-gradient(0deg, rgba(255,255,255,0.06), rgba(255,255,255,0.06) 1px, rgba(0,0,0,0.06) 1px, rgba(0,0,0,0.06) 2px)",
                                        mixBlendMode: "multiply",
                                      }}
                                    />
                                  )}
                                </div>
                              )}
                            </>
                          ) : (
                            <div className="w-full absolute inset-0 flex items-center justify-center p-6">
                              <div className="w-full h-full">
                                {comboMode ? (
                                  <>
                                    {comboMode && (

                                      <div className="w-full h-full rounded-2xl border border-slate-800 flex flex-col items-center justify-center text-slate-400 text-sm gap-4">





                                        <div className="space-y-1">
                                          <div className="text-sm text-slate-100 opacity-70">
                                            Combo mode. Add 2–4 photos.
                                          </div>
                                          <div className="flex text-xs text-slate-400 opacity-50 justify-center">
                                            JPG/PNG/WebP · up to 5 MB
                                          </div>
                                        </div>


                                        <div className="flex items-center justify-between mb-2">


                                          <label className={[
                                            "rounded-2xl flex items-center justify-center gap-2 text-xs px-10 py-10 rounded-lg border-slate-800 border border-dashed",
                                            comboItems.length >= 4 ? "opacity-50 cursor-not-allowed" : "hover:bg-slate-950 hover:border-blue-500/50 cursor-pointer",
                                          ].join(" ")}>
                                            <Upload className="w-8 h-8" />
                                            <input
                                              type="file"
                                              accept="image/png,image/jpeg,image/webp"
                                              className="hidden"
                                              disabled={comboItems.length >= 4}
                                              onChange={async (e) => {
                                                const file = e.target.files?.[0];
                                                e.target.value = "";
                                                if (!file) return;
                                                try {
                                                  await handleUploadComboItem(file);
                                                } catch (err: unknown) {
                                                  await dlg.alert(getErrorMessage(err), { title: "Upload failed" });
                                                }
                                              }}
                                            />
                                          </label>
                                        </div>


                                        <div className="mt-3">


                                          <div className="grid grid-cols-4 gap-2">
                                            {comboItems.map((it, idx) => (
                                              <div key={it.id} className="rounded-xl border border-slate-800 bg-slate-900/30 overflow-hidden justify-center">
                                                <div className="relative aspect-[1/1] w-24 h-24 bg-red-500">
                                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                                  <img src={it.absUrl || `${apiBase}${it.imageUrl}`} alt={`Combo ${idx + 1}`} className="absolute inset-0 w-full h-full object-cover" />
                                                  <div className="hidden absolute top-2 left-2 text-[11px] px-2 py-1 rounded-md bg-black/50 text-slate-100">
                                                    #{idx + 1}
                                                  </div>

                                                  <button
                                                    type="button"
                                                    onClick={() => setComboItems(prev => prev.filter(x => x.id !== it.id))}
                                                    className="absolute top-1 right-1 rounded-lg bg-black/50 text-slate-200 hover:bg-black/70"
                                                    title="Remove"
                                                  >
                                                    <X className="w-3 h-3" />
                                                  </button>

                                                  <div className="absolute bottom-1 w-full justify-center">
                                                    <div className="flex gap-1 bottom-1 justify-center">
                                                      <button
                                                        type="button"
                                                        disabled={idx === 0}
                                                        onClick={() => {
                                                          setComboItems(prev => {
                                                            if (idx === 0) return prev;
                                                            const next = [...prev];
                                                            const tmp = next[idx - 1];
                                                            next[idx - 1] = next[idx];
                                                            next[idx] = tmp;
                                                            return next;
                                                          });
                                                        }}
                                                        className={[
                                                          "px-2 py-1 text-xs text-white rounded bg-black/70",
                                                          idx === 0 ? "opacity-30 cursor-not-allowed" : "hover:bg-slate-800",
                                                        ].join(" ")}
                                                      >
                                                        ←
                                                      </button>

                                                      <button
                                                        type="button"
                                                        disabled={idx === comboItems.length - 1}
                                                        onClick={() => {
                                                          setComboItems(prev => {
                                                            if (idx === prev.length - 1) return prev;
                                                            const next = [...prev];
                                                            const tmp = next[idx + 1];
                                                            next[idx + 1] = next[idx];
                                                            next[idx] = tmp;
                                                            return next;
                                                          });
                                                        }}
                                                        className={[
                                                          "px-2 py-1 text-xs text-white rounded bg-black/70",
                                                          idx === comboItems.length - 1 ? "opacity-30 cursor-not-allowed" : "hover:bg-slate-800",
                                                        ].join(" ")}
                                                      >
                                                        →
                                                      </button>
                                                    </div>
                                                  </div>
                                                </div>


                                              </div>
                                            ))}
                                          </div>

                                          {/* <div className="flex justify-center mt-10 text-[11px] text-slate-500">
                                          Tip: first photo becomes hero in “Hero + sides”.
                                        </div> */}
                                        </div>
                                      </div>
                                    )}




                                  </>
                                ) : (
                                  <UploadDropzone
                                    disabled={uploading}
                                    onFile={async (file) => {
                                      await handleUploadSelectedFile(file);
                                    }}
                                  />
                                )}
                              </div>
                            </div>
                          )}

                          {aiBusy && (
                            <div className="absolute inset-0 z-255 bg-slate-950/80 flex items-center justify-center">
                              <div className="flex flex-col items-center gap-3 select-none">
                                <Spinner size={96} thickness={8} />
                                <div className="text-xs text-sky-100/70">{aiPhase}</div>
                              </div>
                            </div>
                          )}

                          <div key={editorKey}>

                            {rects.map((b) => (
                              <RectsPreviewBox
                                key={b.id}
                                id={b.id}
                                isActive={b.id === activeRectId}
                                onSelect={(id) => {
                                  selectRect(id);
                                }}

                                cfg={rectToOverlayCfg(b)}
                                scaleX={previewScaleX}
                                scaleY={previewScaleY}
                                onChange={(patch) =>
                                  setRects((prev) => prev.map((x) => (x.id === b.id ? { ...x, ...patch } : x)))
                                }
                                onChangeMargins={(m) => {
                                  setRects((prev) => prev.map((x) => (x.id === b.id ? { ...x, ...m } : x)));
                                }}
                                onChangeRotationDeg={(deg) => {
                                  setRects(prev => prev.map(x => (x.id === b.id ? { ...x, rotationDeg: deg } : x)));
                                }}
                              />
                            ))}

                            {pics.map((l) => (
                              <PicsPreviewBox
                                key={l.id}
                                id={l.id}
                                isActive={l.id === activePicId}
                                onSelect={(id) => {
                                  selectPic(id);
                                }}
                                item={l}
                                scaleX={previewScaleX}
                                scaleY={previewScaleY}
                                onChangeRotationDeg={(deg) => {
                                  setPics((prev) =>
                                    prev.map((x) => (x.id === l.id ? { ...x, rotationDeg: deg } : x))
                                  );
                                }}
                                onChange={(patch) => {
                                  setPics((prev) => prev.map((x) => (x.id === l.id ? { ...x, ...patch } : x)));
                                }}
                              />
                            ))}

                            {items.map((it) => (
                              <TextsPreviewBox
                                key={it.id}
                                id={it.id}
                                isActive={it.id === activeTextId}
                                onSelect={(id) => {
                                  selectText(id);
                                }}
                                onDeselectpic={() => {
                                  const cur = activeLayerRef.current;
                                  if (cur?.kind === "pic") clearSelection();
                                }}
                                cfg={itemToOverlayCfg(it)}
                                scaleX={previewScaleX}
                                scaleY={previewScaleY}
                                onChangeRotationDeg={(deg) => {
                                  setItems((prev) => prev.map((x) => (x.id === it.id ? { ...x, rotationDeg: deg } : x)));
                                }}
                                onChangeMargins={(m) => {
                                  setItems((prev) => prev.map((x) => (x.id === it.id ? { ...x, ...m } : x)));
                                }}
                                onChangeText={(nextText) => {
                                  setItems((prev) => prev.map((x) => (x.id === it.id ? { ...x, text: nextText } : x)));
                                }}
                              />
                            ))}

                          </div>




                        </div>
                      </div>


                      {!comboMode && (<div className="-mt-1">


                        <div className="flex items-center justify-center gap-1 mb-2 bg-slate-950 px-3 py-2 rounded-md mx-3 border border-slate-800">
                          <div className="text-slate-400 text-xs">Image:</div>


                          <button
                            type="button"
                            onClick={async () => {
                              if (!proBaseImageUrl) return;

                              const ok = await dlg.confirm(
                                "Are you sure you want to remove the image from the editor?",
                                {
                                  title: "Warning",
                                  okText: "Remove",
                                  cancelText: "Cancel",
                                }
                              );

                              if (!ok) return;

                              await handleDeleteBaseImage();
                            }}
                            disabled={!proBaseImageUrl}
                            className={[
                              "px-2 py-1 text-xs rounded border border-red-500/50 mr-2 transition",
                              !proBaseImageUrl
                                ? "border-slate-800 text-slate-600"
                                : "hover:bg-red-500/10 text-red-400",
                            ].join(" ")}
                            title={!proBaseImageUrl ? "No image to clear" : "Delete image"}
                          >
                            Clear
                          </button>


                          <button
                            type="button"
                            className={[
                              "px-2 py-1 text-xs rounded border border-slate-700",
                              !proBaseImageUrl
                                ? "border-slate-800 text-slate-600"
                                : "hover:bg-slate-800",
                            ].join(" ")}
                            onClick={() => setBaseScale((s) => Math.min(MAX_ZOOM, Number((s + 0.1).toFixed(2))))}
                            disabled={!proBaseImageUrl}
                          >
                            +
                          </button>

                          <button
                            type="button"
                            className={[
                              "px-2 py-1 text-xs rounded border border-slate-700",
                              !proBaseImageUrl
                                ? "border-slate-800 text-slate-600"
                                : "hover:bg-slate-800",
                            ].join(" ")}
                            onClick={() => setBaseScale((s) => Math.max(MIN_ZOOM, Number((s - 0.1).toFixed(2))))}
                            disabled={!proBaseImageUrl}
                          >
                            -
                          </button>

                          <button
                            type="button"
                            className={[
                              "px-2 py-1 text-xs rounded border border-slate-700",
                              !proBaseImageUrl
                                ? "border-slate-800 text-slate-600"
                                : "hover:bg-slate-800",
                            ].join(" ")}
                            onClick={() => {
                              setBaseScale(1);
                              setBaseOffsetX(0);
                              setBaseOffsetY(0);
                            }}
                            disabled={!proBaseImageUrl}
                          >
                            <RotateCcw size={14} />
                          </button>


                          <div className="ml-3 flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => setFitMode("contain")}
                              disabled={!proBaseImageUrl}
                              className={[
                                "px-2 py-1 text-xs rounded border transition",

                                !proBaseImageUrl
                                  ? "border-slate-800 text-slate-600 bg-slate-900/40"
                                  : fitMode === "contain"
                                    ? "border-blue-500 text-blue-400 bg-slate-900"
                                    : "border-slate-700 text-slate-300 hover:border-slate-500",
                              ].join(" ")}
                            >
                              Fit
                            </button>


                            <button
                              type="button"
                              onClick={() => setFitMode("cover")}
                              disabled={!proBaseImageUrl}
                              className={[
                                "px-2 py-1 text-xs rounded border transition",

                                !proBaseImageUrl
                                  ? "border-slate-800 text-slate-600 bg-slate-900/40"
                                  : fitMode === "cover"
                                    ? "border-blue-500 text-blue-400 bg-slate-900"
                                    : "border-slate-700 text-slate-300 hover:border-slate-500",
                              ].join(" ")}
                            >
                              Crop
                            </button>



                          </div>

                          <button
                            type="button"
                            onClick={handleExpandBackground}
                            disabled={!canExpandBg}
                            title={expandTitle}
                            className={[
                              "ml-3 px-2 py-1 text-sm rounded border transition flex items-center gap-1 whitespace-nowrap",

                              canExpandBg
                                ? "border-orange-500 text-orange-500 hover:bg-slate-800 cursor-pointer"
                                : "border-slate-800 text-slate-600",
                            ].join(" ")}
                          >
                            {expandingBg ? (
                              "Expanding..."
                            ) : (
                              <span className="inline-flex items-center gap-1">
                                Expand

                                <Flame
                                  className={[
                                    "w-4 h-4",
                                    canExpandBg ? "text-orange-500" : "text-slate-600",
                                  ].join(" ")}
                                />

                                {/* 💳 КРЕДИТЫ ВСЕГДА */}
                                <span
                                  className={[
                                    "text-sm",
                                    canExpandBg ? "text-orange-500" : "text-slate-600",
                                  ].join(" ")}
                                >
                                  {formatCredits(expandCost)}
                                </span>
                              </span>
                            )}
                          </button>



                        </div>
                      </div>)}


                      {/* {tab === "styles" && (
                        <div className="mx-3 -mt-1 rounded-md border border-slate-800 bg-slate-950 px-3 py-3">

                          
                        </div>
                      )} */}

                      {isSuperAdmin && (
                        <button
                          type="button"
                          className="border border-slate-800 rounded-lg px-3 py-2 text-md font-medium"
                          onClick={() => {
                            const cost = getActionCostCredits("BAKE_BRANDSTYLE");
                            const balance = 0;

                            if (balance < cost) {
                              openPaywall({
                                code: "INSUFFICIENT_CREDITS",
                                action: "BAKE_BRANDSTYLE",
                                requiredCredits: cost,
                                balanceCredits: balance,
                                creditsBalance: balance,
                              });
                              return;
                            }
                          }}
                        >Upgrade</button>
                      )}

                      {tab === "presets" && (
                        <>
                          <div className="mt-5 flex justify-center gap-2">
                            <div className="">
                              <input
                                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-14"
                                value={builderName}
                                onChange={(e) => setBuilderName(e.target.value)}
                                placeholder="My template"
                              />
                            </div>
                            <div className="mb-10">
                              <button
                                type="button"
                                onClick={async () => {
                                  if (!authed) return;

                                  if (savingPreset) return;
                                  setSavingPreset(true);

                                  try {
                                    const title = builderName.trim() || "Untitled template";

                                    const rawThumb = (builderThumbnailUrl.trim() || proBaseImageUrl || "").trim();
                                    const thumbnailUrl = toRelativeUploadPath(rawThumb, apiBase) || null;

                                    const nextPrompt = (prompt ?? "").trim();
                                    const imageOrigin = nextPrompt ? "AI" : "UPLOAD";

                                    if (imageOrigin === "AI" && !nextPrompt) {
                                      await dlg.alert("Prompt is required for AI template.", {
                                        title: "Warning",
                                      });
                                      return;
                                    }

                                    const overlay = buildPresetOverlay({
                                      items,
                                      pics,
                                      rects,
                                      apiBase,
                                    });

                                    const baseFull = (proBaseImageUrl || "").trim();
                                    const baseImageUrl = toRelativeUploadPath(baseFull, apiBase);

                                    const currentBaseTransform = {
                                      scale: baseScale,
                                      offsetX: baseOffsetX,
                                      offsetY: baseOffsetY,
                                      fitMode,
                                    };

                                    const baseWidth = activeFormat.width;
                                    const baseHeight = activeFormat.height;

                                    const body = {
                                      title,
                                      subtitle: null,
                                      tags: ["custom"],
                                      sortOrder: 0,

                                      format: toPresetFormat(formatId),

                                      ...(imageOrigin === "AI" ? { prompt: nextPrompt } : {}),

                                      styleId,

                                      thumbnailUrl: thumbnailUrl,
                                      thumbnailW: 512,
                                      thumbnailH: 512,

                                      overlay,

                                      backgroundImageUrl: baseImageUrl ?? null,
                                      baseTransformJson: baseImageUrl ? currentBaseTransform : null,
                                      imageAdjustmentsJson: baseImageUrl ? imageAdj : null,
                                      baseWidth: baseWidth,
                                      baseHeight: baseHeight,

                                      prompt: nextPrompt || "x",          // ✅ без any
                                      imageOrigin: "AI" as const,



                                      access: "PRO",
                                      status: "PUBLISHED",
                                      scope: isSuperAdmin ? "SYSTEM" : "TENANT",
                                      ...(styleId ? { styleId } : {}),
                                    } as const;

                                    await createAndRenderThumbnail(body);
                                  } catch (e) {
                                    console.error(e);
                                    setError(getErrorMessage(e));
                                  } finally {
                                    setSavingPreset(false);
                                  }
                                }}
                                disabled={savingPreset}

                                className="flex gap-2 pl-2 pr-3 py-2 rounded-md border border-slate-700 bg-slate-800 hover:bg-slate-700 text-[14px]"
                              >
                                <Save size="18" className="text-blue-500" /> Save template
                              </button>

                            </div>
                          </div>
                        </>
                      )}


                      {isSuperAdmin && (
                        <>
                          <div className="flex gap-2 p-4 text-center justify-center hidden">
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
                            <button
                              type="button"
                              onClick={handleGenerateGpt15}
                              className="px-4 py-2 rounded-md bg-fuchsia-600 text-[15px] font-semibold disabled:opacity-20"
                              disabled={!hasPrompt || isGenerating}
                            >
                              {generatingKind === "gpt15" ? "Generating..." : "GPT Image 1.5"}
                            </button>
                            <button
                              type="button"
                              onClick={handleGenerateSDXL}
                              className="px-4 py-2 rounded-md bg-indigo-600 text-[15px] font-semibold disabled:opacity-20 disabled:cursor:disabled"
                              disabled={!hasPrompt || isGenerating}
                            >{generatingKind === "sdxl" ? "Generating..." : "SDXL"}</button>

                            {/* <button
                              type="button"
                              onClick={() => void handleDesignImportMvp()}
                              className="px-4 py-2 rounded-md bg-amber-600 hover:bg-amber-500 text-[15px] font-semibold disabled:opacity-20"
                              disabled={!proBaseImageUrl || importingDesign || isGenerating}
                              title={!proBaseImageUrl ? "Upload or generate a base image first" : "Convert raster design to editable layers (beta)"}
                            >
                              {importingDesign ? "Converting..." : "Convert (Beta)"}
                            </button> */}
                          </div>

                          <div className="rounded-xl border border-slate-800 overflow-hidden p-3 hidden">

                            <div className="w-full">
                              <div className="flex items-center justify-between">
                                <label className="block text-xs mb-1 mt-2">Prompt (optional)</label>
                                <span className="text-[10px] text-slate-500">
                                  Add details, style rules stay protected
                                </span>
                              </div>

                              <textarea
                                className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-xs min-h-[70px]"
                                value={prompt}
                                onChange={(e) => setPrompt(e.target.value)}
                                placeholder="e.g. more steam, glossy highlights, rustic wooden table"
                              />
                            </div>

                            {swapError ? (
                              <div className="mt-2 text-[11px] text-red-400">{swapError}</div>
                            ) : null}
                          </div>
                        </>

                      )}


                      {/* <div className="p-2 text-xs text-slate-300">
                        auth.role: <b>{user?.role ?? "null"}</b> | isSuperAdmin: <b>{String(isSuperAdmin)}</b>
                      </div> */}
                      {isSuperAdmin && (

                        <>

                          <div className="px-5 mt-5">
                            <PresetBuilderPanel
                              isSuperAdmin={isSuperAdmin}
                              apiBase={apiBase}
                              formatId={formatId}
                              prompt={prompt}
                              proBaseImageUrl={proBaseImageUrl}
                              backgroundImageUrl={backgroundImageUrl}
                              foregroundImageUrl={foregroundImageUrl}
                              items={items}
                              pics={pics}
                              rects={rects}
                              baseTransform={{ scale: baseScale, offsetX: baseOffsetX, offsetY: baseOffsetY, fitMode }}
                              backgroundTransform={backgroundTransform}
                              foregroundTransform={foregroundTransform}
                              imageAdjustments={imageAdj ?? DEFAULT_IMAGE_ADJUSTMENTS}
                              baseWidth={activeChoosenFormat.width}
                              baseHeight={activeChoosenFormat.height}

                              selectedPicId={selectedPicId}

                              onMarkDishSlot={markDishSlot}
                              onAddDishSlot={addDishSlotPic}

                              onSave={createAndRenderThumbnail}
                              onSaved={() => void reloadPresets()}
                            />
                          </div>

                        </>
                      )}


                    </div>
                  </div>

                  {/* RIGHT: Properties */}
                  {isStylesMode ? (

                    <div className="w-[40%] p-4 relative">


                      {proBaseImageUrl ? (
                        <div className="relative">
                          <ImageAdjustmentsPanel
                            value={imageAdj}
                            onChange={setImageAdj}
                            onReset={() => setImageAdj(DEFAULT_IMAGE_ADJUSTMENTS)}
                          />
                        </div>
                      ) : (
                        <div className="relative opacity-25">
                          <div className="absolute inset-0 z-10" />
                          <ImageAdjustmentsPanel
                            value={imageAdj}
                            onChange={setImageAdj}
                            onReset={() => setImageAdj(DEFAULT_IMAGE_ADJUSTMENTS)}
                          />
                        </div>
                      )}
                      {/* {!proBaseImageUrl && (<div className="absolute inset-0 bg-slate-950/70 z-10" />)} */}
                    </div>
                  ) : null}

                  {isPresetsMode || isBrandStylesMode ? (
                    <div className="w-[40%] relative">

                      <button
                        type="button"
                        onClick={async () => {
                          const ok = await dlg.confirm(
                            "Reset editor? All changes will be lost.",
                            {
                              title: "Warning",
                              okText: "Reset",
                              cancelText: "Cancel",
                            }
                          );

                          if (!ok) return;

                          resetEditor();
                        }}
                        className="
                          absolute 
                            flex items-center gap-1
                            whitespace-nowrap
                            px-2
                            py-1
                            right-0 top-0 
                            max-h-[32px]
                            rounded-md
                            border border-slate-700
                            hover:border border-red-500
                            text-slate-400
                            hover:text-red-400
                            bg-slate-800/20
                            hover:bg-red-900/20
                            text-[13px]
                          "
                      >
                        <RotateCcw size={14} /> <span>Reset</span>
                      </button>

                      <div className="flex justify-between my-2">
                        <div className="text-sm text-slate-500 pl-6 pt-3 pb-2">Choose what to add to the Editor</div>

                      </div>

                      <div className="flex gap-2 pt-0 pr-6 pl-6 text-left justify-start">

                        <button
                          type="button"
                          onClick={addText}
                          disabled={!canAddText}
                          className={`
                                      text-[20px] px-2 py-2 rounded-md border border-slate-700
                                      ${canAddText
                              ? "bg-slate-800 hover:bg-slate-700 text-slate-200"
                              : "bg-slate-800/60 text-slate-400 cursor-not-allowed"}
                                  `}
                        >
                          <Type size={26} />
                          {/* {isPro ? "" : `(${items.length}/${textLimit})`} */}
                        </button>
                        <button
                          type="button"
                          onClick={() => picInputRef.current?.click()}
                          disabled={!canAddPic}
                          className={`
                                      text-[20px] px-2 py-2 rounded-md border border-slate-700
                                      ${canAddPic
                              ? "bg-slate-800 hover:bg-slate-700 text-slate-200"
                              : "bg-slate-800/60 text-slate-400 cursor-not-allowed"}
                                  `}
                        >
                          <ImageIcon size={26} />
                          {/* {isPro ? "" : `(${pics.length}/${picLimit})`} */}
                        </button>
                        <input
                          type="file" accept="image/png,image/jpeg"
                          ref={picInputRef} className="hidden"
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) {
                              handleUploadpicPng(f).catch((err) => setError(getErrorMessage(err)));
                              e.target.value = "";
                            }
                          }}
                        />

                        <button
                          type="button"
                          onClick={addRect}
                          disabled={!canAddRect}
                          className={`
                                      text-[20px] px-2 py-2 rounded-md border border-slate-700
                                      ${canAddRect
                              ? "bg-slate-800 hover:bg-slate-700 text-slate-200"
                              : "bg-slate-800/60 text-slate-400 cursor-not-allowed"}
                                  `}
                        >
                          <Square size={26} />
                          {/* {isPro ? "" : `(${rects.length}/${rectLimit})`} */}
                        </button>


                        <button
                          type="button"
                          onClick={() => cutPicInputRef.current?.click()}
                          disabled={!canAddPic || aiBusy}
                          className={` 
                            text-[20px] px-2 py-2 rounded-md border border-slate-700
                            ${canAddPic && !aiBusy
                              ? "bg-slate-800/50 hover:bg-slate-800 text-slate-200"
                              : "bg-slate-800/60 text-slate-400 cursor-not-allowed"}
                            `}
                          title="Add cutted pic"
                        >
                          <div className="flex items-center px-0 whitespace-nowrap gap-1">
                            <SquareScissors size={26} className="text-slate-200" />
                            <Flame className="w-4 h-4 text-orange-500" />
                            <span className="text-orange-500 text-[14px]">{formatCredits(presetSwapCost)}</span>
                            <span className="text-slate-500 items-center text-[12px] pr-2">(beta)</span>
                          </div>

                        </button>



                        <input
                          type="file"
                          accept="image/png,image/jpeg,image/jpg,image/webp"
                          ref={cutPicInputRef}
                          className="hidden"
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) {
                              handleUploadCuttedPic(f).catch((err) => setError(getErrorMessage(err)));
                              e.target.value = "";
                            }
                          }}
                        />



                      </div>



                      <div className="mt-2 px-3 py-2 ">
                        <Section title="Layers">
                          <div className="space-y-1">
                            {layers.map((l) => {
                              const key = `${l.kind}:${l.id}`;
                              const isSelected = selectedLayerKey === key;

                              return (
                                <div
                                  key={key}
                                  onClick={() => {
                                    if (l.kind === "text") selectText(l.id);
                                    if (l.kind === "pic") selectPic(l.id);
                                    if (l.kind === "rect") selectRect(l.id);
                                  }}
                                  className={[
                                    "flex items-center rounded-lg justify-between gap-1 border pl-1 pr-2 py-1 cursor-pointer transition",
                                    isSelected
                                      ? "border-blue-500 bg-blue-500/10"
                                      : "border-slate-700 bg-slate-950 hover:bg-slate-900",
                                  ].join(" ")}
                                >
                                  <div className="flex min-w-0">
                                    <button
                                      type="button"
                                      className={[
                                        "rounded-sm border px-2 py-1 text-[12px] transition",
                                        isLayerVisible(l)
                                          ? "border-slate-700 text-white hover:bg-slate-800"
                                          : "border-transparent text-white/50 hover:bg-slate-800/40",
                                      ].join(" ")}
                                      title={isLayerVisible(l) ? "Hide layer" : "Show layer"}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        toggleLayerVisible(l);
                                      }}
                                    >
                                      👁
                                    </button>
                                    <div className={["text-[11px] px-2 py-2 leading-tight truncate",
                                      isLayerVisible(l) ? "text-whtite" : "text-white/50"
                                    ].join(" ")}>{l.title}</div>
                                  </div>

                                  <div className="flex gap-1 shrink-0 text-slate-300">

                                    <button
                                      type="button"
                                      className={[
                                        "rounded-sm border px-2 py-1 text-[11px] transition",
                                        l.bakeLayer === "BAKED"
                                          ? "border-blue-500 text-blue-300 bg-blue-500/10"
                                          : "border-slate-700 text-slate-200 hover:bg-slate-800",
                                      ].join(" ")}
                                      title={l.bakeLayer === "BAKED" ? "Will be baked (behind dish)" : "Send behind dish (bake)"}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        toggleBakeLayer({ kind: l.kind, id: l.id });
                                      }}
                                    >
                                      <SendToBack size="10" />
                                    </button>

                                    <button
                                      type="button"
                                      className="rounded-sm border border-slate-700 px-2 py-1 text-[8px] hover:bg-slate-800"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        moveLayer(key, "up");
                                      }}
                                    >
                                      ▲
                                    </button>
                                    <button
                                      type="button"
                                      className="rounded-sm border border-slate-700 px-2 py-1 text-[8px] hover:bg-slate-800"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        moveLayer(key, "down");
                                      }}
                                    >
                                      ▼
                                    </button>
                                    <button
                                      type="button"
                                      className="rounded-sm border border-slate-700 px-1 py-1 text-[8px] hover:bg-red-900/30"
                                      title="Delete layer"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        deleteLayer(l);
                                      }}
                                    >
                                      <X size={14} />
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </Section>
                      </div>

                      {ActiveRect ? (
                        <>
                          <div className="py-2 px-3 space-y-4">
                            <Section title="Rectangle" borderBottom={true}
                              actions={
                                <>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      if (!ActiveRect) return;
                                      setRects((prev) => prev.filter((l) => l.id !== ActiveRect.id));
                                      clearSelection();
                                    }}
                                    disabled={!ActiveRect}
                                    className="text-red-400 text-xs px-1 py-1 rounded-md border border-slate-800 hover:bg-slate-800 disabled:opacity-50"
                                  >
                                    <TrashIcon size="12" />
                                  </button>

                                </>
                              }>
                              <div className="gap-2 px-1">
                                <div className="flex w-full items-end gap-4">
                                  <div className="">
                                    <Label>Width</Label>
                                    <input
                                      type="number"
                                      min={1}
                                      value={ActiveRect.width}
                                      onChange={(e) => updateActiveRect({ width: Number(e.target.value) || 1 })}
                                      className="ui-num w-13 rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-[9px]"
                                    />
                                  </div>

                                  <div className="">
                                    <Label>Height</Label>
                                    <input
                                      type="number"
                                      min={1}
                                      value={ActiveRect.height}
                                      onChange={(e) => updateActiveRect({ height: Number(e.target.value) || 1 })}
                                      className="ui-num w-13 rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-[9px]"
                                    />
                                  </div>
                                  <div className="">
                                    <Label>Opacity {Math.round(ActiveRect.opacity * 100)}%</Label>
                                    <input
                                      type="range"
                                      min={0}
                                      max={100}
                                      value={Math.round(ActiveRect.opacity * 100)}
                                      onChange={(e) => updateActiveRect({ opacity: Number(e.target.value) / 100 })}
                                      className="w-[90px] h-[8px]"
                                    />
                                  </div>
                                </div>

                                <div className="grid grid-cols-[128px_1fr] gap-4 items-start mt-3">
                                  {/* LEFT */}
                                  <div className="w-32">
                                    <Label>Fill Type</Label>
                                    <select
                                      value={ActiveRect.fill.kind}
                                      onChange={(e) => setRectFillKind(e.target.value as OverlayRectFill["kind"])}
                                      className="ui-select w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-[9px]"
                                    >
                                      <option value="solid">Solid</option>
                                      <option value="linear">Gradient</option>
                                    </select>
                                  </div>

                                  {/* RIGHT */}
                                  <div className="flex flex-wrap items-end gap-1">
                                    {ActiveRect.fill.kind === "solid" ? (
                                      <div className="flex flex-wrap items-end gap-4 w-full">
                                        {/* ✅ сюда вставляй SOLID UI, хоть несколько div подряд */}
                                        <div className="">
                                          <Label>Color</Label>
                                          <input
                                            type="color"
                                            value={ActiveRect.fill.color}
                                            onChange={(e) => setRectFillSolid(e.target.value)}
                                            className="w-7 h-6"
                                          />
                                        </div>
                                      </div>
                                    ) : (
                                      (() => {
                                        const fromStr = ActiveRect.fill.from ?? "rgba(0,0,0,0.65)";
                                        const toStr = ActiveRect.fill.to ?? "rgba(0,0,0,0.0)";

                                        const fromHex = rgbaToHex(fromStr, "#000000");
                                        const toHex = rgbaToHex(toStr, "#000000");

                                        const fromA = rgbaToAlpha(fromStr, 0.65);
                                        const toA = rgbaToAlpha(toStr, 0.0);

                                        return (
                                          <>


                                            <div className="flex">
                                              {/* FROM color */}
                                              <div className="">
                                                <Label>From</Label>
                                                <input
                                                  type="color"
                                                  value={fromHex}
                                                  onChange={(e) => {
                                                    const nextHex = e.target.value;
                                                    setRectFillLinear({ from: hexToRgbaString(nextHex, fromA) });
                                                  }}
                                                  className="w-7 h-6 "
                                                />

                                              </div>

                                              {/* FROM opacity */}
                                              <div className="pl-2">
                                                <Label>Opacity {Math.round(fromA * 100)}%</Label>
                                                <input
                                                  type="range"
                                                  min={0}
                                                  max={100}
                                                  value={Math.round(fromA * 100)}
                                                  onChange={(e) => {
                                                    const nextA = Number(e.target.value) / 100;
                                                    setRectFillLinear({ from: hexToRgbaString(fromHex, nextA) });
                                                  }}
                                                  className="w-[90px] h-[8px]"
                                                />
                                              </div>

                                            </div>


                                            <div className="flex">

                                              {/* TO color */}
                                              <div className="">
                                                <Label>To</Label>
                                                <input
                                                  type="color"
                                                  value={toHex}
                                                  onChange={(e) => {
                                                    const nextHex = e.target.value;
                                                    setRectFillLinear({ to: hexToRgbaString(nextHex, toA) });
                                                  }}
                                                  className="w-7 h-6"
                                                />
                                              </div>

                                              {/* TO opacity */}
                                              <div className="pl-2">
                                                <Label>Opacity {Math.round(toA * 100)}%</Label>
                                                <input
                                                  type="range"
                                                  min={0}
                                                  max={100}
                                                  value={Math.round(toA * 100)}
                                                  onChange={(e) => {
                                                    const nextA = Number(e.target.value) / 100;
                                                    setRectFillLinear({ to: hexToRgbaString(toHex, nextA) });
                                                  }}
                                                  className="w-[90px] h-[8px]"
                                                />
                                              </div>

                                            </div>
                                            {/* Angle */}
                                            <div className="w-24 shrink-0">
                                              <Label>Angle</Label>
                                              <input
                                                type="number"
                                                min={0}
                                                max={360}
                                                value={ActiveRect.fill.angle ?? 90}
                                                onChange={(e) => setRectFillLinear({ angle: Number(e.target.value) || 0 })}
                                                className="ui-num w-12 rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-[9px]"
                                              />
                                            </div>
                                          </>
                                        );
                                      })()
                                    )}
                                  </div>
                                </div>

                                <div className="grid grid-cols-12 mt-3 flex w-full items-end gap-4">
                                  <div className="col-span-2">
                                    <Label>Border color</Label>
                                    <input
                                      type="color"
                                      value={ActiveRect.borderColor}
                                      onChange={(e) => updateActiveRect({ borderColor: e.target.value })}
                                      className="w-7 h-6"
                                    />
                                  </div>

                                  <div className="col-span-2">
                                    <Label>Border width</Label>
                                    <input
                                      type="number"
                                      min={0}
                                      value={ActiveRect.borderWidth}
                                      onChange={(e) => updateActiveRect({ borderWidth: Number(e.target.value) || 0 })}
                                      className="ui-num w-12 rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-[9px]"
                                    />
                                  </div>

                                  <div className="col-span-2">
                                    <Label>Radius</Label>
                                    <input
                                      type="number"
                                      min={0}
                                      value={ActiveRect.borderRadius}
                                      onChange={(e) => updateActiveRect({ borderRadius: Number(e.target.value) || 0 })}
                                      className="ui-num w-12 rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-[9px]"
                                    />
                                  </div>
                                  <div className="col-span-4 ml-3">
                                    <Label>Rotate - {rotationDeg}°</Label>
                                    <input
                                      type="range"
                                      min={-180}
                                      max={180}
                                      step={1}
                                      value={rotationDeg}
                                      onChange={(e) => updateActiveRect({ rotationDeg: Number(e.target.value) })}
                                      className="w-[70px] h-[8px]"
                                    />
                                  </div>
                                </div>
                              </div>
                            </Section>


                          </div>
                        </>


                      ) :

                        activepic ? (

                          <>

                            <div className="py-2 px-3 space-y-4">
                              <Section title="Image"
                                actions={
                                  <>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        if (!activepic) return;
                                        setPics((prev) => prev.filter((l) => l.id !== activepic.id));
                                        clearSelection();
                                      }}
                                      disabled={!activepic}
                                      className="text-red-400 text-xs px-1 py-1 rounded-md border border-slate-800 hover:bg-slate-800 disabled:opacity-50"
                                    >
                                      <TrashIcon size="12" />
                                    </button>

                                  </>
                                }>




                                <div className="grid grid-cols-12 gap-3 px-1">

                                  <>
                                    {/* SIZE */}
                                    <div className="col-span-2">
                                      <Label>Width</Label>
                                      <Num
                                        value={activepic.width}
                                        readOnly disabled
                                        onChange={(v) => setActivePicWidth(v)}
                                      />
                                    </div>

                                    <div className="col-span-2">
                                      <Label>Height</Label>
                                      <Num
                                        value={activepic.height}
                                        readOnly disabled
                                        onChange={(v) => {
                                          const h = Math.max(10, v);
                                          setPics((prev) =>
                                            prev.map((l) =>
                                              l.id === activepic.id ? { ...l, height: h } : l
                                            )
                                          );
                                        }}
                                      />
                                    </div>

                                    {/* OPACITY */}
                                    <div className="col-span-12 mt-2">
                                      <Label>Opacity {Math.round(activepic.opacity * 100)}%</Label>
                                      <input
                                        type="range"
                                        min={0}
                                        max={100}
                                        value={Math.round(activepic.opacity * 100)} // 0..100 (прозрачность)
                                        onChange={(e) => updateActivePic({ opacity: Number(e.target.value) / 100 })}
                                        className="w-[90px] h-[8px]"
                                      />

                                    </div>

                                  </>

                                </div>


                              </Section>
                            </div>

                          </>
                        ) : activeItem ? (

                          <>

                            <div className="py-2 px-3">

                              <Section title="Text" roundedTop={true} roundedBottom={false} borderBottom={false}
                                actions={
                                  <>
                                    <button
                                      type="button" title="Upload font" disabled={!authed}
                                      className="text-[11px] px-2 py-1 rounded-md border border-blue-500/20 bg-blue-500/20 hover:bg-blue-500/30 disabled:opacity-50"
                                      onClick={() => document.getElementById("fontUpload")?.click()}
                                    >
                                      Upload font
                                    </button>
                                  </>
                                }>
                                <div className="grid grid-cols-12 gap-2">
                                  <div className="col-span-12">
                                    <textarea
                                      className="w-full min-h-[80px] resize-y rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm leading-snug"
                                      value={activeItem.text}
                                      onChange={(e) => updateActive({ text: e.target.value })}
                                      placeholder="Text…"
                                    />
                                  </div>
                                </div>


                                <div className="grid grid-cols-12 gap-2 px-1">


                                  <div className="col-span-4">
                                    <Label>Font</Label>
                                    <select
                                      value={activeItem.fontFamily}
                                      onChange={(e) => updateActive({ fontFamily: e.target.value })}
                                      className="ui-select w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-[9px]"
                                    >
                                      {allFonts.map((f) => (
                                        <option key={f.family} value={f.family}>
                                          {f.label}
                                        </option>
                                      ))}
                                    </select>
                                  </div>

                                  <div className="col-span-2">
                                    <Label>Size</Label>
                                    <input
                                      type="number"
                                      min={10}
                                      max={250}
                                      value={activeItem.fontSize}
                                      onChange={(e) => updateActive({ fontSize: Number(e.target.value) || 0 })}
                                      className="ui-num w-12 rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-[9px]"
                                    />
                                  </div>

                                  <div className="col-span-3">
                                    <Label>Weight</Label>
                                    <select
                                      value={Number(activeItem.fontWeight ?? 400)}
                                      onChange={(e) => updateActive({ fontWeight: Number(e.target.value) })}
                                      disabled={weightSelectDisabled}
                                      className={`ui-select w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-[9px] transition
                                              ${weightSelectDisabled
                                          ? "border-slate-800 bg-slate-900 text-slate-500 cursor-not-allowed opacity-70"
                                          : "border-slate-700 bg-slate-950 text-white focus:outline-none focus:ring-2 focus:ring-slate-600"
                                        }`}
                                      title={
                                        weightSelectDisabled
                                          ? "This font has only one available weight"
                                          : undefined
                                      }
                                    >
                                      {weightsForSelect.map((w) => (
                                        <option key={w} value={w}>
                                          {weightLabel(w)}
                                        </option>
                                      ))}
                                    </select>

                                  </div>
                                  <div className="col-span-2">
                                    <Label>&nbsp;</Label>
                                    <div className="flex gap-1">
                                      {/* Bold */}
                                      <button
                                        type="button"
                                        disabled={!canBold}
                                        onClick={() => {
                                          if (!canBold) return;
                                          updateActive({ fontWeight: isBold ? 400 : nextBold });
                                        }}
                                        className={[
                                          "h-6 px-2 text-[9px] rounded border transition flex items-center justify-center",
                                          canBold
                                            ? (isBold
                                              ? "bg-blue-500 border-blue-500 text-white"
                                              : "bg-zinc-800 border-zinc-700 text-zinc-300 hover:bg-zinc-700")
                                            : "bg-zinc-900 border-zinc-800 text-zinc-600 opacity-50 cursor-not-allowed",
                                        ].join(" ")}
                                        title={canBold ? "Bold" : "Bold is not available for this font"}
                                      >
                                        <span className="font-bold">B</span>
                                      </button>

                                      {/* Italic */}
                                      <button
                                        type="button"
                                        disabled={!canItalic}
                                        onClick={() => {
                                          if (!canItalic) return;
                                          updateActive({ fontStyle: isItalic ? "normal" : "italic" });
                                        }}
                                        className={[
                                          "h-6 px-2 text-[9px] rounded border transition flex items-center justify-center",
                                          canItalic
                                            ? (isItalic
                                              ? "bg-blue-500 border-blue-500 text-white"
                                              : "bg-zinc-800 border-zinc-700 text-zinc-300 hover:bg-zinc-700")
                                            : "bg-zinc-900 border-zinc-800 text-zinc-600 opacity-50 cursor-not-allowed",
                                        ].join(" ")}
                                        title={canItalic ? "Italic" : "Italic is not available for this font"}
                                      >
                                        <span className="italic font-semibold">I</span>
                                      </button>
                                    </div>
                                  </div>

                                  <div className="col-span-4">
                                    <Label>Color</Label>
                                    <div className="flex items-center">
                                      <input
                                        type="color"
                                        value={activeItem.color}
                                        onChange={(e) => updateActive({ color: e.target.value })}
                                        className="w-7 h-6"
                                      />
                                    </div>
                                  </div>

                                  <div className="col-span-4">
                                    <Label>Line-height</Label>
                                    <input
                                      type="number"
                                      min={0.6}
                                      max={3}
                                      step={0.1}
                                      value={activeItem.lineHeight}
                                      onChange={(e) => updateActive({ lineHeight: Number(e.target.value) || 1.2 })}
                                      className="ui-num w-12 rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-[9px]"
                                    />
                                  </div>

                                  <div className="col-span-4 pr-4">
                                    <Label>Opacity {Math.round(activeItem.textOpacity * 100)}%</Label>
                                    <input
                                      type="range"
                                      min={0}
                                      max={100}
                                      value={Math.round(activeItem.textOpacity * 100)}
                                      onChange={(e) => updateActive({ textOpacity: Number(e.target.value) / 100 })}
                                      className="w-[90px] h-[8px]"
                                    />

                                  </div>
                                </div>

                                <div className="grid grid-cols-12 gap-3 px-1">
                                  <div className="col-span-2">
                                    <Label>Shadow</Label>
                                    <div className="flex items-center gap-2">
                                      <input
                                        type="color"
                                        value={activeItem.shadowColor ?? "rgba(0,0,0,1)"}
                                        onChange={(e) => updateActive({ shadowColor: e.target.value })}
                                        className="w-7 h-6"
                                      />

                                    </div>
                                  </div>

                                  <div className="col-span-2">
                                    <Label>Blur</Label>
                                    <input
                                      type="number"
                                      min={0}
                                      max={100}
                                      value={activeItem.shadowBlur ?? 0}
                                      onChange={(e) => updateActive({ shadowBlur: Number(e.target.value) || 0 })}
                                      className="ui-num w-12 rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-[9px]"
                                    />
                                  </div>

                                  <div className="col-span-2">
                                    <Label>Offset X</Label>
                                    <input
                                      type="number"
                                      min={-200}
                                      max={200}
                                      value={activeItem.shadowOffsetX ?? 0}
                                      onChange={(e) => updateActive({ shadowOffsetX: Number(e.target.value) || 0 })}
                                      className="ui-num w-12 rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-[9px]"
                                    />
                                  </div>

                                  <div className="col-span-2">
                                    <Label>Offset Y</Label>
                                    <input
                                      type="number"
                                      min={-200}
                                      max={200}
                                      value={activeItem.shadowOffsetY ?? 0}
                                      onChange={(e) => updateActive({ shadowOffsetY: Number(e.target.value) || 0 })}
                                      className="ui-num w-12  rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-[9px]"
                                    />
                                  </div>

                                  <div className="col-span-3">
                                    <Label>Opacity {Math.round(activeItem.shadowOpacity * 100)}%</Label>
                                    <input
                                      type="range"
                                      min={0}
                                      max={100}
                                      value={Math.round(activeItem.shadowOpacity * 100)}
                                      onChange={(e) => updateActive({ shadowOpacity: Number(e.target.value) / 100 })}
                                      className="w-[90px] h-[8px]"
                                    />

                                  </div>
                                </div>





                                <div className="">
                                  <input
                                    id="fontUpload"
                                    type="file"
                                    accept=".ttf,.otf"
                                    className="hidden"
                                    onChange={async (e) => {
                                      const file = e.target.files?.[0];
                                      if (!file) return;

                                      const fd = new FormData();
                                      fd.append("file", file);

                                      const csrf = readCookie("sc_csrf");

                                      const family = window.prompt("Font family name (e.g. MyFont)")?.trim();
                                      if (!family) return;
                                      fd.append("family", family);

                                      const res = await fetch(`${apiBase}/ai/pro-fonts/upload`, {
                                        method: "POST",
                                        body: fd,
                                        credentials: "include",
                                        headers: csrf ? { "x-csrf-token": csrf } : {},
                                      });

                                      if (!res.ok) {
                                        await dlg.alert("Upload failed.", {

                                        });
                                        return;
                                      }

                                      // перезагрузить список шрифтов
                                      const data = (await res.json()) as { item?: CustomFont };

                                      if (data.item) {
                                        setCustomFonts((prev) => {
                                          const next = prev.filter((x) => x.family !== data.item!.family);
                                          return [...next, data.item!];
                                        });
                                      }

                                      e.target.value = "";
                                    }}
                                  />
                                </div>
                              </Section>

                              {/* SECTION: Plaque */}
                              <Section title="Plaque" roundedTop={false} roundedBottom={true}>
                                <div className="grid grid-cols-12 gap-3 px-1">

                                  <div className="col-span-2">
                                    <Label>Plaque</Label>
                                    <input
                                      type="color"
                                      value={activeItem.plaqueColor}
                                      onChange={(e) => updateActive({ plaqueColor: e.target.value })}
                                      className="w-7 h-6"
                                    />
                                  </div>

                                  <div className="col-span-3">
                                    <Label>Width (px)</Label>
                                    <input
                                      type="number"
                                      min={0}
                                      max={2000}
                                      value={activeItem.plaqueWidth}
                                      onChange={(e) => updateActive({ plaqueWidth: Number(e.target.value) || 0 })}
                                      className="ui-num w-12 rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-[9px]"
                                    />
                                  </div>

                                  <div className="col-span-3">
                                    <Label>Radius</Label>
                                    <input
                                      type="number"
                                      min={0}
                                      max={64}
                                      value={activeItem.borderRadius}
                                      onChange={(e) => updateActive({ borderRadius: Number(e.target.value) || 0 })}
                                      className="ui-num w-12 rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-[9px]"
                                    />
                                  </div>

                                  <div className="col-span-4">
                                    <Label>Plaque opacity - {Math.round((activeItem.plaqueOpacity) * 100)}%</Label>
                                    <input
                                      type="range"
                                      min={0}
                                      max={100}
                                      value={Math.round(activeItem.plaqueOpacity * 100)}
                                      onChange={(e) => updateActive({ plaqueOpacity: Number(e.target.value) / 100 })}
                                      className="w-[90px] h-[8px]"
                                    />
                                  </div>


                                  <div className="col-span-2">
                                    <Label>Border</Label>
                                    <input
                                      type="color"
                                      value={activeItem.plaqueBorderColor}
                                      onChange={(e) => updateActive({ plaqueBorderColor: e.target.value })}
                                      className="w-7 h-6"
                                    />
                                  </div>



                                  <div className="col-span-3">
                                    <Label>Border width</Label>
                                    <input
                                      type="number"
                                      min={0}
                                      max={50}
                                      value={activeItem.plaqueBorderWidth}
                                      onChange={(e) => updateActive({ plaqueBorderWidth: Number(e.target.value) || 0 })}
                                      className="ui-num  w-12 rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-[9px]"
                                    />
                                  </div>

                                  <div className="col-span-3">
                                    <Label>Align</Label>
                                    <select
                                      value={activeItem.textAlign}
                                      onChange={(e) =>
                                        updateActive({ textAlign: e.target.value as "left" | "center" | "right" })
                                      }
                                      className="ui-select w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-[9px]"
                                    >
                                      <option value="left">Left</option>
                                      <option value="center">Center</option>
                                      <option value="right">Right</option>
                                    </select>
                                  </div>

                                  <div className="col-span-4">
                                    <Label>Border opacity - {Math.round((1 - (activeItem.plaqueBorderOpacity)) * 100)}%</Label>
                                    <input
                                      type="range"
                                      min={0}
                                      max={100}
                                      value={Math.round(activeItem.plaqueBorderOpacity * 100)}
                                      onChange={(e) => updateActive({ plaqueBorderOpacity: Number(e.target.value) / 100 })}
                                      className="w-[90px] h-[8px]"
                                    />
                                  </div>

                                  <div className="col-span-12">
                                    <Label>Padding (L T R B)</Label>
                                    <div className="grid grid-cols-6 gap-2">
                                      <Num value={activeItem.paddingLeft ?? 0} onChange={(v) => updateActive({ paddingLeft: v ?? 0 })} />
                                      <Num value={activeItem.paddingTop ?? 0} onChange={(v) => updateActive({ paddingTop: v ?? 0 })} />
                                      <Num value={activeItem.paddingRight ?? 0} onChange={(v) => updateActive({ paddingRight: v ?? 0 })} />
                                      <Num value={activeItem.paddingBottom ?? 0} onChange={(v) => updateActive({ paddingBottom: v ?? 0 })} />
                                    </div>

                                  </div>
                                  {/* <div className="col-span-12">
                                    <Label>Margin (L T R B)</Label>
                                    <div className="grid grid-cols-4 gap-2">
                                      <Num value={activeItem.marginLeft ?? 0} onChange={(v) => updateActive({ marginLeft: v ?? 0 })} />
                                      <Num value={activeItem.marginTop ?? 0} onChange={(v) => updateActive({ marginTop: v ?? 0 })} />
                                      <Num value={activeItem.marginRight ?? 0} onChange={(v) => updateActive({ marginRight: v ?? 0 })} />
                                      <Num value={activeItem.marginBottom ?? 0} onChange={(v) => updateActive({ marginBottom: v ?? 0 })} />
                                    </div>
                                  </div> */}
                                </div>
                              </Section>

                            </div>
                          </>
                        ) :

                          <div className="p-30 w-full h-full flex justify-center text-center">
                            {/* <div className="flex pb-10 text-slate-700">Edit area</div> */}
                          </div>


                      }


                    </div>
                  ) : null}



                </div>

              </div>

            </div>
          </section>
        </div>

        <Portal>
          {infoMsg && (
            <div
              onClick={() => setInfoMsg(null)}
              className={`
                fixed bottom-3 right-3 z-[9999] max-w-sm
                flex items-start gap-2
                text-base text-blue-100
                bg-green-800/30 border border-blue-900
                rounded-xl shadow-lg backdrop-blur
                transition-all duration-300 ease-out
                select-none 
                ${infoVisible
                  ? "opacity-100 translate-y-0"
                  : "opacity-0 translate-y-2"}
              `}

            >
              <div className="px-6 py-4">{infoMsg}</div>
              <button
                type="button"
                onClick={() => setInfoMsg(null)}
                className="text-blue-300 hover:text-blue-200 text-[10px] px-2 py-1"
                aria-label="Close"
              >
                ✕
              </button>
            </div>

          )}
        </Portal>

        <StylePreviewModal
          open={previewModalOpen}
          onClose={() => setPreviewModalOpen(false)}
          apiBase={apiBase}
          proDesignId={proDesignId}
          formatId={formatId}
          styleId={styleId}
          initialPrompt={prompt ?? ""}
          isPro={isPro}
          plan={plan}
          creditsBalance={creditsBalance}
          onPaywall={openPaywall}

          baseImageUrl={modalBaseImageUrl}
          styleRefUrl={modalStyleRefUrl}

          onCommittedToEditor={async ({ mode, imageUrl }) => {
            if (!authed || !proDesignId) return;

            const setAsUserBase = (next: { baseImageUrl: string; proDesignId: string }) => {
              setProBaseImageUrl(next.baseImageUrl);
              setProDesignId(next.proDesignId);

              setUserBaseImageUrl(next.baseImageUrl);
              setUserProDesignId(next.proDesignId);
              setBaseSource("user");
            };

            if (mode === "preview") {
              const r = await commitPreviewToBase({
                apiBase,
                proDesignId,
                previewImageUrl: imageUrl,
              });

              // ✅ designId тот же самый, просто обновилась baseImageUrl
              setAsUserBase({
                baseImageUrl: r.baseImageUrl,
                proDesignId,
              });

              setPreviewImageUrl(null);
              return;
            }

            // mode === "final"
            setAsUserBase({
              baseImageUrl: imageUrl,
              proDesignId,
            });

            setPreviewImageUrl(null);
          }}

        />

        <ComboPreviewModal
          open={comboModalOpen}
          onClose={() => setComboModalOpen(false)}
          apiBase={apiBase}
          proDesignId={proDesignId}
          formatId={formatId}
          styleId={styleId}
          items={comboItems}
          initialPrompt={prompt ?? ""}
          plan={plan}
          creditsBalance={creditsBalance}
          onPaywall={openPaywall}
          styleRefUrl={modalStyleRefUrl}
          onEnsureDesign={({ proDesignId, baseImageUrl }) => {
            setProDesignId(proDesignId);
            setProBaseImageUrl(baseImageUrl);
            setUserProDesignId(proDesignId);
            setUserBaseImageUrl(baseImageUrl);
            setBaseSource("user");
          }}
          onUseInEditor={async ({ imageUrl }) => {
            if (!authed || !proDesignId) return;

            // same as restyle preview commit
            const r = await commitPreviewToBase({
              apiBase,
              proDesignId,
              previewImageUrl: imageUrl,
            });

            const nextUrl = r.baseImageUrl;

            setProBaseImageUrl(nextUrl);
            setUserBaseImageUrl(nextUrl);
            setUserProDesignId(proDesignId);
            setBaseSource("user");

            // optional: close & clear preview state
          }}
        />


        <BakeBrandStyleModal
          open={bakeModalOpen}
          onClose={() => setBakeModalOpen(false)}
          apiBase={apiBase}
          formatId={formatId}
          proDesignId={proDesignId}
          baseImageUrl={bakeBaseAbs}
          styleRefImageUrl={bakeStyleAbs}
          overlaySnapshot={bakeOverlaySnap}
          baseWidth={editorW}
          baseHeight={editorH}
          outputWidth={editorW}
          outputHeight={editorH}
          creditsBalance={me?.tenant?.creditsBalance ?? 0}
          plan={plan}
          onPaywall={openPaywall}
          onCommittedToEditor={({ baseImageUrl }) => {
            setProBaseImageUrl(baseImageUrl);
            setItems([]);
            setPics([]);
            setRects([]);
          }}
        />

        <ApplyPresetModal
          open={applyFlow.modalState.open}
          onClose={applyFlow.closeApplyPreset}
          onConfirm={applyFlow.confirmApplyPreset}
          showImageSection={applyFlow.modalState.showImageSection}
          defaultOverlayMode={applyFlow.modalState.defaultOverlayMode}
          defaultImageMode={applyFlow.modalState.defaultImageMode}
          currentCounts={applyFlow.modalState.currentCounts}
          presetCounts={applyFlow.modalState.presetCounts}
          currentImageUrl={editorBaseImageUrl ?? proBaseImageUrl}
          presetImageUrl={selectedPreset?.backgroundImageUrl}
        />



        {stylePreview && (
          <div
            className="fixed inset-0 z-100 bg-black/70 flex items-center justify-center p-6  backdrop-blur-md"
            onClick={() => setStylePreview(null)}
          >
            <div
              className="relative max-w-[95vw] max-h-[90vh]"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                className="absolute -top-3 -right-3 h-9 w-9 rounded-full bg-slate-900 border border-slate-700 text-slate-100"
                onClick={() => setStylePreview(null)}
                aria-label="Close"
              >
                ✕
              </button>

              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={stylePreview}
                alt=""
                className="max-w-[95vw] max-h-[90vh] rounded-xl object-contain border border-slate-700 bg-slate-950"
              />
            </div>
          </div>
        )}

        {brandPreview && (
          <div
            className="fixed inset-0 z-100 bg-black/70 flex items-center justify-center p-6  backdrop-blur-md"
            onClick={() => setBrandPreview(null)}
          >
            <div
              className="relative max-w-[95vw] max-h-[90vh]"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                className="absolute -top-3 -right-3 h-9 w-9 rounded-full bg-slate-900 border border-slate-700 text-slate-100"
                onClick={() => setBrandPreview(null)}
                aria-label="Close"
              >
                ✕
              </button>

              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={brandPreview}
                alt=""
                className="max-w-[95vw] max-h-[90vh] rounded-xl object-contain border border-slate-700 bg-slate-950"
              />
            </div>
          </div>
        )}


      </main>
    </div >
  );
}
