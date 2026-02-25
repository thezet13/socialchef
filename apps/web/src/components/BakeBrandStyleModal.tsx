"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Portal } from "../lib/portal";
import { X, Flame } from "lucide-react";
import type { BakeBehavior } from "./bakeBrandStyle.behavior";
import { getActionCostCredits, formatCredits } from "@socialchef/shared";
import { useAuth } from "../context/AuthContext";

import type {
    OverlayTextItem,
    OverlayPicItem,
    OverlayRectItem
} from "../features/editor/editor.types";

// подстрой под свой apiFetch, если у тебя он в другом месте
import { apiFetch } from "../lib/apiClient";
import { getFormatById, PostFormatId } from "../features/formats/postFormats";
import { Spinner } from "./Spinner";

type OverlaySnapshot = {
    texts: OverlayTextItem[];
    pics: OverlayPicItem[];
    rects: OverlayRectItem[];
};

type BakePreviewResponse = {
    mode: "preview";
    proDesignId: string;
    previewImageUrl: string;
    aiSize?: { w: number; h: number };
    outputWidth: number;
    outputHeight: number;
    creditsBalance?: number;
};

type BakeCommitResponse = {
    mode: "commit";
    proDesignId: string;
    baseImageUrl: string;
};

type Props = {
    open: boolean;
    onClose: () => void;
    formatId: PostFormatId;

    apiBase: string;
    proDesignId: string | null;

    baseImageUrl?: string | null;

    // выбранный бренд-стиль (картинка-референс)
    styleRefImageUrl: string | null;

    // snapshot слоёв на момент открытия модалки
    overlaySnapshot: OverlaySnapshot;

    baseWidth: number;
    baseHeight: number;
    outputWidth: number;
    outputHeight: number;

    // paywall (как у тебя в StylePreviewModal)
    plan?: "FREE" | "EDITOR" | "PRO" | "PRO_PLUS";
    creditsBalance?: number;
    onPaywall?: (payload: unknown) => void;

    // когда пользователь нажал "Use this result" — ты коммитишь в редакторе
    onCommittedToEditor: (args: { baseImageUrl: string }) => void;
};

function RadioRow<T extends string>(props: {
    label: string;
    value: T;
    current: T;
    onChange: (v: T) => void;
    desc?: string;

    className?: string;
}) {
    const { label, value, current, onChange, desc, className } = props;
    const checked = current === value;



    return (
        <button
            type="button"
            onClick={() => onChange(value)}
            className={[
                "h-full border text-left px-3 py-2 transition w-full",
                checked
                    ? "border-blue-500/20 text-slate-200 bg-blue-500/20"
                    : "border-blue-500/20 text-slate-600 bg-slate-850 hover:bg-blue-500/5",
                className ?? "",
            ].join(" ")}
        >
            <div className="flex gap-2">
                <div className="text-[12px] font-medium">{label}</div>
            </div>
            {desc ? <div className={["mt-1 text-[10px] ", checked ? "text-slate-400" : "text-slate-600"].join("")}>{desc}</div> : null}
        </button>
    );
}

