"use client";

import { RotateCcw } from "lucide-react";

export type ImageAdjustments = {
  brightness: number; // -100..100
  contrast: number; // -100..100
  saturation: number; // -100..100
  vibrance: number; // -100..100 (preview approximation)
  highlights: number; // -100..100 (render-only for now)
  shadows: number; // -100..100 (render-only for now)
  temperature: number; // -100..100 (preview approximation)
  tint: number; // -100..100 (preview approximation)
  sharpness: number; // 0..100 (render-only for now)
  clarity: number; // -100..100 (render-only for now)
  texture: number; // -100..100 (render-only for now)
  vignette: number; // 0..100 (preview overlay)
  grain: number; // 0..100 (preview overlay)
};

export const DEFAULT_IMAGE_ADJUSTMENTS: ImageAdjustments = {
  brightness: 0,
  contrast: 0,
  saturation: 0,
  vibrance: 0,
  highlights: 0,
  shadows: 0,
  temperature: 0,
  tint: 0,
  sharpness: 0,
  clarity: 0,
  texture: 0,
  vignette: 0,
  grain: 0,
};

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function toPct01(v: number) {
  // -100..100 => 0..2 (1 is neutral)
  return 1 + clamp(v, -100, 100) / 100;
}

function toSaturate(v: number) {
  // -100..100 => 0..2
  return 1 + clamp(v, -100, 100) / 100;
}

function toHueRotateDegFromTint(tint: number) {
  // very rough preview approximation
  // -100..100 => -20..20 degrees
  return clamp(tint, -100, 100) * 0.2;
}

function toWarmthSepia(temperature: number) {
  // rough: -100..100 => 0..0.35
  // (more sepia = warmer)
  const t = clamp(temperature, -100, 100);
  if (t <= 0) return 0;
  return (t / 100) * 0.35;
}

function toCoolHueShift(temperature: number) {
  // rough: -100..100 => +10..-10 degrees
  // (negative temp shifts slightly to cooler hues)
  return clamp(temperature, -100, 100) * -0.1;
}

/**
 * Preview-only styling.
 *
 * Notes:
 * - CSS filters can't truly do highlights/shadows/clarity/texture/sharpness.
 * - We still keep those values in state so you can apply them in final backend render later.
 */
export function buildPreviewStyles(adj: ImageAdjustments) {
  const brightness = toPct01(adj.brightness);
  const contrast = toPct01(adj.contrast);

  // saturation + vibrance (approx): apply saturate twice (vibrance weaker)
  const saturate = toSaturate(adj.saturation);
  const vibrance = 1 + clamp(adj.vibrance, -100, 100) / 200; // half strength

  const sepia = toWarmthSepia(adj.temperature);
  const hueRotate = toHueRotateDegFromTint(adj.tint) + toCoolHueShift(adj.temperature);

  const filter = [
    `brightness(${brightness})`,
    `contrast(${contrast})`,
    `saturate(${saturate})`,
    `saturate(${vibrance})`,
    sepia > 0 ? `sepia(${sepia})` : null,
    hueRotate !== 0 ? `hue-rotate(${hueRotate}deg)` : null,
  ]
    .filter(Boolean)
    .join(" ");

  const vignetteOpacity = clamp(adj.vignette, 0, 100) / 100;
  const grainOpacity = clamp(adj.grain, 0, 100) / 100;

  return {
    filter,
    vignetteOpacity,
    grainOpacity,
  };
}

type SliderProps = {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (next: number) => void;
  hint?: string;
};

function Slider({ label, value, min, max, step = 1, onChange, hint }: SliderProps) {
  return (
    <div className="grid grid-cols-[110px_1fr_44px] items-center gap-3">
      <div className="text-[11px] text-slate-300">
        <div className="leading-tight">{label}</div>
        {hint ? <div className="text-[10px] text-slate-500">{hint}</div> : null}
      </div>

      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-sky-400"
      />

      <div className="text-right text-[11px] tabular-nums text-slate-400">
        {value}
      </div>
    </div>
  );
}

export function ImageAdjustmentsPanel({
  value,
  onChange,
  onReset,
}: {
  value: ImageAdjustments;
  onChange: (next: ImageAdjustments) => void;
  onReset?: () => void;
}) {
  const set = (patch: Partial<ImageAdjustments>) => onChange({ ...value, ...patch });

  return (
    <div className="rounded-2xl border border-slate-800">
      <div className="flex items-center justify-between pl-4 pr-1 pt-4 pb-2">
        <div>
          <div className="text-sm font-semibold text-slate-100">Image adjustments</div>
          <div className="text-[11px] text-slate-500">Canva-like basics for food photos</div>
        </div>
        <button
          type="button"
          onClick={onReset}
          className="text-[11px] px-2 py-2 rounded-md border border-slate-700 text-slate-300 hover:bg-slate-800"
        >
          <RotateCcw size={14} />
        </button>
      </div>

      <div className="px-4 pb-4 flex flex-col gap-3">
        <Slider label="Brightness" value={value.brightness} min={-100} max={100} onChange={(v) => set({ brightness: v })} />
        <Slider label="Contrast" value={value.contrast} min={-100} max={100} onChange={(v) => set({ contrast: v })} />
        <Slider label="Saturation" value={value.saturation} min={-100} max={100} onChange={(v) => set({ saturation: v })} />
        <Slider label="Vibrance" value={value.vibrance} min={-100} max={100} onChange={(v) => set({ vibrance: v })} hint="Preview approx" />

        <div className="h-px bg-slate-800 my-1" />

        <Slider label="Highlights" value={value.highlights} min={-100} max={100} onChange={(v) => set({ highlights: v })} hint="Render-only" />
        <Slider label="Shadows" value={value.shadows} min={-100} max={100} onChange={(v) => set({ shadows: v })} hint="Render-only" />

        <div className="h-px bg-slate-800 my-1" />

        <Slider label="Temperature" value={value.temperature} min={-100} max={100} onChange={(v) => set({ temperature: v })} hint="Preview approx" />
        <Slider label="Tint" value={value.tint} min={-100} max={100} onChange={(v) => set({ tint: v })} hint="Preview approx" />

        <div className="h-px bg-slate-800 my-1" />

        <Slider label="Sharpness" value={value.sharpness} min={0} max={100} onChange={(v) => set({ sharpness: v })} hint="Render-only" />
        <Slider label="Clarity" value={value.clarity} min={-100} max={100} onChange={(v) => set({ clarity: v })} hint="Render-only" />
        <Slider label="Texture" value={value.texture} min={-100} max={100} onChange={(v) => set({ texture: v })} hint="Render-only" />

        <div className="h-px bg-slate-800 my-1" />

        <Slider label="Vignette" value={value.vignette} min={0} max={100} onChange={(v) => set({ vignette: v })} />
        <Slider label="Grain" value={value.grain} min={0} max={100} onChange={(v) => set({ grain: v })} />

        <div className="text-[10px] text-slate-500 leading-snug pt-2">
          * Highlights/Shadows/Sharpness/Clarity/Texture are stored now and can be applied during final render (Node Canvas).
          Preview uses CSS filter + overlays where possible.
        </div>
      </div>
    </div>
  );
}
