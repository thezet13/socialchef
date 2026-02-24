import React, { useState } from "react";
import { createPortal } from "react-dom";

export type BaseSource = "preset" | "user";
import Image from "next/image";

export function BaseImageChooserModal(props: {
  open: boolean;
  onClose: () => void;

  presetUrl: string;
  userUrl: string;

  defaultValue?: BaseSource;
  onApply: (source: BaseSource) => void;
}) {
  const {
    open,
    onClose,
    presetUrl,
    userUrl,
    defaultValue = "user",
    onApply,
  } = props;

  // ✅ hooks must be unconditional
  const [value, setValue] = useState<BaseSource>(defaultValue);

  // ✅ render can still be conditional
  if (!open) return null;
  if (typeof window === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center backdrop-blur-md">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />

      <div className="relative z-[10000] w-full max-w-2xl rounded-2xl border border-slate-800 bg-slate-900 p-4 text-slate-100 shadow-xl">
        <div className="mb-3">
          <div className="text-xl font-semibold">Choose background image</div>
          <div className="mt-1 text-sm text-slate-400">
            Text and overlays will stay the same.
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <button
            type="button"
            onClick={() => setValue("user")}
            className={[
              "rounded-xl border p-3 text-left transition",
              value === "user"
                ? "border-sky-500 bg-sky-500/10"
                : "border-slate-800 hover:border-slate-600",
            ].join(" ")}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">Use my photo</span>
              {value === "user" && (
                <span className="text-[10px] rounded-full bg-slate-200 px-2 py-0.5 text-slate-950">
                  Selected
                </span>
              )}
            </div>

            <div className="relative aspect-video overflow-hidden rounded-lg border border-slate-800 bg-black/40">
              <Image
                src={userUrl}
                alt="User base"
                fill
                className="object-cover"
                />
            </div>

            <div className="mt-2 text-xs text-slate-400">
              Recommended if you uploaded or AI-improved your photo.
            </div>
          </button>

          <button
            type="button"
            onClick={() => setValue("preset")}
            className={[
              "rounded-xl border p-3 text-left transition",
              value === "preset"
                ? "border-sky-500 bg-sky-500/10"
                : "border-slate-800 hover:border-slate-600",
            ].join(" ")}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">Use preset photo</span>
              {value === "preset" && (
                <span className="text-[10px] rounded-full bg-slate-200 px-2 py-0.5 text-slate-950">
                  Selected
                </span>
              )}
            </div>

            <div className="relative aspect-video overflow-hidden rounded-lg border border-slate-800 bg-black/40">
              <Image
                src={presetUrl}
                alt="Preset base"
                fill
                className="object-cover"
                />
            </div>

            <div className="mt-2 text-xs text-slate-400">Keeps the original preset background.</div>
          </button>
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-slate-700 px-4 py-2 text-sm hover:bg-slate-900"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              onApply(value);
            }}
            className="rounded-xl bg-blue-500 px-4 py-2 text-md font-medium text-slate-950 hover:bg-white"
          >
            Apply
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
