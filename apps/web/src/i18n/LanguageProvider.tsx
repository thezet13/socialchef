"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  dictionaries,
  detectBrowserLang,
  Dict,
  interpolate,
  isLang,
  LANG_STORAGE_KEY,
  Lang,
} from "./i18n";

type I18nContextValue = {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
  dict: Dict;
};

const I18nContext = createContext<I18nContextValue | null>(null);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  // SSR fallback always "en", then client effect корректирует
  const [lang, setLangState] = useState<Lang>("en");

  // init on client: localStorage -> browser lang -> fallback
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(LANG_STORAGE_KEY);
      if (saved && isLang(saved)) {
        setLangState(saved);
        return;
      }
      const detected = detectBrowserLang();
      setLangState(detected);
      window.localStorage.setItem(LANG_STORAGE_KEY, detected);
    } catch {
      // ignore
      setLangState(detectBrowserLang());
    }
  }, []);

  // sync <html lang="...">
  useEffect(() => {
    try {
      document.documentElement.lang = lang;
    } catch {
      // ignore
    }
  }, [lang]);

  const dict = useMemo(() => dictionaries[lang] as unknown as Dict, [lang]);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    try {
      window.localStorage.setItem(LANG_STORAGE_KEY, l);
    } catch {
      // ignore
    }
  }, []);

  const t = useCallback(
    (key: string, params?: Record<string, string | number>) => {
      const raw = dict[key];
      if (typeof raw !== "string") {
        // В dev удобно видеть пропуски
        if (process.env.NODE_ENV !== "production") return `⟦${key}⟧`;
        return key;
      }
      return interpolate(raw, params);
    },
    [dict]
  );

  const value = useMemo<I18nContextValue>(() => ({ lang, setLang, t, dict }), [lang, setLang, t, dict]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used inside <LanguageProvider>");
  return ctx;
}

export function useT() {
  return useI18n().t;
}
