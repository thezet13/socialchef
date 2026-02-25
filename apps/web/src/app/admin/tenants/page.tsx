"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAuth } from "../../../context/AuthContext";
import { adminFetch } from "../../../lib/adminApi";
import { useGlobalDialog } from "../../../components/GlobalDialogProvider";

type TenantRow = {
  id: string;
  ownerName: string | null;
  ownerEmail: string | null;
  restaurantName: string;
  plan: string;
  creditsBalance: number;
  country: string | null;
  isActive: boolean;
  lastActivityAt: string | null;

  qtyPresets: number;
  qtyImageStyles: number;
  qtyBrandStyles: number;
  qtyGeneratedImages: number;
};

type TenantsResponse = {
  items: TenantRow[];
  nextCursor: string | null;
};

function Badge(props: { children: string; tone?: "orange" | "slate" | "red" | "green" }) {
  const tone = props.tone ?? "slate";
  const cls =
    tone === "orange"
      ? "border-orange-500/0 bg-orange-500/10 text-orange-200"
      : tone === "green"
        ? "border-green-500/0 bg-green-500/10 text-green-200"
        : tone === "red"
          ? "border-red-500/30 bg-red-500/10 text-red-200"
          : "border-slate-700 bg-slate-900/40 text-slate-300";
  return <span className={`inline-flex items-center rounded-lg border px-2 py-0.5 text-xs ${cls}`}>{props.children}</span>;
}

