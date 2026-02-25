"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { adminFetch } from "@/lib/adminApi";

type OverviewResponse = {
  range: string;
  kpi: {
    tenantsTotal: number;
    usersTotal: number;
    tenantsActive: number;
    creditsSpent: number;
  };
  topTenants: { tenantId: string; tenantName: string; ownerName: string; ownerEmail: string; creditsSpent: number }[];
  recentUsage: {
    id: string;
    createdAt: string;
    actionType: string;
    creditsCost: number;
    tenant: { id: string; name: string };
    user: { id: string; email: string } | null;
  }[];
};

function StatCard(props: { label: string; value: string | number; hint?: string; loading?: boolean }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4">
      <div className="text-xs text-slate-400">{props.label}</div>
      <div className="text-2xl font-semibold text-slate-100 mt-1">
        {props.loading ? <span className="text-slate-600">…</span> : props.value}
      </div>
      {props.hint ? <div className="text-xs text-slate-500 mt-1">{props.hint}</div> : null}
    </div>
  );
}

function Badge({ text }: { text: string }) {
  return (
    <span className="inline-flex items-center rounded-lg border border-slate-800 bg-slate-950/40 px-2 py-0.5 text-[10px] text-slate-300">
      {text}
    </span>
  );
}

export default function AdminDashboardPage() {
  const { me } = useAuth();
  const authed = !!me;

  const [data, setData] = useState<OverviewResponse | null>(null);
  const [range, setRange] = useState<"24h" | "7d" | "30d">("7d");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const rangeHint = useMemo(() => {
    if (range === "24h") return "Last 24 hours";
    if (range === "7d") return "Last 7 days";
    return "Last 30 days";
  }, [range]);

  useEffect(() => {
    if (!authed) return;

    let alive = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setErr(null);

    adminFetch<OverviewResponse>(`/overview?range=${range}`)
      .then(r => {
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
      alive = false; // ignore stale responses
    };
  }, [authed, range]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-xl font-semibold text-slate-100">Dashboard</div>
          <div className="text-xs text-slate-500 mt-1">Quick overview & health</div>
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

      {err ? (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">{err}</div>
      ) : null}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <StatCard label="Tenants total" value={data?.kpi.tenantsTotal ?? "—"} loading={loading && !data} />
        <StatCard label="Users total" value={data?.kpi.usersTotal ?? "—"} loading={loading && !data} />
        <StatCard label="Active tenants" value={data?.kpi.tenantsActive ?? "—"} hint={`${rangeHint}`} loading={loading && !data} />
        <StatCard label="Credits spent" value={data?.kpi.creditsSpent ?? "—"} loading={loading && !data} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold text-slate-100">Top tenants by credits</div>
            <Link href="/admin/tenants" className="text-xs text-slate-400 hover:text-slate-200">
              View all →
            </Link>
          </div>

          <div className="mt-3 space-y-2">
            {(data?.topTenants ?? []).map(t => (
              <Link
                key={t.tenantId}
                href={`/admin/tenants/${t.tenantId}`}
                className="flex items-center justify-between border border-slate-800 rounded-xl px-3 py-2 hover:border-slate-700 transition"
              >
                <div>
                  <div className="text-sm text-slate-200">{t.tenantName}</div>
                  <div className="text-[10px] text-slate-500">{t.ownerEmail ?? t.ownerName ?? "—"}</div>
                </div>
                <div className="text-sm text-orange-400 font-semibold">{t.creditsSpent}</div>
              </Link>
            ))}

            {!loading && !(data?.topTenants?.length) ? <div className="text-xs text-slate-500">No data yet</div> : null}
            {loading && !data ? <div className="text-xs text-slate-600">Loading…</div> : null}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4">
          <div className="text-sm font-semibold text-slate-100">Recent usage</div>

          <div className="mt-3 space-y-2">
            {(data?.recentUsage ?? []).map(e => (
              <div key={e.id} className="border flex justify-between border-slate-800 rounded-xl px-3 py-2">
                <div className="text-[10px] text-slate-500 mt-1">
                  {new Date(e.createdAt).toLocaleString()}
                </div>
                <div className="text-[10px] text-slate-500 truncate">
                  {e.tenant.name}
                </div>
                <div className="flex items-center gap-2 min-w-0">
                  <Badge text={e.actionType} />

                </div>
                <div className="flex items-center justify-between gap-3">

                  <div className="text-sm text-orange-400 font-semibold">{e.creditsCost}</div>
                </div>

              </div>
            ))}

            {!loading && !(data?.recentUsage?.length) ? <div className="text-xs text-slate-500">No events yet</div> : null}
            {loading && !data ? <div className="text-xs text-slate-600">Loading…</div> : null}
          </div>
        </div>
      </div>
    </div>
  );
}