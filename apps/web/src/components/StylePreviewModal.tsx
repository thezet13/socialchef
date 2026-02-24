"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { restyleWithGpt15 } from "@/lib/restyleWithGpt15";
import { getFormatById, PostFormatId } from "@/features/formats/postFormats";
import { Portal } from "@/lib/portal";
import { getActionCostCredits, formatCredits } from "@socialchef/shared";
import { Flame, X } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { StyleBehavior } from "./stylePreview.behavior";
import { Spinner } from "./Spinner";
import { apiFetch } from "@/lib/apiClient";

type Props = {
    open: boolean;
    formatId: PostFormatId;
    apiBase: string;
    proDesignId: string | null;
    styleId: string | null;
    initialPrompt?: string;
    isPro: boolean;
    onCommittedToEditor: (args: { mode: "preview" | "final"; imageUrl: string; prompt?: string }) => void;
    onClose: () => void;
    plan?: "FREE" | "EDITOR" | "PRO" | "PRO_PLUS";
    creditsBalance?: number;
    onPaywall?: (payload: unknown) => void;

    baseImageUrl?: string | null;
    styleRefUrl?: string | null;
};

export function StylePreviewModal(props: Props) {
    const {
        open,
        onClose,
        apiBase,
        proDesignId,
        styleId,
        initialPrompt,
        onCommittedToEditor,
        formatId,
        creditsBalance,
        plan
    } = props;

    const { user, me } = useAuth();
    const authed = !!user;

    const [phase, setPhase] = useState<"idle" | "loading" | "ready" | "error">("idle");

    const [err, setErr] = useState<string | null>(null);

    const formatDef = useMemo(() => getFormatById(formatId), [formatId]);

    //const didAutoRunRef = useRef(false);

    const [promptDraft, setPromptDraft] = useState<string>(initialPrompt ?? "");
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);

    const { baseImageUrl, styleRefUrl } = props;

    const [behavior, setBehavior] = useState<StyleBehavior>({
        dishPlacement: "USE_STYLE_CONTAINER",
        styleStrength: "STRONG",
        propsDetails: "INSPIRED_BY_STYLE",
    });

    const previewTryCost = getActionCostCredits("RESTYLE_PREVIEW"); // 2
    const balance = creditsBalance ?? 0;
    const hasCreditsForTry = balance >= previewTryCost;

    const { setCreditsBalance } = useAuth();



    const canTryAgain = useMemo(() => {
        if (!open) return false;
        if (!authed || !proDesignId || !styleId) return false;
        if (phase === "loading") return false;
        return hasCreditsForTry;
    }, [open, authed, proDesignId, styleId, phase, hasCreditsForTry]);

    const accentClass = canTryAgain ? "text-orange-500" : "text-slate-600";


    const canEditPrompt = useMemo(() => {
        if (!open) return false;
        if (phase === "loading") return false;
        return hasCreditsForTry; // как ты сказал: если кредиты кончились — промпт неактивен
    }, [open, phase, hasCreditsForTry]);


    async function generatePreview() {
        setErr(null);

        // если вдруг вызвали не через кнопку (auto-run), но кредитов нет
        if (!hasCreditsForTry) {
            props.onPaywall?.({
                reason: "INSUFFICIENT_CREDITS",
                action: "RESTYLE_PREVIEW",
                cost: previewTryCost,
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
            if (!proDesignId) throw new Error("Upload a photo first");
            if (!styleId) throw new Error("Pick a style first");

            const r = await restyleWithGpt15({
                apiBase,
                proDesignId,
                styleId,
                prompt: promptDraft.trim() || undefined,
                behavior,
                formatId,
                mode: "preview",
                quality: "low",
                width: 512,
                height: 512,
            });

            if (typeof r.creditsBalance === "number") {
                setCreditsBalance(r.creditsBalance);
            }

            if (r.mode !== "preview") throw new Error("Expected preview response");
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

            // 🔥 Всегда 2K
            const maxSide = 2048;

            const up = await apiFetch<{
                imageUrl: string;
            }>("/ai/images/upscale", {
                method: "POST",
                body: {
                    sourceImageUrl: previewUrl,
                    targetMaxSide: maxSide,
                },
            });

            onCommittedToEditor({
                mode: "preview",
                imageUrl: up.imageUrl,
                prompt: promptDraft.trim() || undefined,
            });

            handleClose();
        } catch (e: unknown) {
            setErr(e instanceof Error ? e.message : "Failed to apply image");
            setPhase("error");
        }
    }

    function handleClose() {
        setPhase("idle");
        setErr(null);
        setPreviewUrl(null);
        setPromptDraft(initialPrompt ?? "");
        onClose();
    }

    const ASPECT = formatDef.width / formatDef.height;
    const modalRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        const el = modalRef.current;
        if (!el) return;

        const ro = new ResizeObserver(() => {
            const w = el.offsetWidth;
            const h = Math.round(w / ASPECT);
            el.style.height = `${h}px`;
        });

        ro.observe(el);
        return () => ro.disconnect();
    }, [ASPECT]);

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
                        "relative w-[min(1400px,calc(100vw-2rem))]",
                        "max-h-[calc(100vh-2rem)]",
                        "rounded-2xl border border-slate-800 bg-slate-900 shadow-xl",
                        "overflow-hidden", // важно: скролл будет внутри
                    ].join(" ")}
                >
                    {/* header */}
                    <div className="flex items-start justify-between px-5 py-4 border-b border-slate-800">

                        <div className="text-2xl text-slate-200">
                            Restyle preview
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
                        {/* preview box */}
                        <div style={{
                            aspectRatio: `${formatDef.width} / ${formatDef.height}`,
                        }}
                            className="flex h-full w-full justify-center relative ">

                            <div style={{
                                aspectRatio: `${formatDef.width} / ${formatDef.height}`,
                            }}
                                className="rounded-2xl border max-h-[75vh] border-slate-800 bg-slate-950 flex items-center justify-center relative">
                                <div className="opacity-30 h-full absolute left-3 top-3 text-[12px]">{formatDef.presetFormat}</div>
                                <div
                                    className="relative w-full h-full max-w-full max-h-full"
                                >

                                    {!previewUrl && baseImageUrl ? (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img
                                            src={baseImageUrl}
                                            alt="Base"
                                            className="absolute inset-0 w-full h-full object-contain opacity-95 rounded-2xl"
                                        />
                                    ) : null}

                                    {/* Generated preview on top (when exists) */}
                                    {previewUrl ? (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img src={previewUrl} alt="Preview" className="absolute inset-0 w-full h-full object-contain rounded-2xl" />
                                    ) : null}

                                    {/* Style reference thumbnail */}
                                    {!previewUrl && styleRefUrl ? (
                                        <div className="absolute top-7 left-7 w-[30%] max-w-[220px] aspect-[1/1] rounded-xl border-slate-700 bg-slate-950/70 shadow-lg overflow-hidden">
                                            <div className="absolute left-2 top-2 text-[10px] text-slate-300/70">Style</div>
                                            {/* eslint-disable-next-line @next/next/no-img-element */}
                                            <img src={styleRefUrl} alt="Style reference" className="absolute inset-0 w-full h-full object-cover" />
                                        </div>
                                    ) : null}

                                    {/* Loading overlay stays above everything */}
                                    {phase === "loading" ? (
                                        <div className="absolute inset-0 flex items-center justify-center bg-slate-950/70">
                                            <div className="text-center">
                                                <Spinner size={96} thickness={8} />
                                                <div className="mt-3 text-xs text-slate-300">Generating…</div>
                                            </div>
                                        </div>
                                    ) : null}

                                    {/* If no base yet */}
                                    {!previewUrl && !baseImageUrl && phase !== "loading" ? (
                                        <div className="text-md absolute inset-0 flex items-center justify-center text-slate-500">
                                            Upload a photo to preview
                                        </div>
                                    ) : null}

                                </div>
                            </div>
                        </div>

                        {/* right panel */}
                        <div className="h-full flex flex-col min-h-0">


                            {/* behavior controls */}
                            <div className="mb-3 space-y-2 overflow-auto min-h-0 rounded-2xl border border-slate-800 bg-slate-950/50 p-3">
                                {/* Dish placement */}
                                <div className="space-y-2">
                                    <div className="text-[14px] text-slate-400">Dish placement</div>
                                    <div className="space-x-2 flex">
                                        <RadioRow
                                            label="Use container from style image"
                                            value="USE_STYLE_CONTAINER"
                                            current={(behavior.dishPlacement ?? "AUTO")}
                                            onChange={(v) => setBehavior((p) => ({ ...p, dishPlacement: v }))}
                                            desc="Place the dish into the pan/board/bowl from the style reference."
                                        />

                                        <RadioRow
                                            label="Keep original plate/container"
                                            value="KEEP_ORIGINAL"
                                            current={(behavior.dishPlacement ?? "AUTO")}
                                            onChange={(v) => setBehavior((p) => ({ ...p, dishPlacement: v }))}
                                            desc="Do not move the dish together with the plate into the style scene."
                                        />
                                        <RadioRow
                                            label="Let AI decide"
                                            value="AUTO"
                                            current={(behavior.dishPlacement ?? "AUTO")}
                                            onChange={(v) => setBehavior((p) => ({ ...p, dishPlacement: v }))}
                                            desc="AI chooses the most natural container/surface."
                                        />
                                    </div>
                                </div>


                            </div>

                            <div className="mb-3 space-y-4 overflow-auto min-h-0 rounded-2xl border border-slate-800 bg-slate-950/50 p-4">
                                {/* Style strength */}
                                <div className="space-y-2">
                                    <div className="text-[14px] text-slate-400">Style strength</div>
                                    <div className="space-x-2 flex">
                                        <RadioRow
                                            label="Strong"
                                            value="STRONG"
                                            current={(behavior.styleStrength ?? "BALANCED")}
                                            onChange={(v) => setBehavior((p) => ({ ...p, styleStrength: v }))}
                                            desc="Strongly match style scene (still keep dish recognizable)."
                                        />

                                        <RadioRow
                                            label="Balanced"
                                            value="BALANCED"
                                            current={(behavior.styleStrength ?? "BALANCED")}
                                            onChange={(v) => setBehavior((p) => ({ ...p, styleStrength: v }))}
                                            desc="Good default. Style + realistic structure."
                                        />
                                        <RadioRow
                                            label="Subtle"
                                            value="SUBTLE"
                                            current={(behavior.styleStrength ?? "BALANCED")}
                                            onChange={(v) => setBehavior((p) => ({ ...p, styleStrength: v }))}
                                            desc="Mostly color/lighting mood. Preserve composition."
                                        />

                                    </div>
                                </div>
                            </div>

                            <div className="mb-3 space-y-4 overflow-auto min-h-0 rounded-2xl border border-slate-800 bg-slate-950/50 p-4">

                                {/* Props & details */}
                                <div className="space-y-2">
                                    <div className="text-[14px] text-slate-400">Props & details</div>
                                    <div className="space-x-2 flex">
                                        <RadioRow
                                            label="Inspired by style"
                                            value="INSPIRED_BY_STYLE"
                                            current={(behavior.propsDetails ?? "INSPIRED_BY_STYLE")}
                                            onChange={(v) => setBehavior((p) => ({ ...p, propsDetails: v }))}
                                            desc="Allow tasteful props from the style reference."
                                        />
                                        <RadioRow
                                            label="Minimal"
                                            value="MINIMAL"
                                            current={(behavior.propsDetails ?? "INSPIRED_BY_STYLE")}
                                            onChange={(v) => setBehavior((p) => ({ ...p, propsDetails: v }))}
                                            desc="Clean background, avoid extra objects."
                                        />
                                        <RadioRow
                                            label="Preserve original"
                                            value="PRESERVE_ORIGINAL"
                                            current={(behavior.propsDetails ?? "INSPIRED_BY_STYLE")}
                                            onChange={(v) => setBehavior((p) => ({ ...p, propsDetails: v }))}
                                            desc="Keep original scene elements. Don’t add props."
                                        />

                                    </div>
                                </div>
                            </div>

                            {/* prompt controls */}
                            <div className="space-y-2 overflow-auto min-h-0 rounded-2xl border border-slate-800 bg-slate-950/50 p-3">

                                <label className="text-[14px] text-slate-400">Additional details (optional)</label>
                                <textarea
                                    value={promptDraft}
                                    onChange={(e) => setPromptDraft(e.target.value)}
                                    rows={3}
                                    disabled={!canEditPrompt}
                                    className={[
                                        "w-full rounded-sm border px-3 py-2 mt-2 text-xs outline-none",
                                        canEditPrompt
                                            ? "border-slate-800 bg-slate-950/50 text-slate-200 focus:border-slate-600"
                                            : "border-slate-900 bg-slate-950/20 text-slate-600 cursor-not-allowed",
                                    ].join(" ")}
                                    placeholder='e.g. "brighter light", "less glossy", "clean background", ...'
                                />

                                {!hasCreditsForTry && (
                                    <div className="text-[11px] text-red-500">
                                        Not enough credits to generate a preview.
                                    </div>
                                )}
                            </div>


                            {err && (
                                <div className="rounded-lg border border-red-900/60 bg-red-950/40 px-3 py-2 text-xs text-red-200">
                                    {err}
                                </div>
                            )}
                            <div className="flex gap-2 justify-between mx-3 mt-3">
                                <button
                                    type="button"
                                    onClick={generatePreview}
                                    disabled={!canTryAgain}
                                    className={[
                                        "flex-1  mt-2 mb-2 rounded-lg px-3 py-2 text-md  inline-flex items-center justify-center gap-1",
                                        canTryAgain
                                            ? "bg-blue-500/50 hover:bg-blue-500/70 text-slate-100"
                                            : "bg-slate-900 border-slate-800 text-slate-600 cursor-not-allowed",
                                    ].join(" ")}
                                >

                                    {previewUrl ? (
                                        <>
                                            Try again
                                            <Flame className={`h-4 w-4 ${accentClass}`} />
                                            <span className={accentClass}>
                                                {formatCredits(previewTryCost)}
                                            </span>
                                        </>
                                    ) : (
                                        <>
                                            Generate preview
                                            <Flame className={`h-4 w-4 ${accentClass}`} />
                                            <span className={accentClass}>
                                                {formatCredits(previewTryCost)}
                                            </span>
                                        </>
                                    )}
                                </button>
                                <button
                                    type="button"
                                    onClick={handleClose}
                                    className="mt-2 mb-2 flex-1 rounded-lg px-3 py-2 text-md border border-slate-800 bg-slate-950/40 text-slate-200 hover:bg-slate-950/20"
                                >
                                    Cancel
                                </button>

                                <button
                                    type="button"
                                    onClick={handleUse}
                                    disabled={!previewUrl || phase === "loading"}
                                    className={[
                                        "flex-1 mt-2 mb-2 rounded-lg px-3 py-2 text-md ",
                                        previewUrl && phase !== "loading"
                                            ? "bg-emerald-500/50 hover:bg-emerald-500/70 text-white"
                                            : "bg-slate-900 border border-slate-800 text-slate-600",
                                    ].join(" ")}
                                >
                                    Use this image
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </Portal>
    );
}
