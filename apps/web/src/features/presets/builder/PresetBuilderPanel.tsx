"use client";

import * as React from "react";
import type {
  OverlayPicItem,
  OverlayRectItem,
  OverlayTextItem,
  OverlayTextConfig,
  OverlayPicConfig,
  OverlayRectConfig,
} from "@/features/editor/editor.types";

import type { BaseTransform } from "@/features/editor/editor.constants";
import type { ImageAdjustments } from "@/app/(app)/_components/image_editor/ImageAdjustmentsPanel";

import { toRelativeUploadPath } from "@/features/presets/useHydrateEditorFromPreset";
import { buildPresetOverlay } from "@/features/presets/buildPresetOverlay";
import { toPresetFormat, type PostFormatId } from "@/features/formats/postFormats";
import { useAuth } from "@/context/AuthContext";

type PresetAccess = "FREE" | "EDITOR" | "PRO" | "PRO_PLUS";
type PresetStatus = "DRAFT" | "PUBLISHED" | "ARCHIVED";
type PresetScope = "SYSTEM" | "TENANT";

type PresetOverlay = {
  texts?: OverlayTextConfig[];
  pics?: OverlayPicConfig[];
  rects?: OverlayRectConfig[];
};

export type CreatePresetBody = {
  title: string;
  subtitle?: string | null;
  tags?: string[];
  sortOrder?: number;

  imageOrigin?: "AI" | "UPLOAD";
  format: string;
  prompt?: string;

  thumbnailUrl: string;
  thumbnailW?: number | null;
  thumbnailH?: number | null;

  // required by backend schema
  baseImageUrl: string | null;

  baseWidth?: number | null;
  baseHeight?: number | null;
  baseTransformJson?: BaseTransform | null;
  imageAdjustmentsJson?: ImageAdjustments | null;

  backgroundImageUrl: string;
  backgroundTransformJson?: BaseTransform | null;

  foregroundImageUrl?: string | null;
  foregroundTransformJson?: BaseTransform | null;

  swapDishEnabled?: boolean;
  dishType?: string | null;

  overlay: PresetOverlay;

  scope?: PresetScope;
  access?: PresetAccess;
  status?: PresetStatus;
};

export type BuildPresetPayloadInput = {
  apiBase: string;

  // editor state
  formatId: PostFormatId;
  prompt: string;

  // images (can be absolute or /uploads/...)
  baseImageUrl: string | null;
  backgroundImageUrl: string | null;
  foregroundImageUrl: string | null;

  // overlays
  items: OverlayTextItem[];
  pics: OverlayPicItem[];
  rects: OverlayRectItem[];

  // transforms/adjustments
  baseTransform: BaseTransform;
  backgroundTransform: BaseTransform;
  foregroundTransform: BaseTransform;
  imageAdjustments: ImageAdjustments;

  // builder inputs
  title: string;
  thumbnailUrl: string;
  tags?: string[];
  sortOrder?: number;
  subtitle?: string | null;

  // options
  access: PresetAccess;
  status: PresetStatus;
  scope: PresetScope;
  swapDishEnabled: boolean;
  dishType: string | null;

  baseWidth?: number | null;
  baseHeight?: number | null;

  thumbnailW?: number | null;
  thumbnailH?: number | null;
};

