"use client";

import { useI18n } from "@/i18n/LanguageProvider";
import type { Lang } from "@/i18n/i18n";

const options: { value: Lang; label: string }[] = [
  { value: "en", label: "EN" },
  { value: "ru", label: "RU" },
  // { value: "az", label: "AZ" },
];

export function LanguageSwitcher() {
  const { lang, setLang } = useI18n();

  return (
    <div className="inline-flex rounded-xl border border-slate-800 bg-slate-950/30 p-1">
      {options.map((o) => {
        const active = o.value === lang;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => setLang(o.value)}
            className={[
              "px-3 py-1.5 text-xs font-semibold rounded-lg transition",
              active ? "bg-blue-500/20 border border-blue-500/40 text-slate-100" : "text-slate-400 hover:text-slate-200",
            ].join(" ")}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
