"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "../../lib/apiClient";
import { useAuth } from "../../context/AuthContext";

type CapabilitiesDto = {
    role?: "USER" | "SUPERADMIN";
    plan: "FREE" | "EDITOR" | "PRO" | "PRO_PLUS";
    export: { maxPx: number; watermark: boolean };
};

export type Capabilities = CapabilitiesDto & {
    // derived flags
    isFree: boolean;
    isEditor: boolean;
    isPro: boolean;
    canUseAI: boolean;
    canExport2K: boolean;
    canExport4K: boolean;
    canRemoveWatermark: boolean;
};

export function useCapabilities() {
    const { user } = useAuth();
    const authed = !!user;

    const [capRaw, setCapRaw] = useState<CapabilitiesDto | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const reload = useCallback(async () => {
        if (!authed) {
            setCapRaw(null);
            return;
        }
        setLoading(true);
        setError(null);
        try {
            const cap = await apiFetch<CapabilitiesDto>("/ai/me/capabilities");
            setCapRaw(cap);
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : "Failed to load capabilities");
        } finally {
            setLoading(false);
        }
    }, [authed]);

    useEffect(() => {
        void reload();
    }, [reload]);

    const fullName = user?.fullName?.trim();
    const userLabel = fullName || user?.email || "User";
    const isSuperAdmin = user?.role === "SUPERADMIN";
    const plan = capRaw?.plan ?? "FREE"; // безопасный дефолт

    const cap: Capabilities = useMemo(() => {
        const isFree = plan === "FREE";
        const isEditor = plan === "EDITOR";
        const isPro = plan === "PRO";
        const isProPlus = plan === "PRO_PLUS";

        // твоя продуктовая логика v1.5:
        // Editor-only: без AI
        // Pro: AI + 4K + no watermark
        return {
            userLabel,
            plan,
            export: capRaw?.export ?? { maxPx: 1920, watermark: true },

            isFree,
            isEditor,
            isPro,
            isProPlus,

            canUseAI: isPro || isProPlus || isSuperAdmin,
            canExport2K: isEditor || isPro || isProPlus || isSuperAdmin,
            canExport4K: isPro || isProPlus || isSuperAdmin,
            canRemoveWatermark: (isEditor || isPro || isProPlus || isSuperAdmin) && !(capRaw?.export?.watermark ?? true),
        };
    }, [capRaw, userLabel, plan, isSuperAdmin]);

    return {
        cap,
        capRaw,
        loading,
        error,
        reload,
        isSuperAdmin,
        userLabel
    };
}