export function buildPresetPayloadFromEditor(input: BuildPresetPayloadInput): CreatePresetBody {
  const {
    apiBase,
    formatId,
    prompt,

    baseImageUrl,
    backgroundImageUrl,
    foregroundImageUrl,

    items,
    pics,
    rects,

    baseTransform,
    backgroundTransform,
    foregroundTransform,
    imageAdjustments,

    title,
    thumbnailUrl,
    tags,
    sortOrder,
    subtitle,

    access,
    status,
    scope,
    swapDishEnabled,
    dishType,

    baseWidth,
    baseHeight,
    thumbnailW,
    thumbnailH,
  } = input;

  const cleanTitle = title.trim() || "Untitled preset";

  // Convert any incoming url (absolute or /uploads/...) to relative uploads path.
  // IMPORTANT: empty string => null (so ?? fallbacks work)
  const relOrNull = (url: string | null | undefined): string | null => {
    const u = (url ?? "").trim();
    if (!u) return null;

    const r = toRelativeUploadPath(u, apiBase);
    const rr = (r ?? "").trim();
    return rr ? rr : null;
  };

  // Build overlay first because we may use its pics as a fallback thumbnail/background
  const overlay = buildPresetOverlay({ items, pics, rects, apiBase }) as PresetOverlay;

  // Pick a stable fallback image from overlay pics:
  // choose the lowest z (background-like), otherwise first pic
  const overlayFallbackPicUrl: string | null = (() => {
    const arr = overlay.pics ?? [];
    if (arr.length === 0) return null;

    const sorted = arr.slice().sort((a, b) => {
      const az = typeof a.z === "number" ? a.z : 0;
      const bz = typeof b.z === "number" ? b.z : 0;
      return az - bz;
    });

    const u = sorted[0]?.url;
    return typeof u === "string" && u.trim().length > 0 ? u : null;
  })();

  // Optional base
  const baseRel = relOrNull(baseImageUrl);

  // Background: if you still require it on backend, we MUST ensure non-null here.
  const bgRel =
    relOrNull(backgroundImageUrl) ??
    baseRel ??
    relOrNull(overlayFallbackPicUrl);

  // Thumbnail: required by backend schema
  const thumbRel =
    relOrNull(thumbnailUrl) ??
    bgRel ??
    baseRel ??
    relOrNull(overlayFallbackPicUrl);

  if (!thumbRel) {
    throw new Error(
      "Thumbnail is required. Provide thumbnail URL or ensure there is at least one image (background/base/pic) in the editor."
    );
  }

  // If backend still requires backgroundImageUrl, enforce it.
  // If you later make backgroundImageUrl optional in API/DB, you can remove this check and return bgRel ?? null.
  if (!bgRel) {
    throw new Error(
      "Background is required. Upload/select a background image or add at least one pic that can act as background."
    );
  }

  const fgRel = relOrNull(foregroundImageUrl);

  // prompt/origin
  const nextPrompt = (prompt ?? "").trim();
  const imageOrigin: "AI" | "UPLOAD" = nextPrompt ? "AI" : "UPLOAD";

  return {
    title: cleanTitle,
    subtitle: subtitle ?? null,
    tags: tags ?? [],
    sortOrder: typeof sortOrder === "number" ? sortOrder : 0,

    format: toPresetFormat(formatId),
    imageOrigin,
    ...(imageOrigin === "AI" ? { prompt: nextPrompt } : {}),

    // ✅ required
    thumbnailUrl: thumbRel,
    thumbnailW: thumbnailW ?? 512,
    thumbnailH: thumbnailH ?? 512,

    // ✅ optional now (variant A)
    baseImageUrl: baseRel,
    baseWidth: baseWidth ?? null,
    baseHeight: baseHeight ?? null,
    baseTransformJson: baseRel ? (baseTransform ?? null) : null,
    imageAdjustmentsJson: baseRel ? (imageAdjustments ?? null) : null,

    // ✅ required for now (until you make it optional on backend)
    backgroundImageUrl: bgRel,
    backgroundTransformJson: bgRel ? (backgroundTransform ?? null) : null,

    // ✅ optional
    foregroundImageUrl: fgRel ?? null,
    foregroundTransformJson: fgRel ? (foregroundTransform ?? null) : null,

    overlay,

    swapDishEnabled: !!swapDishEnabled,
    dishType: dishType ?? null,

    access,
    status,
    scope,
  };
}

type PresetBuilderPanelProps = {
  isSuperAdmin: boolean;

  apiBase: string;

  formatId: PostFormatId;
  prompt: string;

  proBaseImageUrl: string | null;
  backgroundImageUrl: string | null;
  foregroundImageUrl: string | null;

  items: OverlayTextItem[];
  pics: OverlayPicItem[];
  rects: OverlayRectItem[];

  baseTransform: BaseTransform;
  backgroundTransform: BaseTransform;
  foregroundTransform: BaseTransform;
  imageAdjustments: ImageAdjustments;

  baseWidth?: number | null;
  baseHeight?: number | null;

  selectedPicId?: string | null;

  onMarkDishSlot?: (picId: string) => void;

  onSave: (body: CreatePresetBody) => Promise<unknown>;
  onSaved?: () => void;
  onAddDishSlot?: () => void;

  defaultTitle?: string;
  defaultThumbnailUrl?: string;
};

