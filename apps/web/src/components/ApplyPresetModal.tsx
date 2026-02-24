"use client";

import React from "react";
// ✅ Поставь правильный путь к твоему Portal
import { Portal } from "@/lib/portal";

export type OverlayMode = "REPLACE" | "MERGE";
export type ImageMode = "KEEP" | "REPLACE";

export type ApplyPresetChoice = {
    overlayMode: OverlayMode;
    imageMode: ImageMode;
};

export type ApplyPresetModalProps = {
    open: boolean;
    onClose: () => void;
    onConfirm: (choice: ApplyPresetChoice) => void;

    // computed outside (flow)
    showImageSection: boolean;
    defaultOverlayMode: OverlayMode;
    defaultImageMode: ImageMode;

    currentCounts: { texts: number; pics: number; rects: number };
    presetCounts: { texts: number; pics: number; rects: number };

    currentImageUrl?: string | null;
    presetImageUrl?: string | null;
};

function countsLabel(c: { texts: number; pics: number; rects: number }) {
    const parts: string[] = [];
    if (c.texts) parts.push(`${c.texts} text`);
    if (c.pics) parts.push(`${c.pics} pic`);
    if (c.rects) parts.push(`${c.rects} shape`);
    return parts.length ? parts.join(", ") : "empty";
}

function XIcon(props: { className?: string }) {
    return (
        <svg viewBox="0 0 24 24" fill="none" className={props.className ?? ""} aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
    );
}

