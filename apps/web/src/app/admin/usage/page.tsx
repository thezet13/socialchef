"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { adminFetch } from "@/lib/adminApi";
import { useAuth } from "@/context/AuthContext";

type Range = "24h" | "7d" | "30d";

type UsageKpi = {
  totalEvents: number;
  creditsSpent: number;
  uniqueTenants: number;
};

type UsageSummaryRow = {
  actionType: string;
  count: number;
  creditsSpent: number;
};

type UsageEventRow = {
  id: string;
  createdAt: string; // ISO
  actionType: string;
  creditsCost: number;
  tenant: { id: string; name: string };
  user: { id: string; email: string } | null;
  meta: unknown | null;
};

type AdminUsageResponse = {
  range: Range;
  kpi: UsageKpi;
  summary: UsageSummaryRow[];
  items: UsageEventRow[];
  nextCursor: string | null;
};

function Badge(props: { children: string; tone?: "orange" | "slate" | "green" }) {
  const tone = props.tone ?? "slate";
  const cls =
    tone === "orange"
      ? "border-orange-500/0 bg-orange-500/10 text-orange-200"
      : tone === "green"
        ? "border-green-500/0 bg-green-500/10 text-green-200"
        : "border-slate-700 bg-slate-900/40 text-slate-300";
  return <span className={`inline-flex items-center rounded-lg border px-2 py-0.5 text-[10px] ${cls}`}>{props.children}</span>;
}

function fmt(dt: string) {
  try {
    return new Date(dt).toLocaleString();
  } catch {
    return dt;
  }
}