export function BakeBrandStyleModal(props: Props) {
    const {
        open,
        onClose,
        formatId,
        proDesignId,
        baseImageUrl,
        styleRefImageUrl,
        overlaySnapshot,
        baseWidth,
        baseHeight,
        outputWidth,
        outputHeight,
        creditsBalance,
        plan,
        onPaywall,
        onCommittedToEditor,
    } = props;

    const { user, me } = useAuth();
    const authed = !!user;

    const [phase, setPhase] = useState<"idle" | "loading" | "ready" | "error">("idle");
    const [err, setErr] = useState<string | null>(null);

    const [brandControl, setBrandControl] = useState<BakeBehavior["brandControl"]>("BRAND_ACCURATE");
    const [colorLogic, setColorLogic] = useState<BakeBehavior["colorLogic"]>("PALETTE_LOCKED");
    const [shapeStyle, setShapeStyle] = useState<BakeBehavior["shapeStyle"]>("STRUCTURAL");
    const [layoutDiscipline, setLayoutDiscipline] = useState<BakeBehavior["layoutDiscipline"]>("LAYOUT_LOCKED");
    const [typographyEffects, setTypographyEffects] = useState<BakeBehavior["typographyEffects"]>("BRAND_LED");

    const [designNote, setDesignNote] = useState<string>("");

    const formatDef = useMemo(() => getFormatById(formatId), [formatId]);

    const [safeInsetPct] = useState<number>(0.02);

    const noteTrim = useMemo(() => designNote.trim().slice(0, 300), [designNote]);

    const behavior: BakeBehavior = useMemo(
        () => ({
            brandControl,
            colorLogic,
            shapeStyle,
            layoutDiscipline,
            typographyEffects,
            designNote: noteTrim || undefined,
        }),
        [brandControl, colorLogic, shapeStyle, layoutDiscipline, typographyEffects, noteTrim]
    );

    const [previewUrl, setPreviewUrl] = useState<string | null>(null);

    const { setCreditsBalance, refreshMe } = useAuth();

    // credits
    const previewCost = getActionCostCredits("BAKE_BRANDSTYLE");
    const balance = typeof creditsBalance === "number" ? creditsBalance : 0;
    const hasCreditsForPreview = balance >= previewCost;

    const canGenerate = useMemo(() => {
        if (!open) return false;
        if (phase === "loading") return false;
        if (!authed || !proDesignId) return false;
        if (!styleRefImageUrl) return false;
        return true;
    }, [open, phase, authed, proDesignId, styleRefImageUrl]);

    const canTry = useMemo(() => canGenerate && hasCreditsForPreview, [canGenerate, hasCreditsForPreview]);
    const canUse = useMemo(() => !!previewUrl && phase !== "loading", [previewUrl, phase]);
    const accentClass = canTry ? "text-orange-500" : "text-slate-600";


    function handleClose() {
        setPhase("idle");
        setErr(null);
        setPreviewUrl(null);
        onClose();
    }

    async function generatePreview() {
        setErr(null);

        if (!hasCreditsForPreview) {
            onPaywall?.({
                code: "INSUFFICIENT_CREDITS",
                action: "BAKE_BRANDSTYLE",
                requiredCredits: previewCost,
                balanceCredits: balance,
                creditsBalance: balance,
                plan,
            });
            setErr("Not enough credits.");
            setPhase("error");
            return;
        }

        try {
            setPhase("loading");

            if (!authed) throw new Error("Not authorized");
            if (!proDesignId) throw new Error("No ProDesign");
            if (!styleRefImageUrl) throw new Error("Choose a Brand Style first");

            // ✅ Variant A: если shapeStyle NONE — rects не отправляем
            const overlayForBake =
                behavior.shapeStyle === "NONE"
                    ? { texts: overlaySnapshot.texts, pics: overlaySnapshot.pics, rects: [] }
                    : overlaySnapshot;

            const r = await apiFetch<BakePreviewResponse>(`/ai/pro-images/${proDesignId}/bake-gpt15/preview`, {
                method: "POST",
                body: {
                    styleRefImageUrl,
                    overlay: overlayForBake,
                    baseWidth,
                    baseHeight,
                    outputWidth,
                    outputHeight,
                    quality: "low",
                    behavior,
                    safeInsetPct,
                },
            });



            if (typeof r.creditsBalance === "number") {
                setCreditsBalance(r.creditsBalance);
            } else {
                // на всякий случай
                await refreshMe();
            }

            setPreviewUrl(r.previewImageUrl);
            setPhase("ready");
        } catch (e: unknown) {
            setErr(e instanceof Error ? e.message : "Preview failed");
            setPhase("error");
        }
    }

    async function commitPreview() {
        setErr(null);

        try {
            setPhase("loading");

            if (!authed) throw new Error("Not authorized");
            if (!proDesignId) throw new Error("No ProDesign");
            if (!previewUrl) throw new Error("No preview yet");

            // ✅ 1) Upscale preview to 2K (2048 max side)
            const up = await apiFetch<{ imageUrl: string }>(`/ai/images/upscale`, {
                method: "POST",
                body: {
                    sourceImageUrl: previewUrl,
                    targetMaxSide: 2048,
                },
            });

            const upscaledUrl = up.imageUrl;

            // ✅ 2) Commit already-upscaled image
            const r = await apiFetch<BakeCommitResponse>(`/ai/pro-images/${proDesignId}/bake-gpt15/commit`, {
                method: "POST",
                body: { previewImageUrl: upscaledUrl },
            });

            onCommittedToEditor({ baseImageUrl: r.baseImageUrl });

            // чистим модалку
            setPhase("idle");
            setErr(null);
            setPreviewUrl(null);
            onClose();
        } catch (e: unknown) {
            setErr(e instanceof Error ? e.message : "Commit failed");
            setPhase("error");
        }
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

    return (
        <Portal>
            <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 backdrop-blur-md">
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
                            Preview
                        </div>

                        <div className="flex justify-between gap-10 items-start">
                            <div className="flex mt-1 mb-0 text-md text-slate-400 gap-1">
                                <Flame size="20" className="text-orange-500" /> {" "}
                                <span className={hasCreditsForPreview ? "text-orange-500" : "text-red-400"}>
                                    {formatCredits(balance)}
                                </span>{" "}
                            </div>
                            <button
                                type="button"
                                onClick={handleClose}
                                className="text-slate-400 hover:text-slate-200 text-sm px-2 py-1 rounded-md border border-slate-800 bg-slate-900"
                            >
                                <X className="h-4 w-4" />
                            </button></div>
                    </div>

                    {/* body */}
                    <div className="p-5 grid grid-cols-2 gap-5 overflow-y-auto scrollbar-thin-custom justify-center">
                        {/* LEFT: preview */}
                        <div className="relative justify-center">
                            <div className="mx-auto rounded-2xl max-h-[75vh] border border-slate-800 bg-slate-950 flex items-center relative" style={{
                                aspectRatio: `${formatDef.width} / ${formatDef.height}`,
                            }}>
                                <div className="opacity-30 h-full absolute left-3 top-3 text-[12px]">{formatDef.presetFormat}</div>
                                <div className="relative w-full h-full rounded-xl">
                                    {/* base fallback (what is currently in editor) */}
                                    {!previewUrl && baseImageUrl ? (<>
                                        <div className="h-full w-full inset-0 flex items-center justify-center relative rounded-xl overflow-hidden text-slate-300">Typo style will be applied after generation</div>

                                        <img
                                            src={baseImageUrl}
                                            alt="Base"
                                            className="absolute inset-0 w-full h-full object-contain opacity-55 rounded-xl"
                                        />
                                    </>
                                    ) : null}

                                    {/* generated preview */}
                                    {previewUrl ? (

                                        /* eslint-disable-next-line @next/next/no-img-element */
                                        <img
                                            src={previewUrl}
                                            alt="Bake preview"
                                            className="absolute inset-0 w-full h-full object-contain rounded-2xl"
                                        />
                                    ) : null}



                                    {/* loader overlay */}
                                    {phase === "loading" ? (
                                        <div className="absolute inset-0 flex items-center justify-center bg-slate-950/70">
                                            <div className="text-center">
                                                <Spinner size={96} thickness={8} />
                                                <div className="mt-3 text-xs text-slate-300">Generating…</div>
                                            </div>
                                        </div>
                                    ) : null}

                                    {/* empty state */}
                                    {!previewUrl && !baseImageUrl && phase !== "loading" ? (
                                        <div className="absolute inset-0 flex items-center justify-center text-slate-500">
                                            Upload a photo to preview
                                        </div>
                                    ) : null}
                                </div>

                            </div>
                        </div>
                        {/* RIGHT: options */}
                        <div className="">
                            <div className="grid w-full grid-cols-2 gap-1 space-y-2 space-x-2">
                                {/* LEFT */}
                                {/* Brand Control */}
                                <div className="rounded-2xl px-3 py-2">
                                    <div className="text-[14px] text-slate-400 mb-2 pl-2">Style Control</div>
                                    <div className="flex items-stretch">
                                        <RadioRow
                                            label="Style-Accurate"
                                            value="BRAND_ACCURATE"
                                            current={brandControl}
                                            onChange={setBrandControl}
                                            desc="Most strict: looks like reference."
                                            className="rounded-tl-xl rounded-bl-xl"
                                        />
                                        <RadioRow
                                            label="Style-Guided"
                                            value="CREATIVE_INTERPRETATION"
                                            current={brandControl}
                                            onChange={setBrandControl}
                                            desc="Allows mild adaptation to the photo."
                                            className="rounded-tr-xl rounded-br-xl"
                                        />
                                        {/* <RadioRow
                                                label="Creative Interpretation"
                                                value="CREATIVE_INTERPRETATION"
                                                current={brandControl}
                                                onChange={setBrandControl}
                                                desc="More artistic; higher risk of deviations."
                                            /> */}
                                    </div>
                                </div>

                                {/* Layout */}
                                <div className="rounded-2xl px-3 py-2">
                                    <div className="text-[14px] text-slate-400 mb-2 pl-2">Layout Discipline</div>
                                    <div className="flex items-stretch">
                                        <RadioRow
                                            label="Layout-Locked"
                                            value="LAYOUT_LOCKED"
                                            current={layoutDiscipline}
                                            onChange={setLayoutDiscipline}
                                            desc="Stay inside boxes; scale down if needed."
                                            className="rounded-tl-xl rounded-bl-xl"
                                        />
                                        <RadioRow
                                            label="Layout-Aware"
                                            value="LAYOUT_AWARE"
                                            current={layoutDiscipline}
                                            onChange={setLayoutDiscipline}
                                            desc="Minor adjustments allowed."
                                            className="rounded-tr-xl rounded-br-xl"
                                        />
                                    </div>
                                </div>



                                {/* Color Logic */}
                                <div className="rounded-2xl px-3 py-2">
                                    <div className="text-[14px] text-slate-400 mb-2 pl-2">Color Logic</div>
                                    <div className="flex items-stretch">
                                        <RadioRow
                                            label="Palette-Locked"
                                            value="PALETTE_LOCKED"
                                            current={colorLogic}
                                            onChange={setColorLogic}
                                            desc="Use only common colors from reference"
                                            className="rounded-tl-xl rounded-bl-xl"
                                        />
                                        {/* <RadioRow
                                            label="Palette-Harmonized"
                                            value="PALETTE_HARMONIZED"
                                            current={colorLogic}
                                            onChange={setColorLogic}
                                            desc="Colors from refenrece dominate; may harmonize with photo."
                                        /> */}
                                        <RadioRow
                                            label="Mood-Based"
                                            value="MOOD_BASED"
                                            current={colorLogic}
                                            onChange={setColorLogic}
                                            desc="More freedom with colors; can be vibrant."
                                            className="rounded-tr-xl rounded-br-xl"
                                        />
                                    </div>
                                </div>

                                {/* Shape Style */}
                                <div className="rounded-2xl px-3 py-2">
                                    <div className="text-[14px] text-slate-400 mb-2 pl-2">Shape Style</div>
                                    <div className="flex items-stretch">
                                        <RadioRow
                                            label="Structural"
                                            value="STRUCTURAL"
                                            current={shapeStyle}
                                            onChange={setShapeStyle}
                                            desc="Clean shapes only; some decorative badges."
                                            className="rounded-tl-xl rounded-bl-xl"
                                        />
                                        {/* <RadioRow
                                            label="Brand-Derived"
                                            value="BRAND_DERIVED"
                                            current={shapeStyle}
                                            onChange={setShapeStyle}
                                            desc="Shapes inspired by reference."
                                        /> */}
                                        {/* <RadioRow
                                                label="Expressive"
                                                value="EXPRESSIVE"
                                                current={shapeStyle}
                                                onChange={setShapeStyle}
                                                desc="More decorative shapes; can look playful."
                                            /> */}
                                        <RadioRow
                                            label="No Shapes (clean)"
                                            value="NONE"
                                            current={shapeStyle}
                                            onChange={setShapeStyle}
                                            desc="No badges/plates, frames and lines."
                                            className="rounded-tr-xl rounded-br-xl"
                                        />
                                    </div>
                                </div>

                                {/* Typography Effects */}
                                <div className="rounded-2xl px-3 py-2">
                                    <div className="text-[14px] text-slate-400 mb-2 pl-2">Typography Effects</div>
                                    <div className="flex items-stretch">
                                        <RadioRow
                                            label="Reference style"
                                            value="BRAND_LED"
                                            current={typographyEffects}
                                            onChange={setTypographyEffects}
                                            desc="Typography used is similar to the reference image."
                                            className="rounded-tl-xl rounded-bl-xl"
                                        />
                                        {/* <RadioRow
                                            label="Strict"
                                            value="STRICT"
                                            current={typographyEffects}
                                            onChange={setTypographyEffects}
                                            desc="Always horizontal with no effects."
                                            className="rounded-tr-xl rounded-br-xl"
                                        /> */}
                                        <RadioRow
                                            label="Dynamic"
                                            value="DYNAMIC"
                                            current={typographyEffects}
                                            onChange={setTypographyEffects}
                                            desc="Additional effects for more impactful look."
                                            className="rounded-tr-xl rounded-br-xl"
                                        />
                                    </div>
                                </div>

                                {/* safe inset */}
                                {/* <div className="rounded-2xl border border-slate-800 bg-slate-950/50 px-2 pb-2 mr-2">
                                        <div className="flex items-center justify-between m-2">
                                            <div className="text-[14px] text-slate-400 font-semibold">Safe Area</div>
                                            <div className="text-xs text-slate-400">{Math.round(safeInsetPct * 100)}%</div>
                                        </div>
                                        <div className="mt-2 flex gap-2">
                                            <button
                                                type="button"
                                                onClick={() => setSafeInsetPct(0)}
                                                className={[
                                                    "rounded-xl px-3 py-1 text-xs border",
                                                    safeInsetPct === 0
                                                        ? "border-blue-600 bg-blue-500/10 text-blue-200"
                                                        : "border-slate-800 bg-slate-950/40 text-slate-300 hover:bg-slate-950/70",
                                                ].join(" ")}
                                            >
                                                0%
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setSafeInsetPct(0.02)}
                                                className={[
                                                    "rounded-xl px-3 py-1 text-xs border",
                                                    safeInsetPct === 0.02
                                                        ? "border-blue-600 bg-blue-500/10 text-blue-200"
                                                        : "border-slate-800 bg-slate-950/40 text-slate-300 hover:bg-slate-950/70",
                                                ].join(" ")}
                                            >
                                                2%
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setSafeInsetPct(0.04)}
                                                className={[
                                                    "rounded-xl px-3 py-1 text-xs border",
                                                    safeInsetPct === 0.04
                                                        ? "border-blue-600 bg-blue-500/10 text-blue-200"
                                                        : "border-slate-800 bg-slate-950/40 text-slate-300 hover:bg-slate-950/70",
                                                ].join(" ")}
                                            >
                                                4%
                                            </button>
                                        </div>
                                        <div className="m-2 text-[9px] text-slate-500">
                                            Adds an inner frame to keep text away from edges.
                                        </div>
                                    </div> */}



                            </div>



                            {/* Note */}
                            <div className="rounded-2xl border border-slate-800 bg-slate-950/50 px-2 mt-5 mb-5 mx-2">
                                <div className="text-[14px] text-slate-400 m-2">Additional details (optional)</div>
                                <textarea
                                    value={designNote}
                                    onChange={(e) => setDesignNote(e.target.value)}
                                    rows={3}
                                    className="w-full rounded-sm border border-slate-800 bg-slate-950/40 px-3 py-2 text-xs text-slate-200 outline-none focus:border-slate-600"
                                    placeholder='e.g. "Minimal, premium, clean spacing. Avoid clutter."'
                                />
                                <div className="m-2 text-[11px] text-slate-500">{noteTrim.length}/300</div>
                            </div>


                            {err ? (
                                <div className="rounded-lg border border-red-900/60 bg-red-950/40 px-3 py-2 text-xs text-red-200">
                                    {err}
                                </div>
                            ) : null}

                            {!styleRefImageUrl ? (
                                <div className="text-[11px] text-amber-300/90">
                                    Choose a Brand Style first (style reference image).
                                </div>
                            ) : null}
                            {/* Buttons */}
                            <div className="flex gap-2 justify-between mx-3 mt-3">



                                <button
                                    type="button"
                                    onClick={generatePreview}
                                    disabled={!canTry}
                                    className={[
                                        "flex-1 rounded-lg px-3 py-2 text-md  inline-flex items-center justify-center gap-1",
                                        canTry
                                            ? "bg-blue-500/50 hover:bg-blue-500/70 border border-slate-700 text-slate-100"
                                            : "bg-slate-900 text-slate-600 border border-slate-800 cursor-not-allowed"
                                    ].join(" ")}
                                >
                                    {previewUrl ? "Try again" : "Generate preview"}

                                    <Flame className={`h-4 w-4 ${accentClass}`} />
                                    <span className={accentClass}>
                                        {formatCredits(previewCost)}
                                    </span>

                                </button>
                                <button
                                    type="button"
                                    onClick={handleClose}
                                    className="flex-1 rounded-lg px-3 py-2 text-md border border-slate-800 bg-slate-950/40 text-slate-200 hover:bg-slate-950/20"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="button"
                                    onClick={commitPreview}
                                    disabled={!canUse}
                                    className={[
                                        "flex-1 rounded-md px-3 py-2 text-md ",
                                        canUse
                                            ? "bg-emerald-500/50 hover:bg-emerald-500/70 text-white"
                                            : "bg-slate-900 border-slate-800 border text-slate-600 cursor-not-allowed",
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
