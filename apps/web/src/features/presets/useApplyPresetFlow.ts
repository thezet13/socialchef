"use client";

import React from "react";
import type { ApplyPresetChoice, OverlayMode, ImageMode } from "@/components/ApplyPresetModal";

type Counts = { texts: number; pics: number; rects: number };

function countOverlay(overlay: { texts?: unknown[]; pics?: unknown[]; rects?: unknown[] } | null | undefined): Counts {
  return {
    texts: overlay?.texts?.length ?? 0,
    pics: overlay?.pics?.length ?? 0,
    rects: overlay?.rects?.length ?? 0,
  };
}

function hasAny(counts: Counts): boolean {
  return counts.texts + counts.pics + counts.rects > 0;
}

export type ApplyPresetRequest = {
  currentOverlay: { texts?: unknown[]; pics?: unknown[]; rects?: unknown[] } | null;
  presetOverlay: { texts?: unknown[]; pics?: unknown[]; rects?: unknown[] } | null;

  hasCurrentImage: boolean;
  presetHasImage: boolean;
};

export function useApplyPresetFlow() {
  const [open, setOpen] = React.useState(false);

  const [showImageSection, setShowImageSection] = React.useState(false);
  const [defaultOverlayMode, setDefaultOverlayMode] = React.useState<OverlayMode>("REPLACE");
  const [defaultImageMode, setDefaultImageMode] = React.useState<ImageMode>("KEEP");

  const [currentCounts, setCurrentCounts] = React.useState<Counts>({ texts: 0, pics: 0, rects: 0 });
  const [presetCounts, setPresetCounts] = React.useState<Counts>({ texts: 0, pics: 0, rects: 0 });

  const resolver = React.useRef<((v: ApplyPresetChoice | null) => void) | null>(null);

  const requestApplyPreset = React.useCallback(async (req: ApplyPresetRequest) => {
  const cc = countOverlay(req.currentOverlay ?? undefined);
  const pc = countOverlay(req.presetOverlay ?? undefined);

  setCurrentCounts(cc);
  setPresetCounts(pc);

  const hasCurrentOverlay = hasAny(cc);
  const needImageChoice = req.hasCurrentImage && req.presetHasImage;

  // ✅ если нет конфликтов — не показываем модалку, сразу возвращаем дефолт
  if (!hasCurrentOverlay && !needImageChoice) {
    return {
      overlayMode: "REPLACE" as const,
      imageMode: req.presetHasImage ? ("REPLACE" as const) : ("KEEP" as const),
    };
  }

  // дальше — показываем модалку
  setDefaultOverlayMode(hasCurrentOverlay ? "REPLACE" : "REPLACE");
  setShowImageSection(needImageChoice);

  setDefaultImageMode(needImageChoice ? "KEEP" : "REPLACE");

  setOpen(true);

  return new Promise<ApplyPresetChoice | null>((resolve) => {
    resolver.current = resolve;
  });
}, []);

  const close = React.useCallback(() => {
    setOpen(false);
    const r = resolver.current;
    resolver.current = null;
    r?.(null);
  }, []);

  const confirm = React.useCallback((choice: ApplyPresetChoice) => {
    setOpen(false);
    const r = resolver.current;
    resolver.current = null;
    r?.(choice);
  }, []);

  return {
    modalState: { open, showImageSection, defaultOverlayMode, defaultImageMode, currentCounts, presetCounts },
    requestApplyPreset,
    closeApplyPreset: close,
    confirmApplyPreset: confirm,
  };
}
