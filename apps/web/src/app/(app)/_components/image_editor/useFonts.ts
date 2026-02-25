// apps/web/src/features/fonts/useFonts.ts
import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "../../../../lib/apiClient";
import { PRO_FONT_FAMILIES, getAvailableWeights } from "@socialchef/pro-fonts";
import type { OverlayTextItem } from "../../../../features/editor/editor.types";
import { useAuth } from "../../../../context/AuthContext";

export type CustomFont = { family: string; url: string };
type FontCaps = { bold: boolean; italic: boolean };

const FONT_CAPS: Record<string, FontCaps> = {
  Inter: { bold: true, italic: true },
  Montserrat: { bold: true, italic: false },
  "Bebas Neue": { bold: false, italic: false },
  Oswald: { bold: true, italic: false },
  Lora: { bold: true, italic: false },
};

export function getFontCaps(family: string): FontCaps {
  if (family.startsWith("custom:")) return { bold: true, italic: false };
  return FONT_CAPS[family] ?? { bold: true, italic: false };
}

export function weightLabel(w: number) {
  switch (w) {
    case 100: return "Thin";
    case 200: return "ExtraLight";
    case 300: return "Light";
    case 400: return "Regular";
    case 500: return "Medium";
    case 600: return "SemiBold";
    case 700: return "Bold";
    case 800: return "ExtraBold";
    case 900: return "Black";
    default: return String(w);
  }
}

function nearestWeight(target: number, allowed: number[]) {
  return allowed.reduce(
    (best, w) => (Math.abs(w - target) < Math.abs(best - target) ? w : best),
    allowed[0]
  );
}

export function useFonts() {
  const [customFonts, setCustomFonts] = useState<CustomFont[]>([]);

  const { user, me } = useAuth();
  const authed = !!user;

  // load custom fonts
  useEffect(() => {
    if (!authed) return;

    let cancelled = false;

    async function loadFonts() {
      try {
        const fonts = await apiFetch<{ items: { family: string; url: string }[] }>(
          "/ai/pro-fonts",
        );
        if (cancelled) return;
        setCustomFonts(fonts.items ?? []);
      } catch {
        // ignore
      }
    }

    void loadFonts();

    return () => {
      cancelled = true;
    };
  }, [authed]);

  const allFonts = useMemo(() => {
    const custom = customFonts.map((f) => ({
      id: `custom:${f.family}`,
      family: f.family,
      label: `${f.family} (custom)`,
    }));

    const system = PRO_FONT_FAMILIES.map((f) => ({
      id: `sys:${f.family}`,
      family: f.family,
      label: f.label,
    }));

    return [...custom, ...system];
  }, [customFonts]);

  function getAvailableWeightsSafe(fontFamily?: string) {
    if (!fontFamily) return [];
    return getAvailableWeights(fontFamily);
  }

  function computeWeightUi(activeItem: OverlayTextItem | null) {
    const fontFamily = activeItem?.fontFamily;
    const availableWeights = getAvailableWeightsSafe(fontFamily);

    const weightsForSelect = availableWeights.length ? availableWeights : [400];
    const weightSelectDisabled = weightsForSelect.length <= 1;

    const boldTarget = 700;
    const nextBold = availableWeights.length
      ? nearestWeight(boldTarget, availableWeights)
      : 700;

    return {
      fontFamily,
      availableWeights,
      weightsForSelect,
      weightSelectDisabled,
      nextBold,
    };
  }

  function enforceFontWeight(
    activeItem: OverlayTextItem | null,
    updateActive: (patch: Partial<OverlayTextItem>) => void
  ) {
    if (!activeItem) return;

    const availableWeights = getAvailableWeightsSafe(activeItem.fontFamily);
    const current = Number(activeItem.fontWeight ?? 400);

    if (availableWeights.length) {
      if (!availableWeights.includes(current)) {
        updateActive({ fontWeight: nearestWeight(current, availableWeights) });
      }
    } else {
      if (current !== 400) updateActive({ fontWeight: 400 });
    }
  }

  function enforceFontCaps(
    activeItem: OverlayTextItem | null,
    updateActive: (patch: Partial<OverlayTextItem>) => void
  ) {
    if (!activeItem) return;

    const caps = getFontCaps(activeItem.fontFamily);
    let patch: Partial<OverlayTextItem> | null = null;

    if (!caps.italic && activeItem.fontStyle === "italic") {
      patch = { ...(patch ?? {}), fontStyle: "normal" };
    }
    if (!caps.bold && (activeItem.fontWeight ?? 100) >= 700) {
      patch = { ...(patch ?? {}), fontWeight: 100 };
    }
    if (patch) updateActive(patch);
  }

  return {
    customFonts,
    setCustomFonts,

    allFonts,

    computeWeightUi,
    enforceFontWeight,
    enforceFontCaps,
  };
}