export default function AdminUsagePage() {
  const { user, me } = useAuth();
  const authed = !!user || !!me;

  const [range, setRange] = useState<Range>("7d");
  const [tenantQuery, setTenantQuery] = useState("");
  const [actionType, setActionType] = useState("");

  const [data, setData] = useState<AdminUsageResponse | null>(null);
  const [items, setItems] = useState<UsageEventRow[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const qs = useMemo(() => {
    const p = new URLSearchParams();
    p.set("range", range);
    p.set("take", "50");
    if (tenantQuery.trim()) p.set("tenantQuery", tenantQuery.trim());
    if (actionType) p.set("actionType", actionType);
    return p.toString();
  }, [range, tenantQuery, actionType]);

  async function load() {
    if (!authed) return;
    setErr(null);
    setLoading(true);
    try {
      const r = await adminFetch<AdminUsageResponse>(`/usage?${qs}`);
      setData(r);
      setItems(r.items ?? []);
      setCursor(r.nextCursor);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Failed");
      setData(null);
      setItems([]);
      setCursor(null);
    } finally {
      setLoading(false);
    }
  }

  async function loadMore() {
    if (!authed || !cursor) return;
    setLoadingMore(true);
    try {
      const r = await adminFetch<AdminUsageResponse>(`/usage?${qs}&cursor=${cursor}`);
      setItems(prev => [...prev, ...(r.items ?? [])]);
      setCursor(r.nextCursor);
      // summary/kpi обычно не меняем при пагинации (они от фильтров), но пусть обновится “на всякий”
      setData(prev => (prev ? { ...prev, kpi: r.kpi, summary: r.summary, range: r.range } : r));
    } finally {
      setLoadingMore(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authed, qs]);

  const summary = data?.summary ?? [];
  const kpi = data?.kpi;

  const actionOptions = useMemo(() => {
    const set = new Set<string>();
    summary.forEach(s => set.add(s.actionType));
    return Array.from(set).sort();
  }, [summary]);

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-3">
        <div>
          <div className="text-xl font-semibold text-slate-100">Usage</div>
          <div className="text-xs text-slate-500 mt-1">All tenants activity feed + summary</div>
        </div>

        <div className="flex gap-2">
          {(["24h", "7d", "30d"] as const).map(r => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={[
                "rounded-xl px-3 py-2 text-sm border transition",
                range === r
                  ? "border-orange-500/50 bg-orange-500/10 text-slate-100"
                  : "border-slate-800 bg-slate-950/30 text-slate-300 hover:border-slate-700",
              ].join(" ")}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-3">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
          <input
            value={tenantQuery}
            onChange={e => setTenantQuery(e.target.value)}
            placeholder="Tenant search (name contains)…"
            className="rounded-xl border border-slate-800 bg-slate-950/40 px-3 py-2 text-sm outline-none focus:border-slate-600"
          />

          <select
            value={actionType}
            onChange={e => setActionType(e.target.value)}
            className="rounded-xl border border-slate-800 bg-slate-950/40 px-3 py-2 text-sm"
          >
            <option value="">All actions</option>
            {actionOptions.map(a => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>

          <button
            onClick={() => void load()}
            className="rounded-xl border border-slate-800 bg-slate-950/30 px-3 py-2 text-sm hover:border-slate-700"
          >
            Refresh
          </button>
        </div>
      </div>

      {err ? <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">{err}</div> : null}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4">
          <div className="text-xs text-slate-400">Total events</div>
          <div className="text-2xl font-semibold text-slate-100 mt-1">{loading && !data ? "…" : (kpi?.totalEvents ?? "—")}</div>
        </div>
        <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4">
          <div className="text-xs text-slate-400">Credits spent</div>
          <div className="text-2xl font-semibold text-orange-300 mt-1">{loading && !data ? "…" : (kpi?.creditsSpent ?? "—")}</div>
        </div>
        <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4">
          <div className="text-xs text-slate-400">Unique tenants</div>
          <div className="text-2xl font-semibold text-slate-100 mt-1">{loading && !data ? "…" : (kpi?.uniqueTenants ?? "—")}</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {/* Summary */}
        <div className="rounded-2xl border border-slate-800 bg-slate-950/40 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-800">
            <div className="text-sm font-semibold text-slate-100">Summary by action</div>
            <div className="text-xs text-slate-500 mt-1">Counts and credits for selected window</div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-950/60 text-slate-400">
                <tr>
                  <th className="text-left px-3 py-2">Action</th>
                  <th className="text-right px-3 py-2">Count</th>
                  <th className="text-right px-3 py-2">Credits</th>
                  <th className="text-right px-3 py-2">Avg</th>
                </tr>
              </thead>
              <tbody>
                {loading && !data ? (
                  <tr><td className="px-3 py-4 text-slate-500" colSpan={4}>Loading…</td></tr>
                ) : summary.length === 0 ? (
                  <tr><td className="px-3 py-4 text-slate-500" colSpan={4}>No data</td></tr>
                ) : (
                  summary.map(r => (
                    <tr key={r.actionType} className="border-t border-slate-800">
                      <td className="px-3 py-3"><Badge tone="slate">{r.actionType}</Badge></td>
                      <td className="px-3 py-3 text-right">{r.count}</td>
                      <td className="px-3 py-3 text-right text-orange-300 font-semibold">{r.creditsSpent}</td>
                      <td className="px-3 py-3 text-right text-slate-400">
                        {r.count ? (r.creditsSpent / r.count).toFixed(2) : "0.00"}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Recent feed */}
        <div className="rounded-2xl border border-slate-800 bg-slate-950/40 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-800">
            <div className="text-sm font-semibold text-slate-100">Recent events</div>
            <div className="text-xs text-slate-500 mt-1">Latest events across all tenants</div>
          </div>

          <div className="p-3 space-y-2">
            {loading && !data ? (
              <div className="text-xs text-slate-500">Loading…</div>
            ) : items.length === 0 ? (
              <div className="text-xs text-slate-500">No events</div>
            ) : (
              items.map(e => (
                <details key={e.id} className="border border-slate-800 rounded-xl px-3 py-2">
                  <summary className="cursor-pointer list-none">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 min-w-0">
                          <Badge tone="slate">{e.actionType}</Badge>
                          <Link
                            className="text-[10px] text-slate-300 hover:underline truncate"
                            href={`/admin/tenants/${e.tenant.id}`}
                            title="Open tenant"
                          >
                            {e.tenant.name}
                          </Link>
                          <span className="text-[10px] text-slate-600">•</span>
                          <span className="text-[10px] text-slate-500 truncate">{e.user?.email ?? "—"}</span>
                        </div>
                        <div className="text-[10px] text-slate-500 mt-1">{fmt(e.createdAt)}</div>
                      </div>

                      <div className="text-sm text-orange-400 font-semibold">{e.creditsCost}</div>
                    </div>
                  </summary>

                  <div className="mt-2 text-[11px] text-slate-300">
                    <div className="flex items-center justify-between mb-1">
                      <div className="text-[10px] text-slate-500">meta</div>
                      <Link
                        href={`/admin/tenants/${e.tenant.id}?tab=usage`}
                        className="text-[10px] text-slate-400 hover:text-slate-200"
                        title="Open tenant usage"
                      >
                        Tenant usage →
                      </Link>
                    </div>

                    <pre className="whitespace-pre-wrap break-words rounded-lg border border-slate-800 bg-slate-950/30 p-2 text-[10px] text-slate-300">
                      {e.meta ? JSON.stringify(e.meta, null, 2) : "—"}
                    </pre>
                  </div>
                </details>
              ))
            )}
          </div>

          {cursor ? (
            <div className="p-3 border-t border-slate-800">
              <button
                onClick={() => void loadMore()}
                disabled={loadingMore}
                className={[
                  "w-full rounded-xl px-3 py-2 text-sm border",
                  loadingMore ? "opacity-50 cursor-not-allowed border-slate-800" : "border-slate-800 hover:border-slate-700",
                ].join(" ")}
              >
                {loadingMore ? "Loading…" : "Load more"}
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}