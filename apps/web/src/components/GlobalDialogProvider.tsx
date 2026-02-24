"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

type DialogVariant = "info" | "success" | "warning" | "error";

type DialogButton = {
    label: string;
    value: "ok" | "cancel";
    autoFocus?: boolean;
    tone?: "primary" | "danger" | "neutral";
};

type DialogOptions = {
    variant?: DialogVariant;
    title?: string;
    message: string;
    details?: string; // optional small text
    okText?: string;
    cancelText?: string;
    showCancel?: boolean;
    closeOnBackdrop?: boolean;
    closeOnEsc?: boolean;
};

type DialogApi = {
    alert: (message: string, opts?: Omit<DialogOptions, "message" | "showCancel">) => Promise<void>;
    confirm: (message: string, opts?: Omit<DialogOptions, "message">) => Promise<boolean>;
    show: (opts: DialogOptions) => Promise<"ok" | "cancel">;
};

const DialogContext = createContext<DialogApi | null>(null);

type InternalState = {
    open: boolean;
    variant: DialogVariant;
    title?: string;
    message: string;
    details?: string;
    buttons: DialogButton[];
    closeOnBackdrop: boolean;
    closeOnEsc: boolean;
    resolve?: (v: "ok" | "cancel") => void;
};

function defaultTitle(variant: DialogVariant) {
    if (variant === "error") return "Error";
    if (variant === "warning") return "Warning";
    if (variant === "success") return "Done";
    return "Info";
}

function variantStyles(variant: DialogVariant) {
    // you can tweak colors here once for whole project
    if (variant === "error") return { badge: "bg-red-500/15 text-red-300 border-red-500/30" };
    if (variant === "warning") return { badge: "bg-amber-500/15 text-amber-200 border-amber-500/30" };
    if (variant === "success") return { badge: "bg-emerald-500/15 text-emerald-200 border-emerald-500/30" };
    return { badge: "bg-sky-500/15 text-sky-200 border-sky-500/30" };
}

export function useGlobalDialog(): DialogApi {
    const ctx = useContext(DialogContext);
    if (!ctx) throw new Error("useGlobalDialog must be used within GlobalDialogProvider");
    return ctx;
}

