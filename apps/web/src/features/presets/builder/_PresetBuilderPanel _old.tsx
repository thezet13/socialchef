"use client";

import { useMemo, useState } from "react";
import type { EditorPreset } from "@/features/presets/preset.editor.types";
import type {
  OverlayTextItem,
  OverlayPicItem,
  OverlayRectItem,
} from "@/features/editor/editor.types";

import { buildPresetFromEditor } from "./editorToPreset";

function downloadTextFile(filename: string, text: string) {
  const blob = new Blob([text], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function PresetBuilderPanel(props: {
    name: string;
        onChangeName: (v: string) => void;  prompt: string;
    thumbnailUrl: string;
        onChangeThumbnailUrl: (v: string) => void;
    style?: string;
    currentImageUrl?: string | null;
    format: EditorPreset["format"];
    items: OverlayTextItem[];
    pics: OverlayPicItem[];
    rects: OverlayRectItem[];


}) {
  const { prompt, style, currentImageUrl, format, items, pics, rects } = props;

  const { name, onChangeName, thumbnailUrl, onChangeThumbnailUrl } = props;

  const [jsonText, setJsonText] = useState("");

  const capturedPreset: EditorPreset = useMemo(() => {
    return buildPresetFromEditor({
      name,
      prompt,
      style,
      format,
      thumbnailUrl,
      texts: items,
      pics,
      rects,
    });
  }, [name, prompt, style, format, thumbnailUrl, items, pics, rects]);

  function handleCapture() {
    setJsonText(JSON.stringify(capturedPreset, null, 2));
  }

  async function handleCopy() {
    await navigator.clipboard.writeText(jsonText || JSON.stringify(capturedPreset, null, 2));
  }

  function handleDownload() {
    const text = jsonText || JSON.stringify(capturedPreset, null, 2);
    const safe = name.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9\-]/g, "");
    downloadTextFile(`${safe || "preset"}.json`, text);
  }

  function handleApplyJson() {
    try {
      const p = JSON.parse(jsonText) as EditorPreset;
    } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        alert(`Invalid JSON: ${message}`);
    }
  }

  async function handleImportFile(file: File | null) {
    if (!file) return;
    const text = await file.text();
    setJsonText(text);
  }

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-950 p-4 space-y-4">
      <div className="text-sm font-semibold">Preset Builder v1</div>

      <div className="grid grid-cols-2 gap-3">
        <label className="text-xs text-slate-300">
          Name
          <input
            value={name}
            onChange={(e) => onChangeName(e.target.value)}
            className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-sm"
          />
        </label>

        <label className="text-xs text-slate-300">
          Thumbnail URL (optional)
          <input
            value={thumbnailUrl}
            onChange={(e) => onChangeThumbnailUrl(e.target.value)}
            className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-sm"
          />
        </label>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={handleCapture}
          className="rounded-xl bg-slate-200 px-3 py-2 text-sm text-slate-900"
        >
          Capture editor → JSON
        </button>

        <button
          type="button"
          onClick={handleCopy}
          className="rounded-xl border border-slate-700 px-3 py-2 text-sm text-slate-200"
        >
          Copy JSON
        </button>

        <button
          type="button"
          onClick={handleDownload}
          className="rounded-xl border border-slate-700 px-3 py-2 text-sm text-slate-200"
        >
          Download JSON
        </button>

        <label className="rounded-xl border border-slate-700 px-3 py-2 text-sm text-slate-200 cursor-pointer">
          Import file
          <input
            type="file"
            accept="application/json"
            className="hidden"
            onChange={(e) => handleImportFile(e.target.files?.[0] ?? null)}
          />
        </label>

        <button
          type="button"
          onClick={handleApplyJson}
          className="rounded-xl bg-blue-500 px-3 py-2 text-sm text-slate-950"
        >
          Apply JSON to editor
        </button>

        <button
            type="button"
            disabled={!currentImageUrl}
            onClick={() => currentImageUrl && onChangeThumbnailUrl(currentImageUrl)}
            className={[
                "rounded-xl border border-slate-700 px-3 py-2 text-sm",
                currentImageUrl ? "text-slate-200" : "text-slate-500 opacity-60",
            ].join(" ")}
            >
            Use current image as thumbnail
            </button>
      </div>

      <textarea
        value={jsonText}
        onChange={(e) => setJsonText(e.target.value)}
        placeholder="Press Capture, or paste preset JSON here…"
        className="h-72 w-full rounded-2xl border border-slate-800 bg-slate-900 p-3 font-mono text-xs text-slate-100"
      />

      <div className="text-xs text-slate-400">
        Captures: texts={items.length}, pics={pics.length}, rects={rects.length}, format={String(format)}
      </div>
    </div>
  );
}