export function ApplyPresetModal(props: ApplyPresetModalProps) {
    const {
        open,
        onClose,
        onConfirm,
        showImageSection,
        defaultOverlayMode,
        defaultImageMode,
        currentCounts,
        presetCounts,
        currentImageUrl,
        presetImageUrl,
    } = props;

    const [overlayMode, setOverlayMode] = React.useState<OverlayMode>(defaultOverlayMode);
    const [imageMode, setImageMode] = React.useState<ImageMode>(defaultImageMode);



    React.useEffect(() => {
        if (!open) return;
        setOverlayMode(defaultOverlayMode);
        setImageMode(defaultImageMode);
    }, [open, defaultOverlayMode, defaultImageMode]);

    React.useEffect(() => {
        if (!open) return;

        // lock scroll
        const prevOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";

        // esc to close
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        };
        window.addEventListener("keydown", onKeyDown);

        return () => {
            document.body.style.overflow = prevOverflow;
            window.removeEventListener("keydown", onKeyDown);
        };
    }, [open, onClose]);

    if (!open) return null;

    return (
        <Portal>
            {/* ✅ one top-level overlay like your example */}
            <div
                className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md"
                onClick={onClose} // click outside closes
                role="dialog"
                aria-modal="true"
            >
                {/* dialog itself - stop propagation so inside clicks don't close */}
                <div
                    className="relative w-[min(560px,92vw)] rounded-2xl border border-slate-700 bg-slate-950 shadow-xl"
                    onClick={(e) => e.stopPropagation()}
                >
                    {/* Header */}
                    <div className="px-5 py-4 border-b border-slate-800 relative">
                        <div className="text-slate-100 text-lg">Apply template</div>
                        <div className="text-xs text-slate-400 mt-1">
                            Choose what to replace. You can keep your current content.
                        </div>

                        {/* X button */}
                        <button
                            type="button"
                            onClick={onClose}
                            className="absolute right-3 top-3 rounded-lg p-2 border border-slate-800 text-slate-200 hover:bg-slate-800"
                            aria-label="Close"
                        >
                            <XIcon className="h-4 w-4" />
                        </button>
                    </div>

                    {/* Image section */}
                    {showImageSection && (
                        <div className="px-5 py-4 border-b border-slate-800">
                            {/* <div className="text-sm text-slate-200 font-medium">Image</div>
                            <div className="text-xs text-slate-400 mt-1">
                                Click the image you want to use.
                            </div> */}

                            <div className="mt-1 grid grid-cols-1 sm:grid-cols-2 gap-3">
                                {/* KEEP = current */}
                                <button
                                    type="button"
                                    onClick={() => setImageMode("KEEP")}
                                    className={[
                                        "text-left rounded-xl border p-3",
                                        "bg-slate-900/50 hover:bg-slate-900",
                                        imageMode === "KEEP" ? "border-blue-500/70 ring-2 ring-blue-500/40" : "border-slate-800",
                                    ].join(" ")}
                                >
                                    <div className="text-md text-slate-200 p-1">Keep my image</div>

                                    <div className="mt-2 rounded-lg border border-slate-800 overflow-hidden bg-slate-950">
                                        {currentImageUrl ? (
                                            // eslint-disable-next-line @next/next/no-img-element
                                            <img
                                                src={currentImageUrl}
                                                alt="Current image"
                                                className="w-full h-36 object-cover"
                                                draggable={false}
                                            />
                                        ) : (
                                            <div className="w-full h-36 flex items-center justify-center text-xs text-slate-500">
                                                No current image
                                            </div>
                                        )}
                                    </div>
                                </button>

                                {/* REPLACE = preset */}
                                <button
                                    type="button"
                                    onClick={() => setImageMode("REPLACE")}
                                    className={[
                                        "text-left rounded-xl border p-3",
                                        "bg-slate-900/50 hover:bg-slate-900",
                                        imageMode === "REPLACE" ? "border-blue-500/70 ring-2 ring-blue-500/40" : "border-slate-800",
                                    ].join(" ")}
                                >
                                    <div className="text-md text-slate-200 p-1">Use template image</div>

                                    <div className="mt-2 rounded-lg border border-slate-800 overflow-hidden bg-slate-950">
                                        {presetImageUrl ? (
                                            // eslint-disable-next-line @next/next/no-img-element
                                            <img
                                                src={presetImageUrl}
                                                alt="Preset image"
                                                className="w-full h-36 object-cover"
                                                draggable={false}
                                            />
                                        ) : (
                                            <div className="w-full h-36 flex items-center justify-center text-xs text-slate-500">
                                                Preset has no image
                                            </div>
                                        )}
                                    </div>
                                </button>
                            </div>

                            {/* <div className="mt-2 text-[11px] text-slate-500">
                                Selected:{" "}
                                <span className="text-slate-300">
                                    {imageMode === "KEEP" ? "Current image" : "Preset image"}
                                </span>
                            </div> */}
                        </div>
                    )}


                    {/* Overlay section */}
                    <div className="px-5 py-2">
                        {/* <div className="text-sm text-slate-200 font-medium">Overlay</div>
                        <div className="text-xs text-slate-400 mt-1">
                            Current: <span className="text-slate-300">{countsLabel(currentCounts)}</span> • Template:{" "}
                            <span className="text-slate-300">{countsLabel(presetCounts)}</span>
                        </div> */}

                        <div className="mt-3 space-y-3">
                            <button
                                type="button"
                                onClick={() => setOverlayMode("REPLACE")}
                                className={[
                                    "w-full text-left rounded-xl border px-4 py-3",
                                    overlayMode === "REPLACE"
                                        ? "border-blue-500/70 bg-blue-500/10"
                                        : "border-slate-800 bg-slate-900/50 hover:bg-slate-900",
                                ].join(" ")}
                            >
                                <div className="text-lgmmd text-slate-100">Replace content</div>
                                <div className="text-[11px] text-slate-400 py-1">
                                    Replace your current texts/shapes/overlay pics with template’s overlay.
                                </div>
                            </button>

                            <button
                                type="button"
                                onClick={() => setOverlayMode("MERGE")}
                                className={[
                                    "w-full text-left rounded-xl border px-4 py-3",
                                    overlayMode === "MERGE"
                                        ? "border-blue-500/70 bg-blue-500/10"
                                        : "border-slate-800 bg-slate-900/50 hover:bg-slate-900",
                                ].join(" ")}
                            >
                                <div className="text-md text-slate-100">Merge content</div>
                                <div className="text-[11px] text-slate-400 py-1">
                                    Keep your overlay and add preset overlay on top.
                                </div>
                                
                            </button>
                        </div>
                    </div>


                    {/* Footer */}
                    <div className="px-5 pt-3 pb-5 border-slate-800 flex items-center justify-end gap-2">
                        <button
                            type="button"
                            onClick={onClose}
                            className="rounded-lg px-3 py-2 text-sm border border-slate-800 bg-slate-950 text-slate-200 hover:bg-slate-900"
                        >
                            Cancel
                        </button>

                        <button
                            type="button"
                            onClick={() => onConfirm({ overlayMode, imageMode })}
                            className="rounded-lg px-3 py-2 text-sm border-slate-700 bg-blue-500/60 hover:bg-blue-500/80 text-slate-100"
                        >
                            Apply
                        </button>
                    </div>
                </div>
            </div>
        </Portal>
    );
}


// "use client";

// import React from "react";

// export type OverlayMode = "REPLACE" | "MERGE";
// export type ImageMode = "KEEP" | "REPLACE";

// export type ApplyPresetChoice = {
//   overlayMode: OverlayMode;
//   imageMode: ImageMode;
// };

// type Props = {
//   open: boolean;
//   title?: string;

//   // показывать секцию Image только если есть конфликт (есть текущее изображение и есть preset image)
//   showImageSection: boolean;

//   // дефолты (умные)
//   defaultOverlayMode: OverlayMode;
//   defaultImageMode: ImageMode;

//   // инфо для UX (не обязательно)
//   currentOverlayCount?: { texts: number; pics: number; rects: number };
//   presetOverlayCount?: { texts: number; pics: number; rects: number };

//   onCancel: () => void;
//   onApply: (choice: ApplyPresetChoice) => void;
// };

// function countLabel(c?: { texts: number; pics: number; rects: number }) {
//   if (!c) return "";
//   const parts: string[] = [];
//   if (c.texts) parts.push(`${c.texts} text`);
//   if (c.pics) parts.push(`${c.pics} pic`);
//   if (c.rects) parts.push(`${c.rects} shape`);
//   return parts.length ? parts.join(", ") : "empty";
// }

