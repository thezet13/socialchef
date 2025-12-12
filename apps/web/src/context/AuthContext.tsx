"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { apiFetch } from "../lib/apiClient";

interface User {
  id: string;
  email: string;
  fullName?: string | null;
}

interface AuthContextValue {
  user: User | null;
  token: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (params: {
    email: string;
    password: string;
    fullName?: string;
    restaurantName: string;
  }) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const TOKEN_KEY = "socialchef_token";

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // загрузка токена из localStorage при старте
  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem(TOKEN_KEY);
    if (stored) {
      setToken(stored);
      // сразу пытаемся получить /auth/me
      apiFetch<User>("/auth/me", { token: stored })
        .then((u) => setUser(u))
        .catch(() => {
          window.localStorage.removeItem(TOKEN_KEY);
          setToken(null);
          setUser(null);
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const login = async (email: string, password: string) => {
    setLoading(true);
    try {
      const res = await apiFetch<{ token: string }>("/auth/login", {
        method: "POST",
        body: { email, password },
      });
      const t = res.token;
      setToken(t);
      if (typeof window !== "undefined") {
        window.localStorage.setItem(TOKEN_KEY, t);
      }
      const me = await apiFetch<User>("/auth/me", { token: t });
      setUser(me);
    } finally {
      setLoading(false);
    }
  };

  const register = async (params: {
    email: string;
    password: string;
    fullName?: string;
    restaurantName: string;
  }) => {
    setLoading(true);
    try {
      const res = await apiFetch<{ token: string }>("/auth/register", {
        method: "POST",
        body: params,
      });
      const t = res.token;
      setToken(t);
      if (typeof window !== "undefined") {
        window.localStorage.setItem(TOKEN_KEY, t);
      }
      const me = await apiFetch<User>("/auth/me", { token: t });
      setUser(me);
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(TOKEN_KEY);
    }
  };

  const value: AuthContextValue = {
    user,
    token,
    loading,
    login,
    register,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
