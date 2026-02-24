"use client";

import { useAuth } from "@/context/AuthContext";
import { readCookie } from "@/lib/apiClient";
import { applyCreditsFromResponse } from "@/lib/applyCreditsFromResponse";
import React, { useMemo, useState } from "react";

type Props = {
    apiBase: string;
    onCreated?: () => void;
};

type UploadResp = {
    imageUrl: string;
    thumbnailUrl: string;
    imageW: number;
    imageH: number;
    thumbW: number;
    thumbH: number;
    error?: string;
};

type AnalyzeResp = {
    prompt: string;
    title?: string;
    description?: string;
    error?: string;
};

function toUploadsPath(urlOrPath: string) {
    const s = (urlOrPath || "").trim();
    if (!s) return s;
    const idx = s.indexOf("/uploads/");
    if (idx >= 0) return s.slice(idx);
    return s;
}

export function StyleCreateCard({ apiBase, onCreated }: Props) {
    const [scope, setScope] = useState<"SYSTEM" | "TENANT">("SYSTEM");

    const { setCreditsBalance, refreshMe } = useAuth();


    const [imageUrl, setImageUrl] = useState<string>("");
    const [thumbnailUrl, setThumbnailUrl] = useState<string>("");

    const [title, setTitle] = useState("");
    const [description, setDescription] = useState("");
    const [stylePrompt, setStylePrompt] = useState("");

    const [uploading, setUploading] = useState(false);
    const [analyzing, setAnalyzing] = useState(false);
    const [saving, setSaving] = useState(false);
    const [err, setErr] = useState<string | null>(null);

    const canGenerate = useMemo(() => !!imageUrl, [imageUrl]);
    const canSave = useMemo(
        () => !!title.trim() && !!thumbnailUrl && !!imageUrl && !!stylePrompt.trim(),
        [title, thumbnailUrl, imageUrl, stylePrompt]
    );

    function toPublicUrl(apiBase: string, url: string) {
        const s = (url || "").trim();
        if (!s) return s;
        if (s.startsWith("http://") || s.startsWith("https://")) return s;
        if (s.startsWith("/")) return `${apiBase}${s}`;
        return `${apiBase}/${s}`;
    }

    async function onPickFile(file: File) {
        try {
            setErr(null);
            setUploading(true);

            const fd = new FormData();
            fd.append("file", file);

            const csrf = readCookie("sc_csrf");

            const rsp = await fetch(`${apiBase}/styles/upload`, {
                method: "POST",
                body: fd,
                credentials: "include",
                headers: csrf ? { "x-csrf-token": csrf } : {},
            });

            const data = (await rsp.json()) as UploadResp;
            if (!rsp.ok) throw new Error(data.error || `Upload failed (${rsp.status})`);

            setImageUrl(toUploadsPath(data.imageUrl));
            setThumbnailUrl(toUploadsPath(data.thumbnailUrl));

            // сбросим автоген, чтобы не мешало
            setStylePrompt("");
            setDescription("");
            // title НЕ трогаем: пусть юзер уже мог набрать
        } catch (e: unknown) {
            setErr(e instanceof Error ? e.message : "Upload failed");
        } finally {
            setUploading(false);
        }
    }

    async function onGenerate() {
        try {
            setErr(null);
            if (!canGenerate) throw new Error("Upload style image first");

            setAnalyzing(true);

            const csrf = readCookie("sc_csrf");

            const rsp = await fetch(`${apiBase}/styles/analyze`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    ...(csrf ? { "x-csrf-token": csrf } : {}),
                },
                credentials: "include",
                body: JSON.stringify({
                    imageUrl: toUploadsPath(imageUrl),
                    hintTitle: title.trim() || undefined,
                }),
            });

            const data = (await rsp.json()) as AnalyzeResp & { creditsBalance?: number };

            if (!rsp.ok) throw new Error(data.error || `Analyze failed (${rsp.status})`);

            // ✅ ВОТ ТУТ, после json
            if (!applyCreditsFromResponse(data, setCreditsBalance)) {
                await refreshMe();
            }
            if (data.title && !title.trim()) setTitle(data.title);
            if (data.description) setDescription(data.description);
            setStylePrompt(data.prompt ?? "");
        } catch (e: unknown) {
            setErr(e instanceof Error ? e.message : "Analyze failed");
        } finally {
            setAnalyzing(false);
        }
    }

    async function onSaveStyle() {
        try {
            setErr(null);
            if (!canSave) throw new Error("Fill required fields first");

            setSaving(true);

            const csrf = readCookie("sc_csrf");

            const rsp = await fetch(`${apiBase}/styles`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    ...(csrf ? { "x-csrf-token": csrf } : {}),
                },
                credentials: "include",
                body: JSON.stringify({
                    scope,
                    title: title.trim(),
                    description: description.trim() || undefined,
                    previewUrl: toUploadsPath(thumbnailUrl),
                    sourceUrl: toUploadsPath(imageUrl),
                    prompt: stylePrompt.trim(),
                }),
            });

            const data = (await rsp.json()) as { id?: string; error?: string };

            if (!rsp.ok) {
                if (rsp.status === 403) throw new Error("SYSTEM styles can be created only by SUPERADMIN");
                throw new Error(data.error || `Save failed (${rsp.status})`);
            }

            // reset — просто очистить всё
            setTitle("");
            setDescription("");
            setStylePrompt("");
            setImageUrl("");
            setThumbnailUrl("");

            onCreated?.();
        } catch (e: unknown) {
            setErr(e instanceof Error ? e.message : "Save failed");
        } finally {
            setSaving(false);
        }
    }

    return (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-4">
            <div className="flex items-center justify-between">
                <div className="text-slate-200 text-lg">Create style</div>

                <select
                    className="bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 text-xs text-slate-200"
                    value={scope}
                    onChange={(e) => setScope(e.target.value as "SYSTEM" | "TENANT")}
                >
                    <option value="SYSTEM">SYSTEM</option>
                    <option value="TENANT">TENANT</option>
                </select>
            </div>

            {err && <div className="text-xs text-red-400">{err}</div>}

            {/* Upload */}
            <div className="space-y-2">
                <div className="text-xs text-slate-400">Style image</div>

                <div className="flex items-center gap-3">
                    <label className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-800 bg-slate-950 text-slate-200 text-sm cursor-pointer hover:bg-slate-900">
                        <input
                            type="file"
                            className="hidden"
                            accept="image/png,image/jpeg,image/webp"
                            onChange={(e) => {
                                const f = e.target.files?.[0];
                                if (f) void onPickFile(f);
                                e.currentTarget.value = "";
                            }}
                            disabled={uploading}
                        />
                        {uploading ? "Uploading…" : "Upload image"}
                    </label>

                    {imageUrl ? (
                        <div className="text-[11px] text-slate-500 truncate max-w-[240px]">{toPublicUrl(apiBase, imageUrl)}</div>
                    ) : (
                        <div className="text-[11px] text-slate-500">PNG/JPG/WEBP</div>
                    )}
                </div>

                {(thumbnailUrl || imageUrl) && (
                    <div className="grid grid-cols-2 gap-2">
                        <div className="rounded-xl overflow-hidden border border-slate-800 bg-slate-950">
                            <div className="text-[10px] text-slate-500 px-2 py-1 border-b border-slate-800">Thumbnail</div>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={toPublicUrl(apiBase, thumbnailUrl || imageUrl)} alt="thumb" className="w-full aspect-square object-cover" />
                        </div>

                        <div className="rounded-xl overflow-hidden border border-slate-800 bg-slate-950">
                            <div className="text-[10px] text-slate-500 px-2 py-1 border-b border-slate-800">Reference</div>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={toPublicUrl(apiBase, imageUrl)} alt="ref" className="w-full aspect-square object-cover" />
                        </div>
                    </div>
                )}
            </div>

            {/* Generate */}
            <div className="flex gap-2">
                <button
                    className="px-3 py-2 rounded-xl bg-slate-200 text-slate-900 text-sm disabled:opacity-50"
                    onClick={onGenerate}
                    disabled={analyzing || uploading || !canGenerate}
                >
                    {analyzing ? "Generating…" : "Generate"}
                </button>

                <button
                    className="px-3 py-2 rounded-xl bg-emerald-500 text-slate-950 text-sm disabled:opacity-50"
                    onClick={onSaveStyle}
                    disabled={saving || uploading || analyzing || !canSave}
                >
                    {saving ? "Saving…" : "Save style"}
                </button>
            </div>

            {/* Fields */}
            <div className="space-y-2">
                <label className="text-xs text-slate-400">Title</label>
                <input
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-200"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Auto-filled after Generate"
                />
            </div>

            <div className="space-y-2">
                <label className="text-xs text-slate-400">Description</label>
                <textarea
                    className="w-full min-h-[70px] bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-200"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Short human description (optional)"
                />
            </div>

            <div className="space-y-2">
                <label className="text-xs text-slate-400">Style prompt</label>
                <textarea
                    className="w-full min-h-[160px] bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-200"
                    value={stylePrompt}
                    onChange={(e) => setStylePrompt(e.target.value)}
                    placeholder="Generated style prompt (editable)"
                />
            </div>
        </div>
    );
}