export function PresetBuilderPanel(props: PresetBuilderPanelProps) {
  const {
    isSuperAdmin,
    apiBase,
    formatId,
    prompt,
    proBaseImageUrl,
    backgroundImageUrl,
    foregroundImageUrl,
    items,
    pics,
    rects,
    baseTransform,
    backgroundTransform,
    foregroundTransform,
    imageAdjustments,
    baseWidth,
    baseHeight,

    selectedPicId,

    onMarkDishSlot,

    onSave,
    onSaved,
    onAddDishSlot,
    defaultTitle,
    defaultThumbnailUrl,
  } = props;

  const { user, me } = useAuth();
  const authed = !!user;

  const [open, setOpen] = React.useState(true);
  const [title, setTitle] = React.useState(defaultTitle ?? "My template");
  const [thumb, setThumb] = React.useState(defaultThumbnailUrl ?? "");

  const [access, setAccess] = React.useState<PresetAccess>("PRO");
  const [status, setStatus] = React.useState<PresetStatus>("PUBLISHED");

  const [swapDishEnabled, setSwapDishEnabled] = React.useState<boolean>(true);
  const [dishType, setDishType] = React.useState<string>("");

  const [tagsText, setTagsText] = React.useState<string>("custom");
  const [sortOrderText, setSortOrderText] = React.useState<string>("0");

  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  const tags = React.useMemo(() => {
    return tagsText
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }, [tagsText]);

  const sortOrder = React.useMemo(() => {
    const n = Number(sortOrderText);
    return Number.isFinite(n) ? Math.trunc(n) : 0;
  }, [sortOrderText]);

  const canSave = !!authed && !busy;

  // ✅ conditional render AFTER hooks
  if (!isSuperAdmin) return null;

  return (
    <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950/60 p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm font-semibold text-slate-100">Preset Builder (SUPERADMIN)</div>
        <button
          type="button"
          className="text-xs px-2 py-1 rounded border border-slate-800 text-slate-200 hover:bg-slate-900"
          onClick={() => setOpen((v) => !v)}
        >
          {open ? "Hide" : "Show"}
        </button>
      </div>

      {!open ? null : (
        <div className="mt-3 grid grid-cols-1 gap-2">
          <label className="text-xs text-slate-300">
            Title
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-slate-100"
              placeholder="Preset title"
            />
          </label>

          <label className="text-xs text-slate-300">
            Thumbnail URL (recommended: /uploads/...)
            <input
              value={thumb}
              onChange={(e) => setThumb(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-slate-100"
              placeholder="/uploads/images/....png"
            />
          </label>

          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs text-slate-300">
              Access
              <select
                value={access}
                onChange={(e) => setAccess(e.target.value as PresetAccess)}
                className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-950 px-2 py-2 text-xs text-slate-100"
              >
                <option value="FREE">FREE</option>
                <option value="EDITOR">EDITOR</option>
                <option value="PRO">PRO</option>
                <option value="PRO_PLUS">PRO_PLUS</option>
              </select>
            </label>

            <label className="text-xs text-slate-300">
              Status
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as PresetStatus)}
                className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-950 px-2 py-2 text-xs text-slate-100"
              >
                <option value="PUBLISHED">PUBLISHED</option>
                <option value="DRAFT">DRAFT</option>
                <option value="ARCHIVED">ARCHIVED</option>
              </select>
            </label>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs text-slate-300">
              Tags (comma separated)
              <input
                value={tagsText}
                onChange={(e) => setTagsText(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-slate-100"
                placeholder="custom, promo, burger"
              />
            </label>

            <label className="text-xs text-slate-300">
              Sort order
              <input
                value={sortOrderText}
                onChange={(e) => setSortOrderText(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-slate-100"
                placeholder="0"
              />
            </label>
          </div>

          <div className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-950 p-2">
            <div className="text-xs text-slate-200">
              <div className="font-semibold">Swap dish</div>
              <div className="text-slate-500">Enable preset for dish swap workflow</div>
            </div>
            <button
              type="button"
              className={[
                "text-xs px-3 py-2 rounded-lg border",
                swapDishEnabled
                  ? "border-orange-500 text-orange-500 bg-slate-900"
                  : "border-slate-800 text-slate-400 bg-slate-950",
              ].join(" ")}
              onClick={() => setSwapDishEnabled((v) => !v)}
            >
              {swapDishEnabled ? "Enabled" : "Disabled"}
            </button>
          </div>

          <label className="text-xs text-slate-300">
            Dish type (optional)
            <input
              value={dishType}
              onChange={(e) => setDishType(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-slate-100"
              placeholder="burger / pizza / sushi ..."
            />
          </label>

          <div className="rounded-lg border border-slate-800 bg-slate-950 p-2 text-xs text-slate-400">
            <div>
              <span className="text-slate-500">Scope:</span>{" "}
              <span className="text-slate-200 font-semibold">SYSTEM</span>
            </div>
            <div>
              <span className="text-slate-500">Format:</span>{" "}
              <span className="text-slate-200">{formatId}</span>
            </div>
            <div>
              <span className="text-slate-500">Base image:</span>{" "}
              <span className="text-slate-200">{proBaseImageUrl ? "OK" : "missing"}</span>
            </div>
            <div>
              <span className="text-slate-500">Background layer:</span>{" "}
              <span className="text-slate-200">{backgroundImageUrl ? "OK" : "fallback to base"}</span>
            </div>
            <div>
              <span className="text-slate-500">Overlay items:</span>{" "}
              <span className="text-slate-200">
                texts {items.length}, pics {pics.length}, rects {rects.length}
              </span>
            </div>
            <div className="rounded-lg border border-slate-800 bg-slate-950 p-2 text-xs text-slate-300">
              <div className="font-semibold text-slate-100">Assignments</div>

              <div className="mt-2 text-slate-400">
                Selected pic:{" "}
                <span className="text-slate-100 font-semibold">
                  {selectedPicId ? selectedPicId : "none"}
                </span>
              </div>

              <div className="mt-2 grid grid-cols-1 gap-2">
                <button
                  type="button"
                  disabled={!selectedPicId}
                  onClick={() => selectedPicId && onMarkDishSlot?.(selectedPicId)}
                  className="w-full rounded-xl px-3 py-2 text-xs font-semibold border border-slate-800 bg-slate-800 text-slate-100 hover:bg-slate-700 disabled:opacity-50"
                >
                  Set selected pic as DISH_SLOT
                </button>


              </div>
            </div>

          </div>

          <button
            type="button"
            onClick={() => onAddDishSlot?.()}
            className="w-full rounded-xl px-3 py-2 text-xs font-semibold border border-slate-800 bg-slate-800 text-slate-100 hover:bg-slate-700"
          >
            Add Dish Slot
          </button>

          {err ? (
            <div className="rounded-lg border border-red-900 bg-red-950/40 p-2 text-xs text-red-200">
              {err}
            </div>
          ) : null}

          <button
            type="button"
            disabled={!canSave}
            className={[
              "mt-1 w-full rounded-lg px-3 py-2 text-xs font-semibold border",
              canSave
                ? "border-slate-700 bg-slate-900 text-slate-100 hover:bg-slate-800"
                : "border-slate-900 bg-slate-950 text-slate-500 cursor-not-allowed",
            ].join(" ")}
            onClick={async () => {
              if (!authed) return;
              if (busy) return;

              setErr(null);
              setBusy(true);
              try {
                const payload = buildPresetPayloadFromEditor({
                  apiBase,
                  formatId,
                  prompt,
                  title,
                  thumbnailUrl: thumb,


                  baseImageUrl: proBaseImageUrl,
                  backgroundImageUrl: proBaseImageUrl,
                  foregroundImageUrl: foregroundImageUrl || null,

                  items,
                  pics,
                  rects,

                  baseTransform,
                  backgroundTransform,
                  foregroundTransform,
                  imageAdjustments,

                  scope: "SYSTEM",
                  status: "DRAFT",
                  access: "PRO",

                  swapDishEnabled,
                  dishType,

                  baseWidth,
                  baseHeight,
                });

                if (!payload.thumbnailUrl || payload.thumbnailUrl.trim().length === 0) {
                  throw new Error("Thumbnail is missing (payload.thumbnailUrl is empty!).");
                }



                await onSave(payload);
                onSaved?.();
              } catch (e) {
                setErr(e instanceof Error ? e.message : "Failed to save preset");
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? "Saving..." : "Save SYSTEM preset"}
          </button>
        </div>
      )}
    </div>
  );
}