export function GlobalDialogProvider({ children }: { children: React.ReactNode }) {
    const [mounted, setMounted] = useState(false);

    const lastActiveElRef = useRef<HTMLElement | null>(null);
    const okBtnRef = useRef<HTMLButtonElement | null>(null);

    const [st, setSt] = useState<InternalState>({
        open: false,
        variant: "info",
        title: "Info",
        message: "",
        buttons: [{ label: "OK", value: "ok", autoFocus: true, tone: "primary" }],
        closeOnBackdrop: true,
        closeOnEsc: true,
    });

    useEffect(() => {
        requestAnimationFrame(() => setMounted(true));
    }, []);

    const close = useCallback((v: "ok" | "cancel") => {
        setSt((prev) => {
            prev.resolve?.(v);
            return { ...prev, open: false, resolve: undefined };
        });

        // restore focus
        queueMicrotask(() => {
            lastActiveElRef.current?.focus?.();
            lastActiveElRef.current = null;
        });
    }, []);

    const show = useCallback((opts: DialogOptions) => {
        return new Promise<"ok" | "cancel">((resolve) => {
            lastActiveElRef.current = (document.activeElement as HTMLElement) ?? null;

            const variant: DialogVariant = opts.variant ?? "info";
            const title = opts.title ?? defaultTitle(variant);

            const showCancel = opts.showCancel ?? false;

            const okLabel = opts.okText ?? "OK";
            const cancelLabel = opts.cancelText ?? "Cancel";

            const buttons: DialogButton[] = showCancel
                ? [
                    { label: cancelLabel, value: "cancel", tone: "neutral" },
                    { label: okLabel, value: "ok", autoFocus: true, tone: variant === "error" ? "danger" : "primary" },
                ]
                : [{ label: okLabel, value: "ok", autoFocus: true, tone: variant === "error" ? "danger" : "primary" }];

            setSt({
                open: true,
                variant,
                title,
                message: opts.message,
                details: opts.details,
                buttons,
                closeOnBackdrop: opts.closeOnBackdrop ?? true,
                closeOnEsc: opts.closeOnEsc ?? true,
                resolve,
            });

            // focus ok after render
            queueMicrotask(() => okBtnRef.current?.focus());
        });
    }, []);

    const api = useMemo<DialogApi>(
        () => ({
            show,
            alert: async (message, opts) => {
                await show({ ...opts, message, showCancel: false });
            },
            confirm: async (message, opts) => {
                const res = await show({ ...opts, message, showCancel: true });
                return res === "ok";
            },
        }),
        [show]
    );

    // ESC handling
    useEffect(() => {
        if (!st.open || !st.closeOnEsc) return;

        const keydownOptions: AddEventListenerOptions = { capture: true };

        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                e.preventDefault();
                close("cancel");
            }
        };

        window.addEventListener("keydown", onKeyDown, keydownOptions);

        return () => {
            window.removeEventListener("keydown", onKeyDown, keydownOptions);
        };
    }, [st.open, st.closeOnEsc, close]);


    // prevent body scroll while open
    useEffect(() => {
        if (!st.open) return;
        const prev = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        return () => {
            document.body.style.overflow = prev;
        };
    }, [st.open]);

    const overlay = mounted
        ? createPortal(
            st.open ? (
                <div
                    className="fixed inset-0 z-[99999] flex items-center justify-center"
                    aria-hidden={false}
                >
                    {/* backdrop */}
                    <div
                        className="absolute inset-0 bg-black/70"
                        onMouseDown={() => {
                            if (st.closeOnBackdrop) close("cancel");
                        }}
                    />

                    {/* dialog */}
                    <div
                        id="global-dialog-root"
                        role="dialog"
                        aria-modal="true"
                        aria-label={st.title ?? "Dialog"} 
                        className="relative w-[min(560px,calc(100%-24px))] rounded-2xl border border-slate-800 bg-slate-950 shadow-2xl"
                        onMouseDown={(e) => e.stopPropagation()}
                    > 
                        <div className="p-4 sm:p-5">
                            <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                    <div className="flex items-center gap-2">
                                        {/* <span
                                            className={[
                                                "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px]",
                                                variantStyles(st.variant).badge,
                                            ].join(" ")}
                                        >
                                            {st.variant.toUpperCase()}
                                        </span> */}
                                        <h2 className="text-base font-semibold text-slate-200 truncate">{st.title}</h2>
                                    </div>

                                    <p className="mt-3 text-sm leading-6 text-slate-400 whitespace-pre-wrap">{st.message}</p>

                                    {st.details ? (
                                        <p className="mt-3 text-xs text-slate-400 whitespace-pre-wrap">{st.details}</p>
                                    ) : null}
                                </div>

                                {/* close X */}
                                {/* <button
                                    type="button"
                                    className="shrink-0 rounded-lg border border-slate-800 bg-slate-900 px-2 py-1 text-slate-300 hover:bg-slate-800"
                                    onClick={() => close("cancel")}
                                    aria-label="Close"
                                >
                                    ✕
                                </button> */}
                            </div>

                            <div className="mt-5 flex items-center justify-end gap-2">
                                {st.buttons.map((b) => {
                                    const base =
                                        "rounded-md px-4 py-2 text-sm border transition inline-flex items-center justify-center";
                                    const tone =
                                        b.tone === "danger"
                                            ? "bg-red-500/20 border-red-500/40 text-red-100 hover:bg-red-500/30"
                                            : b.tone === "primary"
                                                ? "bg-blue-500/25 border-blue-500/40 text-blue-100 hover:bg-blue-500/35"
                                                : "bg-slate-900 border-slate-800 text-slate-200 hover:bg-slate-800";

                                    const refProps = b.value === "ok" ? { ref: okBtnRef } : {};

                                    return (
                                        <button
                                            key={b.value}
                                            type="button"
                                            {...refProps}
                                            className={[base, tone].join(" ")}
                                            onClick={() => close(b.value)}
                                        >
                                            {b.label}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                </div>
            ) : null,
            document.body
        )
        : null;

    return (
        <DialogContext.Provider value={api}>
            {children}
            {overlay}
        </DialogContext.Provider>
    );
}
