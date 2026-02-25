"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useAuth } from "../../../../context/AuthContext";
import { adminFetch } from "../../../../lib/adminApi";

type TenantDto = {
  id: string;
  restaurantName: string;
  plan: string;
  creditsBalance: number;
  isActive: boolean;
  country: string | null;
  lastActivityAt: string | null;
};

type AssetItem = { id: string; title: string; thumbnailUrl: string | null; createdAt: string };
type AssetsResponse = { items: AssetItem[]; nextCursor: string | null };

type UsageResponse = {
  events: { id: string; createdAt: string; actionType: string; creditsCost: number }[];
  summary30d: { actionType: string; count: number; creditsSpent: number }[];
};

function TabBtn(props: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      onClick={props.onClick}
      className={[
        "rounded-xl px-3 py-2 text-sm border",
        props.active
          ? "border-orange-500/50 bg-orange-500/10 text-slate-100"
          : "border-slate-800 bg-slate-950/30 text-slate-300 hover:border-slate-700",
      ].join(" ")}
    >
      {props.label}
    </button>
  );
}

export default function AdminTenantDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  const { user } = useAuth();
  const authed = !!user;

  // ✅ Next.js: params is Promise → unwrap into state once
  const [tenantId, setTenantId] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const p = await params;
        const id = (p?.id ?? "").trim();
        if (!alive) return;
        setTenantId(id || null);
      } catch {
        if (!alive) return;
        setTenantId(null);
      }
    })();
    return () => {
      alive = false;
    };
  }, [params]);

  const sp = useSearchParams();
  const initialTab = (sp.get("tab") ?? "overview") as "overview" | "assets" | "usage" | "billing" | "danger";
  const initialType = (sp.get("type") ?? "PRESET") as "PRESET" | "STYLE" | "BRAND_STYLE" | "GENERATED";

  const [tab, setTab] = useState(initialTab);
  const [type, setType] = useState(initialType);

  const [tenant, setTenant] = useState<TenantDto | null>(null);

  const [assets, setAssets] = useState<AssetItem[]>([]);
  const [assetsCursor, setAssetsCursor] = useState<string | null>(null);
  const [assetsLoading, setAssetsLoading] = useState(false);

  const [usage, setUsage] = useState<UsageResponse | null>(null);

  useEffect(() => {
    if (!authed) return;
    if (!tenantId) return;
    adminFetch<TenantDto>(`/tenants/${tenantId}`).then(setTenant);
  }, [authed, tenantId]);

  async function loadAssets(reset: boolean) {
    if (!authed) return;
    if (!tenantId) return;

    setAssetsLoading(true);
    try {
      const cursor = reset ? "" : assetsCursor ? `&cursor=${assetsCursor}` : "";
      const r = await adminFetch<AssetsResponse>(`/tenants/${tenantId}/assets?type=${type}&take=30${cursor}`);
      setAssets(prev => (reset ? r.items : [...prev, ...r.items]));
      setAssetsCursor(r.nextCursor);
    } finally {
      setAssetsLoading(false);
    }
  }

  useEffect(() => {
    if (!authed) return;
    if (!tenantId) return;
    if (tab !== "assets") return;

    setAssets([]);
    setAssetsCursor(null);
    void loadAssets(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, type, authed, tenantId]);

  useEffect(() => {
    if (!authed) return;
    if (!tenantId) return;
    if (tab !== "usage") return;

    adminFetch<UsageResponse>(`/tenants/${tenantId}/usage?take=80`).then(setUsage);
  }, [authed, tenantId, tab]);

  const title = useMemo(() => tenant?.restaurantName ?? "Tenant", [tenant?.restaurantName]);

  // ✅ guard UI: пока id не распакован — покажем нейтральный скелет
  if (!tenantId) {
    return (
      <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4 text-sm text-slate-400">
        Loading tenant…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-xl font-semibold text-slate-100">{title}</div>
            <div className="text-xs text-slate-500 mt-1">
              Plan: <span className="text-orange-300">{tenant?.plan ?? "—"}</span> • Credits:{" "}
              <span className="text-orange-300 font-semibold">{tenant?.creditsBalance ?? "—"}</span> • Country:{" "}
              <span className="text-slate-300">{tenant?.country ?? "—"}</span>
            </div>
            <div className="text-xs text-slate-500 mt-1">
              Last activity: {tenant?.lastActivityAt ? new Date(tenant.lastActivityAt).toLocaleString() : "—"}
            </div>
          </div>

          <div className="flex gap-2">
            <TabBtn active={tab === "overview"} label="Overview" onClick={() => setTab("overview")} />
            <TabBtn active={tab === "assets"} label="Assets" onClick={() => setTab("assets")} />
            <TabBtn active={tab === "usage"} label="Usage" onClick={() => setTab("usage")} />
            <TabBtn active={tab === "billing"} label="Billing" onClick={() => setTab("billing")} />
            <TabBtn active={tab === "danger"} label="Danger" onClick={() => setTab("danger")} />
          </div>
        </div>
      </div>

      {tab === "overview" ? (
        <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4 text-sm text-slate-300">
          Quick overview placeholder. (We can add per-tenant KPI here next.)
        </div>
      ) : null}

      {tab === "assets" ? (
        <div className="space-y-3">
          <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-3 flex gap-2 flex-wrap">
            {(["PRESET", "STYLE", "BRAND_STYLE", "GENERATED"] as const).map(t => (
              <button
                key={t}
                onClick={() => setType(t)}
                className={[
                  "rounded-xl px-3 py-2 text-sm border",
                  type === t
                    ? "border-orange-500/50 bg-orange-500/10 text-slate-100"
                    : "border-slate-800 bg-slate-950/30 text-slate-300 hover:border-slate-700",
                ].join(" ")}
              >
                {t}
              </button>
            ))}
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4">
            {assets.length === 0 && assetsLoading ? (
              <div className="text-sm text-slate-500">Loading…</div>
            ) : assets.length === 0 ? (
              <div className="text-sm text-slate-500">No assets</div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
                {assets.map(a => (
                  <div key={a.id} className="rounded-2xl border border-slate-800 bg-slate-950/30 overflow-hidden">
                    <div className="aspect-square bg-slate-900/40">
                      {a.thumbnailUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={a.thumbnailUrl} alt={a.title} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-xs text-slate-500">no thumb</div>
                      )}
                    </div>
                    <div className="p-2">
                      <div className="text-xs text-slate-200 truncate">{a.title}</div>
                      <div className="text-[10px] text-slate-500 mt-1">{new Date(a.createdAt).toLocaleDateString()}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {assetsCursor ? (
              <div className="mt-4">
                <button
                  onClick={() => void loadAssets(false)}
                  disabled={assetsLoading}
                  className="w-full rounded-xl px-3 py-2 text-sm border border-slate-800 hover:border-slate-700 disabled:opacity-50"
                >
                  {assetsLoading ? "Loading…" : "Load more"}
                </button>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {tab === "usage" ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4">
            <div className="text-sm font-semibold text-slate-100">Summary (30d)</div>
            <div className="mt-3 space-y-2">
              {(usage?.summary30d ?? []).map(s => (
                <div
                  key={s.actionType}
                  className="flex items-center justify-between rounded-xl border border-slate-800 px-3 py-2"
                >
                  <div className="text-sm text-slate-200">{s.actionType}</div>
                  <div className="text-xs text-slate-400">
                    <span className="text-slate-200">{s.count}</span> •{" "}
                    <span className="text-orange-300 font-semibold">{s.creditsSpent}</span>
                  </div>
                </div>
              ))}
              {!usage?.summary30d?.length ? <div className="text-xs text-slate-500">No data</div> : null}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4">
            <div className="text-sm font-semibold text-slate-100">Recent events</div>
            <div className="mt-3 space-y-2 max-h-[520px] overflow-auto pr-1">
              {(usage?.events ?? []).map(e => (
                <div key={e.id} className="rounded-xl border border-slate-800 px-3 py-2">
                  <div className="flex items-center justify-between">
                    <div className="text-sm text-slate-200">{e.actionType}</div>
                    <div className="text-sm text-orange-300 font-semibold">{e.creditsCost}</div>
                  </div>
                  <div className="text-xs text-slate-500 mt-1">{new Date(e.createdAt).toLocaleString()}</div>
                </div>
              ))}
              {!usage?.events?.length ? <div className="text-xs text-slate-500">No events</div> : null}
            </div>
          </div>
        </div>
      ) : null}

      {tab === "billing" ? (
        <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4 text-sm text-slate-300">
          Billing tab placeholder (later: Paddle customer/subscription IDs, status, next billing date).
        </div>
      ) : null}

      {tab === "danger" ? (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-100">
          Danger zone placeholder (soft delete, anonymize, etc.)
        </div>
      ) : null}
    </div>
  );
}