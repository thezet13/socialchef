// apps/web/src/components/FormatPickerCompact.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { PostFormatId, PostFormatDef } from "@/features/formats/postFormats";

function ratioLabel(w: number, h: number): string {
  const r = w / h;

  if (Math.abs(r - 1) < 0.03) return "1:1";
  if (Math.abs(r - 2 / 3) < 0.03) return "2:3";
  if (Math.abs(r - 3 / 2) < 0.03) return "3:2";
  if (Math.abs(r - 4 / 5) < 0.03) return "4:5";
  if (Math.abs(r - 5 / 4) < 0.03) return "5:4";
  if (Math.abs(r - 9 / 16) < 0.03) return "9:16";
  if (Math.abs(r - 16 / 9) < 0.03) return "16:9";

  return `${w}×${h}`;
}

/** contain inside a fixed box (boxW x boxH) to visualize ratio */
function getPreviewSize(
  w: number,
  h: number,
  boxW = 28,
  boxH = 28,
): { outW: number; outH: number } {
  const r = w / h;

  let outW = boxW;
  let outH = outW / r;

  if (outH > boxH) {
    outH = boxH;
    outW = outH * r;
  }

  outW = Math.max(2, Math.round(outW));
  outH = Math.max(2, Math.round(outH));

  return { outW, outH };
}

type Props = {
  formats: PostFormatDef[]; // <-- directly your POST_FORMATS items
  value: PostFormatId;
  onChange: (id: PostFormatId) => void;

  /** optional UI tuning */
  boxSizePx?: number; // size of the preview container square in dropdown (default 32)
  previewMaxPx?: number; // max w/h for the actual ratio rectangle (default 28)
  columns?: number; // grid cols in dropdown (default 4)
  showResolution?: boolean; // show 1080×1350 under label (default false)
};

export function FormatPickerCompact({
  formats,
  value,
  onChange,
  boxSizePx = 32,
  previewMaxPx = 28,
  columns = 4,
  showResolution = false,
}: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  const active = useMemo(() => {
    const found = formats.find((x) => x.id === value);
    return found ?? formats[0];
  }, [formats, value]);

  // close on outside click + ESC
  useEffect(() => {
    function onDown(e: MouseEvent) {
      const host = ref.current;
      if (!host) return;
      if (!host.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  if (!active) return null;

  const activeTitle = `${active.label} • ${active.width}×${active.height} • ${active.description}`;

  return (
    <div className="relative inline-flex" ref={ref}>
      {/* CURRENT */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="
          flex items-center gap-2
          rounded-lg border border-slate-700 bg-slate-950/50
          hover:border-slate-500
          px-2 py-1.5
        "
        title={activeTitle}
      >
        <span className="text-base text-slate-200 pl-2">{ratioLabel(active.width, active.height)}</span>
        {/* <span className="text-base text-slate-400">
          {active.width}×{active.height}
        </span> */}
        <span className="text-xs text-slate-500">▾</span>
      </button>

      {/* DROPDOWN */}
      {open && (
        <div
          className="
            absolute left-0 top-full mt-[-1px] z-300
            rounded-md border border-slate-700 bg-slate-950/95
            shadow-xl
            p-2
            w-[320px]
          "
        >
          <div
            className="grid gap-2"
            style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
          >
            {formats.map((f) => {
              const isActive = f.id === value;

              const { outW, outH } = getPreviewSize(
                f.width,
                f.height,
                previewMaxPx,
                previewMaxPx,
              );

              const title = `${f.label} • ${f.width}×${f.height} • ${f.description}`;

              return (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => {
                    onChange(f.id);
                    setOpen(false);
                  }}
                  className="
                    flex flex-col items-center
                    px-1 py-1.5
                    hover:bg-slate-900/60 transition
                    rounded-md
                  "
                  title={title}
                >
                  {/* fixed box, ratio-rect inside (contain) */}
                  <div
                    className="relative flex items-center justify-center"
                    style={{ width: boxSizePx, height: boxSizePx }}
                  >
                    <div
                      className={`
                        rounded-sm border
                        ${
                          isActive
                            ? "bg-blue-500/25 border-blue-500/70"
                            : "bg-slate-800/70 border-slate-700"
                        }
                      `}
                      style={{ width: outW, height: outH }}
                    />

                    {isActive && (
                      <div className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-blue-500 text-slate-950 text-[9px] flex items-center justify-center">
                        ✓
                      </div>
                    )}
                  </div>

                  {/* ratio label */}
                  <div
                    className={`mt-1 text-[10px] leading-none ${
                      isActive ? "text-blue-400" : "text-slate-300"
                    }`}
                  >
                    {ratioLabel(f.width, f.height)}
                  </div>

                  {/* optional resolution */}
                  {showResolution && (
                    <div className="mt-0.5 text-[9px] leading-none text-slate-500">
                      {f.width}×{f.height}
                    </div>
                  )}
                </button>
              );
            })}
          </div>

        </div>
      )}
    </div>
  );
}
