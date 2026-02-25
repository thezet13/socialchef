// apps/web/src/components/ComboPreviewModal.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Portal } from "../lib/portal";
import { getFormatById, PostFormatId } from "../features/formats/postFormats";
import { getActionCostCredits, formatCredits } from "@socialchef/shared";
import { Flame, X } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { apiFetch } from "../lib/apiClient";
import { Spinner } from "./Spinner";

type ComboLayout = "AUTO" | "ROW" | "GRID" | "HERO_SIDES";
type ComboBgStrictness = "STRICT" | "CREATIVE";

type Props = {
    open: boolean;
    onClose: () => void;

    apiBase: string;

    proDesignId: string | null;
    styleId: string | null;
    formatId: PostFormatId;

    items: { id: string; imageUrl: string; absUrl: string }[]; // 2..4
    initialPrompt?: string;

    plan?: "FREE" | "EDITOR" | "PRO" | "PRO_PLUS";
    creditsBalance?: number;
    onPaywall?: (payload: unknown) => void;

    styleRefUrl?: string | null;

    onUseInEditor: (args: { mode: "preview"; imageUrl: string; prompt?: string }) => void;

    onEnsureDesign?: (next: { proDesignId: string; baseImageUrl: string }) => void;
};

export function ComboPreviewModal(props: Props) {
    const {
        open, onClose, apiBase, proDesignId, styleId, formatId,
        items, initialPrompt, creditsBalance, plan, onUseInEditor, styleRefUrl,
    } = props;

    const { user, me } = useAuth();
    const authed = !!user;

    const formatDef = useMemo(() => getFormatById(formatId), [formatId]);

    const [phase, setPhase] = useState<"idle" | "loading" | "ready" | "error">("idle");
    const [err, setErr] = useState<string | null>(null);

    const [promptDraft, setPromptDraft] = useState(initialPrompt ?? "");
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);

    const [layout, setLayout] = useState<ComboLayout>("AUTO");
    const [bgStrictness, setBgStrictness] = useState<ComboBgStrictness>("STRICT");

    const previewCost = getActionCostCredits("COMBO_PREVIEW");
    const balance = creditsBalance ?? 0;
    const hasCreditsForTry = balance >= previewCost;

    const { setCreditsBalance } = useAuth();

    const canTryAgain = useMemo(() => {
        if (!open) return false;
        if (!authed || !styleId) return false;
        if (phase === "loading") return false;
        if (!hasCreditsForTry) return false;
        if (items.length < 2 || items.length > 4) return false;
        return true;
    }, [open, authed, styleId, phase, hasCreditsForTry, items.length]);

    const accentClass = canTryAgain ? "text-orange-500" : "text-slate-600";
    const ASPECT = formatDef.width / formatDef.height;

    async function ensureDesignId(): Promise<string> {
        if (proDesignId) return proDesignId;

        const fmt = getFormatById(formatId);

        const r = await apiFetch<{ id: string; baseImageUrl: string }>(
            "/ai/pro-images/create-empty-design",
            {
                method: "POST",
                body: { width: fmt.width, height: fmt.height },
            }
        );

        // важно: поднять наверх в page.tsx
        // если модалка сама не имеет setProDesignId — передай callback пропом
        props.onEnsureDesign?.({
            proDesignId: r.id,
            baseImageUrl: r.baseImageUrl,
        });

        return r.id;
    }


    async function generatePreview() {
        setErr(null);

        if (!hasCreditsForTry) {
            props.onPaywall?.({
                reason: "INSUFFICIENT_CREDITS",
                action: "COMBO_PREVIEW",
                cost: previewCost,
                balance,
                plan,
            });
            setErr("Not enough credits.");
            setPhase("error");
            return;
        }

        setPhase("loading");

        try {
            if (!authed) throw new Error("Not authorized");
            if (!styleId) throw new Error("Pick a style first");
            if (items.length < 2) throw new Error("Add at least 2 photos");
            if (items.length > 4) throw new Error("Max 4 photos");

            const id = proDesignId ?? (await ensureDesignId());

            const r = await apiFetch<{
                mode: "preview";
                previewImageUrl: string;
                creditsBalance?: number;
            }>("/ai/pro-images/combo-gpt15", {
                method: "POST",
                body: {
                    proDesignId: id,
                    styleId,
                    mode: "preview",
                    formatId,
                    items: items.map((x) => ({ imageUrl: x.imageUrl })), // relative urls
                    layout,
                    bgStrictness,
                    prompt: promptDraft.trim() || undefined,
                    quality: "low",
                    width: 512,
                    height: 512,
                },
            });

            if (typeof r.creditsBalance === "number") {
                setCreditsBalance(r.creditsBalance);
            }

            setPreviewUrl(r.previewImageUrl);
            setPhase("ready");
        } catch (e: unknown) {
            setErr(e instanceof Error ? e.message : "Preview failed");
            setPhase("error");
        }
    }

    async function handleUse() {
        if (!previewUrl) return;

        setErr(null);
        setPhase("loading");

        try {
            if (!authed) throw new Error("Not authorized");

            // ✅ Всегда 2K
            const maxSide = 2048;

            // 1) Upscale до 2K
            const up = await apiFetch<{ imageUrl: string }>(
                "/ai/images/upscale",
                {
                    method: "POST",
                    body: {
                        sourceImageUrl: previewUrl,   // "/uploads/images/....png"
                        targetMaxSide: maxSide,
                        outputFormat: "png",
                    },
                }
            );

            // 2) Отдаём уже UPSCALED url в редактор
            props.onUseInEditor({
                mode: "preview",
                imageUrl: up.imageUrl,
                prompt: promptDraft.trim() || undefined,
            });

            handleClose();
        } catch (e: unknown) {
            setErr(e instanceof Error ? e.message : "Use failed");
            setPhase("error");
        }
    }



    function handleClose() {
        setPhase("idle");
        setErr(null);
        setPreviewUrl(null);
        setPromptDraft(initialPrompt ?? "");
        setLayout("AUTO");
        setBgStrictness("STRICT");
        onClose();
    }

    const modalRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        if (!open) return;
        setPhase("idle");
        setErr(null);
        setPreviewUrl(null);
        setPromptDraft(initialPrompt ?? "");
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    if (!open) return null;

    function RadioRow<T extends string>(props: {
        label: string;
        value: T;
        current: T;
        onChange: (v: T) => void;
        desc?: string;
    }) {
        const { label, value, current, onChange, desc } = props;
        const checked = current === value;

        return (
            <button
                type="button"
                onClick={() => onChange(value)}
                className={[
                    "w-full text-left rounded-xl border px-3 py-2 transition",
                    checked ? "border-blue-600 bg-blue-500/10" : "border-slate-800 bg-slate-950/30 hover:border-slate-700",
                ].join(" ")}
            >
                <div className="flex items-start justify-between gap-3">
                    <div className="">
                        <div className="text-[12px] text-slate-200 font-medium">{label}</div>
                        {desc ? <div className="text-[10px] text-slate-500 mt-0.5">{desc}</div> : null}
                    </div>
                    {/* <div
                        className={[
                            "mt-1 h-4 w-4 rounded-full border flex items-center justify-center",
                            checked ? "border-blue-500" : "border-slate-700",
                        ].join(" ")}
                    >
                        {checked ? <div className="h-2 w-2 rounded-full bg-blue-500" /> : null}
                    </div> */}
                </div>
            </button>
        );
    }

    return (
        <Portal>
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 backdrop-blur-md">
                <div
                    ref={modalRef}
                    className={[
                        "relative w-[min(1200px,calc(100vw-2rem))]",
                        "max-h-[calc(100vh-2rem)]",
                        "rounded-2xl border border-slate-800 bg-slate-900 shadow-xl",
                        "overflow-hidden", // важно: скролл будет внутри
                    ].join(" ")}
                >
                    {/* header */}
                    <div className="flex items-start justify-between px-5 py-4 border-b border-slate-800">
                        <div className="text-2xl text-slate-200">
                            Combo preview
                        </div>

                        <div className="flex justify-between gap-10 items-start">
                            <div className="flex mt-1 mb-0 text-md text-slate-400 gap-1">
                                <Flame size="20" className="text-orange-500" /> {" "}
                                <span className={hasCreditsForTry ? "text-orange-500" : "text-red-400"}>
                                    {formatCredits(balance)}
                                </span>{" "}
                            </div>
                            <button
                                type="button"
                                onClick={handleClose}
                                className="text-slate-400 hover:text-slate-200 text-sm px-2 py-2 rounded-md border border-slate-800 bg-slate-900"
                            >
                                <X className="h-4 w-4" />
                            </button></div>
                    </div>
                    <div className="p-5 grid grid-cols-2 gap-5 overflow-y-auto scrollbar-thin-custom justify-center">
                        {/* Left: preview */}
                        <div className="flex justify-center relative rounded-2xl"
                            style={{ aspectRatio: `${ASPECT}` }}
                        >
                            <div className="rounded-2xl border max-h-[75vh] border-slate-800 bg-slate-950 flex items-center justify-center relative"
                                style={{ aspectRatio: `${ASPECT}` }}
                            >

                                {err ? (
                                    <div className="mt-3 text-[12px] rounded-md text-red-400 p-3 bg-red-500/10 border border-red-300/30">
                                        {err}
                                    </div>
                                ) : null}

                                {previewUrl ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img
                                        src={`${apiBase}${previewUrl}`}
                                        alt="Combo preview"
                                        className="absolute inset-0 w-full h-full object-contain"
                                    />
                                ) : (
                                    <div className="absolute inset-0">
                                        {/* Background style ref */}
                                        {styleRefUrl ? (
                                            <>
                                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                                <img
                                                    src={styleRefUrl}
                                                    alt="Style background"
                                                    className="rounded-2xl absolute inset-0 w-full h-full object-cover"
                                                />
                                                <div className="absolute inset-0" />
                                            </>
                                        ) : (
                                            <div className="absolute inset-0 bg-slate-900/40" />
                                        )}

                                        {/* Foreground items grid */}
                                        <div className="absolute inset-0">
                                            {items.length === 0 ? (
                                                <div className="w-full h-full flex items-center justify-center text-slate-500 text-sm">
                                                    Add 2-4 photos to preview the combo
                                                </div>
                                            ) : (
                                                <div className="w-full h-full grid grid-cols-2 grid-rows-2 gap-3 p-10 opacity-70">
                                                    {/* 2 items: each takes full height in its column */}
                                                    {items.length === 2 && (
                                                        <>
                                                            <div className="relative rounded-xl overflow-hidden border-slate-800 bg-slate-900/30 row-span-2">
                                                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                                                <img src={items[0].absUrl} alt="Item 1" className="absolute inset-0 w-full h-full object-cover" />
                                                            </div>
                                                            <div className="relative rounded-xl overflow-hidden border-slate-800 bg-slate-900/30 row-span-2">
                                                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                                                <img src={items[1].absUrl} alt="Item 2" className="absolute inset-0 w-full h-full object-cover" />
                                                            </div>
                                                        </>
                                                    )}

                                                    {/* 3 items: top two, bottom spans both columns */}
                                                    {items.length === 3 && (
                                                        <>
                                                            <div className="relative rounded-xl overflow-hidden border-slate-800 bg-slate-900/30">
                                                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                                                <img src={items[0].absUrl} alt="Item 1" className="absolute inset-0 w-full h-full object-cover" />
                                                            </div>
                                                            <div className="relative rounded-xl overflow-hidden border-slate-800 bg-slate-900/30">
                                                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                                                <img src={items[1].absUrl} alt="Item 2" className="absolute inset-0 w-full h-full object-cover" />
                                                            </div>
                                                            <div className="relative rounded-xl overflow-hidden border-slate-800 bg-slate-900/30 col-span-2">
                                                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                                                <img src={items[2].absUrl} alt="Item 3" className="absolute inset-0 w-full h-full object-cover" />
                                                            </div>
                                                        </>
                                                    )}

                                                    {/* 4+ items: 2x2 grid (берём первые 4) */}
                                                    {(items.length === 1 || items.length >= 4) && (
                                                        <>
                                                            {(items.length === 1 ? [items[0]] : items.slice(0, 4)).map((it, idx) => (
                                                                <div
                                                                    key={it.id}
                                                                    className={[
                                                                        "relative rounded-xl overflow-hidden border-slate-800 bg-slate-900/30",
                                                                        items.length === 1 ? "col-span-2 row-span-2" : "",
                                                                    ].join(" ")}
                                                                >
                                                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                                                    <img src={it.absUrl} alt={`Item ${idx + 1}`} className="absolute inset-0 w-full h-full object-cover" />
                                                                </div>
                                                            ))}
                                                        </>
                                                    )}
                                                </div>
                                            )}
                                        </div>

                                        {/* Optional label */}
                                        <div className="absolute bottom-3 left-3 text-[11px] text-slate-200/80 px-2 py-1 rounded-md bg-black/35 border border-white/10">
                                            Preview composition (uses style as background)
                                        </div>
                                    </div>
                                )}


                                {phase === "loading" && (
                                    <div className="absolute inset-0 bg-slate-950/70 flex items-center justify-center">
                                        <div className="flex flex-col items-center gap-3">
                                            <Spinner size={72} thickness={7} />
                                            <div className="text-xs text-sky-100/70">Generating…</div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>



                        {/* Right: controls */}
                        <div className="h-full flex flex-col min-h-0">

                            {/* Combo controls (behavior-style UI) */}
                            <div className="mb-3 space-y-3 rounded-2xl border border-slate-800 bg-slate-950/50 p-3">

                                {/* Layout */}
                                <div className="space-y-2">
                                    <div className="text-[14px] text-slate-400 px-1">Layout</div>

                                    <div className="grid grid-cols-2 gap-2">

                                        <RadioRow
                                            label="Auto"
                                            value="AUTO"
                                            current={layout}
                                            onChange={(v) => setLayout(v as ComboLayout)}
                                            desc="AI chooses best layout"
                                        />

                                        <RadioRow
                                            label="Hero + sides"
                                            value="HERO_SIDES"
                                            current={layout}
                                            onChange={(v) => setLayout(v as ComboLayout)}
                                            desc="Main item + support"
                                        />

                                        <RadioRow
                                            label="Row"
                                            value="ROW"
                                            current={layout}
                                            onChange={(v) => setLayout(v as ComboLayout)}
                                            desc="Items in one row"
                                        />

                                        <RadioRow
                                            label="Grid"
                                            value="GRID"
                                            current={layout}
                                            onChange={(v) => setLayout(v as ComboLayout)}
                                            desc="Balanced grid"
                                        />

                                    </div>
                                </div>
                            </div>

                            <div className="mb-3 space-y-3 rounded-2xl border border-slate-800 bg-slate-950/50 p-3">

                                {/* Background strictness */}
                                <div className="space-y-2">
                                    <div className="text-[14px] text-slate-400 px-1">Background strictness</div>

                                    <div className="grid grid-cols-2 gap-2">
                                        <RadioRow
                                            label="Follow style closely"
                                            value="STRICT"
                                            current={bgStrictness}
                                            onChange={(v) => setBgStrictness(v as ComboBgStrictness)}
                                            desc="Stick to reference"
                                        />

                                        <RadioRow
                                            label="Allow creativity"
                                            value="CREATIVE"
                                            current={bgStrictness}
                                            onChange={(v) => setBgStrictness(v as ComboBgStrictness)}
                                            desc="AI can improvise"
                                        />
                                    </div>
                                </div>

                            </div>
                            <div className="mb-3 space-y-3 overflow-auto min-h-0 rounded-2xl border border-slate-800 bg-slate-950/50 p-3">

                                {/* Prompt */}
                                <div className="space-y-2">
                                    <div className="text-[14px] text-slate-400 px-1">Additional details (optional)</div>
                                    <textarea
                                        value={promptDraft}
                                        onChange={(e) => setPromptDraft(e.target.value)}
                                        disabled={phase === "loading" || !hasCreditsForTry}
                                        className="w-full min-h-[70px] rounded-md border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600"
                                        placeholder="e.g. clean table, minimal props, premium lighting…"
                                    />

                                    {!hasCreditsForTry ? (
                                        <div className="text-[12px] text-red-400 rounded-lg border border-red-300/20 bg-red-500/10 px-3 py-2">
                                            Not enough credits.
                                        </div>
                                    ) : null}
                                </div>
                            </div>

                            {/* Actions */}
                            <div className="flex gap-2 mx-2">
                                <button
                                    type="button"
                                    onClick={() => void generatePreview()}
                                    disabled={!canTryAgain}
                                    className={[
                                        "flex-1 rounded-lg px-3 py-3 text-md font-medium inline-flex items-center justify-center gap-2 border",
                                        canTryAgain
                                            ? "border-slate-800 bg-blue-500/50 hover:bg-blue-500/70 text-slate-100"
                                            : "border-slate-800 bg-slate-900/40 text-slate-600 cursor-not-allowed",
                                    ].join(" ")}
                                >
                                    <span className="inline-flex items-center gap-2">
                                        Generate preview
                                        <span className="inline-flex items-center gap-1">
                                            <Flame className={`w-4 h-4 ${accentClass}`} />
                                            <span className={`${accentClass}`}>{formatCredits(previewCost)}</span>
                                        </span>
                                    </span>
                                </button>

                                <button
                                    type="button"
                                    onClick={handleUse}
                                    disabled={!previewUrl || phase === "loading"}
                                    className={[
                                        "flex-1 rounded-lg px-3 py-3 text-md font-medium border",
                                        previewUrl && phase !== "loading"
                                            ? "border-emerald-400/30 bg-emerald-500/40 hover:bg-emerald-500/60 text-white"
                                            : "border-slate-800 bg-slate-900/40 text-slate-600 cursor-not-allowed",
                                    ].join(" ")}
                                >
                                    Use this image
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </Portal >
    );
}