// export function ApplyPresetModal(props: Props) {
//   const {
//     open,
//     title = "Apply preset",
//     showImageSection,
//     defaultOverlayMode,
//     defaultImageMode,
//     currentOverlayCount,
//     presetOverlayCount,
//     onCancel,
//     onApply,
//   } = props;

//   const [overlayMode, setOverlayMode] = React.useState<OverlayMode>(defaultOverlayMode);
//   const [imageMode, setImageMode] = React.useState<ImageMode>(defaultImageMode);

//   React.useEffect(() => {
//     if (!open) return;
//     setOverlayMode(defaultOverlayMode);
//     setImageMode(defaultImageMode);
//   }, [open, defaultOverlayMode, defaultImageMode]);

//   if (!open) return null;

//   return (
//     <div className="fixed inset-0 z-[1000] flex items-center justify-center">
//       <div className="absolute inset-0 bg-black/60" onClick={onCancel} />

//       <div className="relative w-[min(520px,92vw)] rounded-2xl border border-slate-700 bg-slate-950 shadow-xl">
//         <div className="px-5 py-4 border-b border-slate-800">
//           <div className="text-slate-100 font-semibold">{title}</div>
//           <div className="text-xs text-slate-400 mt-1">
//             Choose what to replace. You can keep your current content.
//           </div>
//         </div>

//         {/* Overlay section */}
//         <div className="px-5 py-4">
//           <div className="text-sm text-slate-200 font-medium">Overlay</div>
//           <div className="text-xs text-slate-400 mt-1">
//             Current: <span className="text-slate-300">{countLabel(currentOverlayCount)}</span>{" "}
//             • Preset: <span className="text-slate-300">{countLabel(presetOverlayCount)}</span>
//           </div>

//           <div className="mt-3 space-y-2">
//             <label className="flex items-start gap-2 cursor-pointer">
//               <input
//                 type="radio"
//                 name="overlayMode"
//                 checked={overlayMode === "REPLACE"}
//                 onChange={() => setOverlayMode("REPLACE")}
//                 className="mt-1"
//               />
//               <div>
//                 <div className="text-sm text-slate-100">Replace overlay</div>
//                 <div className="text-xs text-slate-400">
//                   Replaces your current texts/shapes/overlay pics with preset’s overlay.
//                 </div>
//               </div>
//             </label>

//             <label className="flex items-start gap-2 cursor-pointer">
//               <input
//                 type="radio"
//                 name="overlayMode"
//                 checked={overlayMode === "MERGE"}
//                 onChange={() => setOverlayMode("MERGE")}
//                 className="mt-1"
//               />
//               <div>
//                 <div className="text-sm text-slate-100">Merge (keep mine + add preset)</div>
//                 <div className="text-xs text-slate-400">
//                   Keeps your current overlay and adds preset overlay on top.
//                 </div>
//               </div>
//             </label>
//           </div>
//         </div>

//         {/* Image section (conditional) */}
//         {showImageSection && (
//           <div className="px-5 py-4 border-t border-slate-800">
//             <div className="text-sm text-slate-200 font-medium">Image</div>
//             <div className="mt-3 space-y-2">
//               <label className="flex items-start gap-2 cursor-pointer">
//                 <input
//                   type="radio"
//                   name="imageMode"
//                   checked={imageMode === "KEEP"}
//                   onChange={() => setImageMode("KEEP")}
//                   className="mt-1"
//                 />
//                 <div>
//                   <div className="text-sm text-slate-100">Keep my image</div>
//                   <div className="text-xs text-slate-400">
//                     Keeps your current base/background image.
//                   </div>
//                 </div>
//               </label>

//               <label className="flex items-start gap-2 cursor-pointer">
//                 <input
//                   type="radio"
//                   name="imageMode"
//                   checked={imageMode === "REPLACE"}
//                   onChange={() => setImageMode("REPLACE")}
//                   className="mt-1"
//                 />
//                 <div>
//                   <div className="text-sm text-slate-100">Use preset image</div>
//                   <div className="text-xs text-slate-400">
//                     Replaces current image with the preset’s image (if preset has one).
//                   </div>
//                 </div>
//               </label>
//             </div>
//           </div>
//         )}

//         <div className="px-5 py-4 border-t border-slate-800 flex items-center justify-end gap-2">
//           <button
//             type="button"
//             onClick={onCancel}
//             className="rounded-lg px-3 py-2 text-sm border border-slate-800 bg-slate-900 text-slate-200 hover:bg-slate-800"
//           >
//             Cancel
//           </button>
//           <button
//             type="button"
//             onClick={() => onApply({ overlayMode, imageMode })}
//             className="rounded-lg px-3 py-2 text-sm border border-slate-700 bg-blue-500/60 hover:bg-blue-500/80 text-slate-100"
//           >
//             Apply
//           </button>
//         </div>
//       </div>
//     </div>
//   );
// }
