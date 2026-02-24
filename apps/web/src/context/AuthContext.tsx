"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { apiFetch, ApiError } from "../lib/apiClient";
import { UpgradeModal } from "@/components/UpgradeModal";

export type MeDto = {
  user: {
    id: string;
    email: string;
    fullName?: string | null;
    role?: "USER" | "SUPERADMIN";
    authRole?: "USER" | "SUPERADMIN";
  };
  tenant: {
    id: string;
    name: string;
    locale?: string | null;
    plan?: "FREE" | "EDITOR" | "PRO" | "PRO_PLUS";
    creditsBalance?: number;
  } | null;
};

type PaywallPayload = {
  code?: "INSUFFICIENT_CREDITS" | "UPGRADE_REQUIRED";
  action?: string;
  plan?: string;
  requiredPlan?: string;
  reason?: string;
  requiredCredits?: number;
  balanceCredits?: number;
};

interface AuthContextValue {
  me: MeDto | null;
  user: MeDto["user"] | null;
  tenant: MeDto["tenant"] | null;

  setCreditsBalance: (n: number) => void;
  refreshMe: () => Promise<void>;
  loading: boolean;

  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, fullName?: string, restaurantName?: string) => Promise<void>;
  logout: () => Promise<void>;

  openPaywall: (data: unknown) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function setRoleCookie(role: "USER" | "SUPERADMIN") {
  document.cookie = `sc_role=${role}; path=/; samesite=lax`;
}
function clearRoleCookie() {
  document.cookie = "sc_role=; Max-Age=0; path=/; samesite=lax";
}

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [me, setMe] = useState<MeDto | null>(null);
  const [loading, setLoading] = useState(true);

  const [paywall, setPaywall] = useState<PaywallPayload | null>(null);

  const openPaywall = useCallback((data: unknown) => {
    if (!data || typeof data !== "object") {
      setPaywall({ code: "UPGRADE_REQUIRED" });
      return;
    }
    setPaywall(data as PaywallPayload);
  }, []);
  const closePaywall = useCallback(() => setPaywall(null), []);

  const user = me?.user ?? null;
  const tenant = me?.tenant ?? null;

  const setCreditsBalance = useCallback((next: number) => {
    setMe((prev) => {
      if (!prev?.tenant) return prev;
      return { ...prev, tenant: { ...prev.tenant, creditsBalance: next } };
    });
  }, []);

  const refreshMe = useCallback(async () => {
    try {
      setLoading(true);
      const data = await apiFetch<MeDto>("/auth/me");
      setMe(data);

      const role = data.user.role ?? data.user.authRole ?? "USER";
      setRoleCookie(role);
    } catch (e) {
      // если не залогинен — это ок, просто clean state
      if (e instanceof ApiError && (e.status === 401 || e.status === 403)) {
        setMe(null);
        clearRoleCookie();
      } else {
        // можно залогировать, но не ломаем UI
        setMe(null);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshMe();
  }, [refreshMe]);

  const login = useCallback(async (email: string, password: string) => {
    // ✅ backend ставит cookies (sc_auth httpOnly + sc_csrf)
    await apiFetch("/auth/login", { method: "POST", body: { email, password } });

    // временно ставим USER для middleware, потом refreshMe заменит на SUPERADMIN если надо
    setRoleCookie("USER");
    await refreshMe();
  }, [refreshMe]);

  const register = useCallback(async (email: string, password: string, fullName?: string, restaurantName?: string) => {
    await apiFetch("/auth/register", { method: "POST", body: { email, password, fullName, restaurantName } });

    setRoleCookie("USER");
    await refreshMe();
  }, [refreshMe]);

  const logout = useCallback(async () => {
    try {
      await apiFetch("/auth/logout", { method: "POST" }); // ✅ server clears cookies
    } catch {
      // ignore
    }
    setMe(null);
    clearRoleCookie();
  }, []);

  const value = useMemo<AuthContextValue>(() => {
    return {
      me,
      user,
      tenant,
      loading,
      login,
      register,
      logout,
      openPaywall,
      setCreditsBalance,
      refreshMe,
    };
  }, [me, user, tenant, loading, login, register, logout, openPaywall, setCreditsBalance, refreshMe]);

  return (
    <AuthContext.Provider value={value}>
      {children}
      {paywall && <UpgradeModal data={paywall} onClose={closePaywall} />}
    </AuthContext.Provider>
  );
};

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}