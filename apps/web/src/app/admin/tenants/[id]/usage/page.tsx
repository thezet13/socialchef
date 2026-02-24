"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { adminFetch } from "@/lib/adminApi";

type UsageEventRow = {
  id: string;
  createdAt: string;
  actionType: string;
  creditsCost: number;
  meta: unknown | null;
};

type UsageSummaryRow = {
  actionType: string;
  count: number;
  creditsSpent: number;
};

type TenantUsageResponse = {
  events: UsageEventRow[];
  summary30d: UsageSummaryRow[];
};

function Badge({ text }: { text: string }) {
  return (
    <span className="inline-flex items-center rounded-lg border border-slate-800 bg-slate-950/40 px-2 py-0.5 text-[10px] text-slate-300">
      {text}
    </span>
  );
}

function fmt(dt: string) {
  try {
    return new Date(dt).toLocaleString();
  } catch {
    return dt;
  }
}

export default function AdminTenantUsagePage() {
  const params = useParams<{ id: string }>();
  const tenantId = params.id;

  const [take, setTake] = useState(50);
  const [data, setData] = useState<TenantUsageResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setErr(null);

    adminFetch<TenantUsageResponse>(`/tenants/${tenantId}/usage?take=${take}`)
      .then((r) => {
        if (!alive) return;
        setData(r);
      })
      .catch((e: unknown) => {
        if (!alive) return;
        setErr(e instanceof Error ? e.message : "Failed");
      })
      .finally(() => {
        if (!alive) return;
        setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [tenantId, take]);

  const summary = data?.summary30d ?? [];
  const events = data?.events ?? [];

  const totals = useMemo(() => {
    const totalCount = summary.reduce((a, r) => a + (r.count ?? 0), 0);
    const totalCredits = summary.reduce((a, r) => a + (r.creditsSpent ?? 0), 0);
    return { totalCount, totalCredits };
  }, [summary]);

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-3">
        <div>
          <div className="text-xl font-semibold text-slate-100">Usage</div>
          <div className="text-xs text-slate-500 mt-1">
            Tenant activity: feature usage frequency and credits spent (last 30 days)
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="text-xs text-slate-500">Events:</div>
          <select
            value={take}
            onChange={(e) => setTake(Number(e.target.value))}
            className="rounded-xl border border-slate-800 bg-slate-950/30 px-3 py-2 text-sm"
          >
            <option value={25}>25</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
            <option value={200}>200</option>
          </select>
        </div>
      </div>

      {err ? (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">{err}</div>
      ) : null}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4">
          <div className="text-xs text-slate-400">Total actions (30d)</div>
          <div className="text-2xl font-semibold text-slate-100 mt-1">
            {loading && !data ? "…" : totals.totalCount}
          </div>
        </div>
        <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4">
          <div className="text-xs text-slate-400">Credits spent (30d)</div>
          <div className="text-2xl font-semibold text-orange-300 mt-1">
            {loading && !data ? "…" : totals.totalCredits}
          </div>
        </div>
        <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4">
          <div className="text-xs text-slate-400">Avg credits / action</div>
          <div className="text-2xl font-semibold text-slate-100 mt-1">
            {loading && !data ? "…" : totals.totalCount ? (totals.totalCredits / totals.totalCount).toFixed(2) : "0.00"}
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-950/40 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-800">
          <div className="text-sm font-semibold text-slate-100">Summary by action (30d)</div>
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
                <tr><td className="px-3 py-4 text-slate-500" colSpan={4}>No usage in last 30 days</td></tr>
              ) : (
                summary.map((r) => (
                  <tr key={r.actionType} className="border-t border-slate-800">
                    <td className="px-3 py-3"><Badge text={r.actionType} /></td>
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

      <div className="rounded-2xl border border-slate-800 bg-slate-950/40 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-800">
          <div className="text-sm font-semibold text-slate-100">Recent events</div>
          <div className="text-xs text-slate-500 mt-1">Most recent usage events for this tenant</div>
        </div>

        <div className="p-3 space-y-2">
          {loading && !data ? (
            <div className="text-xs text-slate-500">Loading…</div>
          ) : events.length === 0 ? (
            <div className="text-xs text-slate-500">No events</div>
          ) : (
            events.map((e) => (
              <details key={e.id} className="border border-slate-800 rounded-xl px-3 py-2">
                <summary className="cursor-pointer list-none">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0 flex items-center gap-2">
                      <Badge text={e.actionType} />
                      <div className="text-[10px] text-slate-500 truncate">{fmt(e.createdAt)}</div>
                    </div>
                    <div className="text-sm text-orange-400 font-semibold">{e.creditsCost}</div>
                  </div>
                </summary>

                <div className="mt-2 text-[11px] text-slate-300">
                  <div className="text-[10px] text-slate-500 mb-1">meta</div>
                  <pre className="whitespace-pre-wrap break-words rounded-lg border border-slate-800 bg-slate-950/30 p-2 text-[10px] text-slate-300">
                    {e.meta ? JSON.stringify(e.meta, null, 2) : "—"}
                  </pre>
                </div>
              </details>
            ))
          )}
        </div>
      </div>
    </div>
  );
}