export default function AdminTenantsPage() {
  const { user, me } = useAuth();
  const authed = !!user;

  const dlg = useGlobalDialog();

  const [q, setQ] = useState("");
  const [plan, setPlan] = useState("");
  const [status, setStatus] = useState("");
  const [country, setCountry] = useState("");

  const [items, setItems] = useState<TenantRow[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const queryString = useMemo(() => {
    const p = new URLSearchParams();
    if (q.trim()) p.set("query", q.trim());
    if (plan) p.set("plan", plan);
    if (status) p.set("status", status);
    if (country) p.set("country", country);
    p.set("take", "30");
    return p.toString();
  }, [q, plan, status, country]);

  async function load() {
    if (!authed) return;
    setErr(null);
    setLoading(true);
    try {
      const r = await adminFetch<TenantsResponse>(`/tenants?${queryString}`);
      setItems(r.items);
      setCursor(r.nextCursor);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
    }
  }

  async function loadMore() {
    if (!authed || !cursor) return;
    setLoadingMore(true);
    try {
      const r = await adminFetch<TenantsResponse>(`/tenants?${queryString}&cursor=${cursor}`);
      setItems(prev => [...prev, ...r.items]);
      setCursor(r.nextCursor);
    } finally {
      setLoadingMore(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authed, queryString]);

  async function toggleActive(t: TenantRow) {
    if (!authed) return;
    const ok = await dlg.confirm(
      t.isActive ? "Deactivate this tenant?" : "Activate this tenant?",
      { title: "Admin", okText: t.isActive ? "Deactivate" : "Activate", cancelText: "Cancel" }
    );
    if (!ok) return;

    await adminFetch<{ ok: true }>(`/tenants/${t.id}/${t.isActive ? "deactivate" : "activate"}`, { method: "POST" });
    await load();
  }

  async function addCredits(t: TenantRow) {
    if (!authed) return;
    const amountStr = await dlg.alert?.("Add credits amount (integer):", { title: "Add credits" });
    const amount = Number(amountStr ?? "");
    if (!Number.isInteger(amount) || amount <= 0) return;

    await adminFetch(`/tenants/${t.id}/add-credits`, { method: "POST", body: { amount } });
    await load();
  }

  async function softDelete(t: TenantRow) {
    if (!authed) return;
    const ok = await dlg.confirm(
      "Soft delete tenant? (will deactivate and hide from lists)",
      { title: "Danger", okText: "Delete", cancelText: "Cancel" }
    );
    if (!ok) return;

    await adminFetch(`/tenants/${t.id}/delete-soft`, { method: "POST" });
    await load();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-3">
        <div>
          <div className="text-xl font-semibold text-slate-100">Tenants</div>
          <div className="text-xs text-slate-500 mt-1">Manage tenants, view assets and usage</div>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-3">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
          <input
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Search restaurant/name/email..."
            className="rounded-xl border border-slate-800 bg-slate-950/40 px-3 py-2 text-sm outline-none focus:border-slate-600"
          />
          <select value={plan} onChange={e => setPlan(e.target.value)} className="rounded-xl border border-slate-800 bg-slate-950/40 px-3 py-2 text-sm">
            <option value="">All plans</option>
            <option value="FREE">FREE</option>
            <option value="PRO">PRO</option>
            <option value="PRO_PLUS">PRO_PLUS</option>
          </select>
          <select value={status} onChange={e => setStatus(e.target.value)} className="rounded-xl border border-slate-800 bg-slate-950/40 px-3 py-2 text-sm">
            <option value="">All status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
          <input
            value={country}
            onChange={e => setCountry(e.target.value.toUpperCase())}
            placeholder="Country code (e.g., AZ)"
            className="rounded-xl border border-slate-800 bg-slate-950/40 px-3 py-2 text-sm outline-none focus:border-slate-600"
          />
        </div>
      </div>

      {err ? <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">{err}</div> : null}

      <div className="rounded-2xl border border-slate-800 bg-slate-950/40 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-950/60 text-slate-400">
              <tr>
                <th className="text-left px-3 py-2">Name</th>
                <th className="text-left px-3 py-2">Tenant</th>
                <th className="text-left px-3 py-2">Plan</th>
                <th className="text-left px-3 py-2">Credits</th>
                <th className="text-left px-3 py-2">Country</th>
                <th className="text-left px-3 py-2">Last activity</th>
                <th className="text-left px-3 py-2">Presets</th>
                <th className="text-left px-3 py-2">Styles</th>
                <th className="text-left px-3 py-2">Brand</th>
                <th className="text-left px-3 py-2">Generated</th>
                <th className="text-right px-3 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td className="px-3 py-4 text-slate-500" colSpan={10}>Loading…</td></tr>
              ) : items.length === 0 ? (
                <tr><td className="px-3 py-4 text-slate-500" colSpan={10}>No tenants</td></tr>
              ) : (
                items.map(t => (
                  <tr key={t.id} className="border-t border-slate-800">
                    <td className="px-3 py-3">
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <div className="text-slate-100 font-medium">{t.ownerName}</div>
                          <div className="text-[8px] text-slate-500">
                            {t.ownerEmail ?? "—"}
                          </div>
                        </div>
                        {t.isActive ? <Badge tone="green">active</Badge> : <Badge tone="red">inactive</Badge>}
                      </div>
                    </td>
                    <td className="px-3 py-3">{t.restaurantName}</td>
                    <td className="px-3 py-3"><Badge tone="orange">{t.plan}</Badge></td>
                    <td className="px-3 py-3 text-orange-300 font-semibold">{t.creditsBalance}</td>
                    <td className="px-3 py-3">{t.country ?? "—"}</td>
                    <td className="px-3 py-3 text-xs text-slate-400 text-[9px]">
                      {t.lastActivityAt ? new Date(t.lastActivityAt).toLocaleString() : "—"}
                    </td>

                    <td className="px-3 py-3">
                      <Link className="text-orange-300 hover:underline" href={`/admin/tenants/${t.id}?tab=assets&type=PRESET`}>
                        {t.qtyPresets}
                      </Link>
                    </td>
                    <td className="px-3 py-3">
                      <Link className="text-orange-300 hover:underline" href={`/admin/tenants/${t.id}?tab=assets&type=STYLE`}>
                        {t.qtyImageStyles}
                      </Link>
                    </td>
                    <td className="px-3 py-3">
                      <Link className="text-orange-300 hover:underline" href={`/admin/tenants/${t.id}?tab=assets&type=BRAND_STYLE`}>
                        {t.qtyBrandStyles}
                      </Link>
                    </td>
                    <td className="px-3 py-3">
                      <Link className="text-orange-300 hover:underline" href={`/admin/tenants/${t.id}?tab=assets&type=GENERATED`}>
                        {t.qtyGeneratedImages}
                      </Link>
                    </td>

                    <td className="px-3 py-3 text-right">
                      <div className="inline-flex gap-2">
                        <Link href={`/admin/tenants/${t.id}`} className="rounded-lg border border-slate-800 px-2 py-1 hover:border-slate-700">Open</Link>
                        <button onClick={() => void toggleActive(t)} className="rounded-lg border border-slate-800 px-2 py-1 hover:border-slate-700">
                          {t.isActive ? "Deactivate" : "Activate"}
                        </button>
                        <button onClick={() => void addCredits(t)} className="rounded-lg border border-slate-800 px-2 py-1 hover:border-slate-700">
                          +Credits
                        </button>
                        <button onClick={() => void softDelete(t)} className="rounded-lg border border-red-500/30 bg-red-500/10 px-2 py-1 hover:border-red-500/60">
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
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
  );
}
