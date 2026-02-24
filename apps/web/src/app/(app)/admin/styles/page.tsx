"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { StyleCreateCard } from "@/features/styles/StyleCreateCard"; // <-- проверь путь
import type { StyleListItem } from "@/features/styles/styles.types";
import { apiFetch } from "@/lib/apiClient";

type ListResp = { items: StyleListItem[] };

export default function AdminStylesPage() {
  const { user, me } = useAuth();
  const authed = !!user;

  // если у тебя apiBase хранится иначе — подставь как в images/page.tsx
  const apiBase = useMemo(() => process.env.NEXT_PUBLIC_API_BASE ?? "http://127.0.0.1:4001", []);

  const [items, setItems] = useState<StyleListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const loadStyles = useCallback(async () => {
    try {
      setErr(null);
      if (!authed) return;

      setLoading(true);

      const data = await apiFetch<ListResp>(`${apiBase}/styles?scope=ALL&status=PUBLISHED&take=200`, {
      });
      setItems(data.items ?? []);

    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Failed to load styles");
    } finally {
      setLoading(false);
    }
  }, [apiBase, authed]);

  useEffect(() => {
    void loadStyles();
  }, [loadStyles]);

  if (!authed) {
    return <div className="p-6 text-sm text-slate-400">Not authorized</div>;
  }

  return (
    <div className="p-6 space-y-6 mt-10">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-100">Admin · Styles</h1>
        <button
          type="button"
          onClick={() => void loadStyles()}
          className="px-3 py-2 rounded-xl border border-slate-800 bg-slate-900 text-slate-200 text-sm hover:bg-slate-800"
        >
          Refresh
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[420px_1fr] gap-6">
        <StyleCreateCard apiBase={apiBase} onCreated={loadStyles} />

        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="text-slate-200 text-lg">System styles</div>
            {loading ? <div className="text-xs text-slate-500">Loading…</div> : null}
          </div>

          {err ? (
            <div className="text-xs text-red-400 mb-3">{err}</div>
          ) : null}

          {items.length === 0 && !loading ? (
            <div className="text-sm text-slate-500">No styles yet.</div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
              {items.map((s) => (
                <div key={s.id} className="rounded-2xl border border-slate-800 bg-slate-950/40 overflow-hidden">
                  <div className="aspect-[4/3] bg-slate-950">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={s.thumbnailUrl} alt={s.title} className="h-full w-full object-cover" />
                  </div>
                  <div className="p-3">
                    <div className="text-xs font-semibold text-slate-100 leading-tight">{s.title}</div>
                    <div className="mt-1 text-[10px] text-slate-500">{s.scope} · {s.status}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
