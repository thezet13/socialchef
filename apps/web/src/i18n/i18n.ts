import en from "../i18n/lang/en.json";
import ru from "../i18n/lang/ru.json";

export const LANG_STORAGE_KEY = "sc_lang" as const;

export const dictionaries = {
  en,
  ru,
  // az: require later
} as const;

export type Lang = keyof typeof dictionaries;
export type Dict = Record<string, string>;

export function isLang(v: string): v is Lang {
  return Object.prototype.hasOwnProperty.call(dictionaries, v);
}

export function normalizeBrowserLang(raw: string | undefined | null): Lang {
  const fallback: Lang = "en";
  if (!raw) return fallback;

  // "en-US" -> "en"
  const base = raw.toLowerCase().split("-")[0]?.trim();
  if (base && isLang(base)) return base;

  return fallback;
}

export function detectBrowserLang(): Lang {
  if (typeof window === "undefined") return "en";

  // navigator.languages has priority list
  const langs = (navigator.languages && navigator.languages.length > 0)
    ? navigator.languages
    : [navigator.language];

  for (const l of langs) {
    const norm = normalizeBrowserLang(l);
    if (norm) return norm;
  }
  return "en";
}

export function interpolate(template: string, params?: Record<string, string | number>): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (_, key: string) => {
    const v = params[key];
    return v === undefined || v === null ? `{${key}}` : String(v);
  });
}
