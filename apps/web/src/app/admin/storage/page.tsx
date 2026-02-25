"use client";

import { useEffect, useMemo, useState } from "react";
import { adminFetch } from "@/lib/adminApi";

type Overview = {
  activeCount: number;
  deletedPending: number;
  purgedCount: number;
  activeBytes: number;
  deletedBytes: number;
};

type PreviewAssetRow = {
  id: string;
  tenantId: string;
  tenantName: string | null;
  ownerEmail: string | null;
  ownerName: string | null;
  kind: string;
  bytes: number | null;
  storagePath: string;
  createdAt: string;
  lastUsedAt: string | null;
};

type TenantAggRow = {
  tenantId: string;
  tenantName: string;
  ownerEmail: string;
  count: number;
  bytes: number;
};

type InactiveTenantsResult =
  | { skipped: true }
  | { processed: number; deactivated: number; purgedAssets?: number };

function isSkippedInactiveTenants(
  v: InactiveTenantsResult | undefined
): v is { skipped: true } {
  return !!v && typeof v === "object" && "skipped" in v;
}

type RetentionResult = {
  tookMs?: number;
  preview?: {
    deleted?: number;
  };
  exportHistory?: {
    deleted?: number;
    assetsMarkedDeleted?: number;
  };
  orphan?: {
    markedDeleted?: number;
  };
  purgedDeleted?: {
    purged?: number;
  };
  inactiveTenants?: InactiveTenantsResult;
};

type RetentionResponse = {
  opts: {
    previewTtlHours: number;
    orphanAfterDays: number;
    purgeDeletedBatch: number;
    runInactiveTenantsPurge: boolean;
  };
  result: RetentionResult;
  pendingDeleted?: PreviewAssetRow[];
  orphanCandidates?: PreviewAssetRow[];
  pendingByTenant?: TenantAggRow[];
  orphanByTenant?: TenantAggRow[];
};

export default function AdminFilesPage() {
  const [overview, setOverview] = useState<Overview | null>(null);

  const [loadingPreview, setLoadingPreview] = useState(false);
  const [loadingRun, setLoadingRun] = useState(false);

  const [preview, setPreview] = useState<RetentionResponse | null>(null);
  const [runResult, setRunResult] = useState<RetentionResponse | null>(null);

  async function reloadOverview() {
    const o = await adminFetch<Overview>("/files/overview");
    setOverview(o);
  }

  useEffect(() => {
    void reloadOverview();
  }, []);

  async function doPreview() {
    setLoadingPreview(true);
    try {
      const r = await adminFetch<RetentionResponse>("/files/retention/preview", {
        method: "POST",
        body: {
          previewTtlHours: 24,
          orphanAfterDays: 14,
          purgeDeletedBatch: 500,
          runInactiveTenantsPurge: false,
        },
      });
      setPreview(r);
    } finally {
      setLoadingPreview(false);
    }
  }

  async function doRun() {
    setLoadingRun(true);
    try {
      const r = await adminFetch<RetentionResponse>("/files/retention/run", {
        method: "POST",
        body: {
          previewTtlHours: 24,
          orphanAfterDays: 14,
          purgeDeletedBatch: 500,
          runInactiveTenantsPurge: false,
        },
      });
      setRunResult(r);
      await reloadOverview();
    } finally {
      setLoadingRun(false);
    }
  }

  const pendingTop = useMemo(() => (preview?.pendingByTenant ?? []).slice(0, 10), [preview?.pendingByTenant]);
  const orphanTop = useMemo(() => (preview?.orphanByTenant ?? []).slice(0, 10), [preview?.orphanByTenant]);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xl font-semibold text-slate-100">Files & Retention</div>
          <div className="text-xs text-slate-500 mt-1">
            Preview = dry-run (no DB/fs changes). Run = real cleanup (may delete files).
          </div>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => void doPreview()}
            disabled={loadingPreview}
            className="rounded-xl px-3 py-2 text-sm border border-slate-800 bg-slate-950/30 hover:border-slate-700 disabled:opacity-50"
          >
            {loadingPreview ? "Previewing…" : "Preview retention (dry-run)"}
          </button>

          <button
            onClick={() => {
              const ok = confirm("Run retention now? This can delete files and mark/purge assets.");
              if (ok) void doRun();
            }}
            disabled={loadingRun}
            className="rounded-xl px-3 py-2 text-sm border border-orange-500/40 bg-orange-500/10 text-slate-100 hover:border-orange-500/70 disabled:opacity-50"
          >
            {loadingRun ? "Running…" : "Run retention now"}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card label="Active assets" value={overview?.activeCount} />
        <Card label="Deleted (pending)" value={overview?.deletedPending} />
        <Card label="Purged" value={overview?.purgedCount} />
        <Card label="Active bytes" value={formatBytes(overview?.activeBytes ?? 0)} />
        <Card label="To delete bytes" value={formatBytes(overview?.deletedBytes ?? 0)} />
      </div>

      {preview ? (
        <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4 space-y-4">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold text-slate-100">Dry-run report</div>
            <div className="text-xs text-slate-500">took: {preview.result?.tookMs ?? "—"} ms</div>
          </div>

          <ReportGrid data={preview.result} />

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <TenantAgg title="Pending deleted (by tenant)" rows={pendingTop} />
            <TenantAgg title="Orphan candidates (by tenant)" rows={orphanTop} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <AssetsTable title="Pending deleted assets (sample)" rows={(preview.pendingDeleted ?? []).slice(0, 30)} />
            <AssetsTable title="Orphan candidates (sample)" rows={(preview.orphanCandidates ?? []).slice(0, 30)} />
          </div>
        </div>
      ) : null}

      {runResult ? (
        <div className="rounded-2xl border border-orange-500/30 bg-orange-500/10 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold text-slate-100">Last run report</div>
            <div className="text-xs text-slate-500">took: {runResult.result?.tookMs ?? "—"} ms</div>
          </div>
          <ReportGrid data={runResult.result} />
        </div>
      ) : null}
    </div>
  );
}

function Card({ label, value }: { label: string; value: string | number | undefined | null }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="text-lg font-semibold text-orange-300 mt-1">{value ?? "—"}</div>
    </div>
  );
}

function formatBytes(bytes: number) {
  if (!bytes) return "0 B";
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), sizes.length - 1);
  return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${sizes[i]}`;
}

function ReportGrid({ data }: { data: RetentionResult }) {
  const inactive =
    isSkippedInactiveTenants(data.inactiveTenants)
      ? "skipped"
      : data.inactiveTenants
      ? JSON.stringify(data.inactiveTenants)
      : undefined;

  const items: Array<[string, React.ReactNode]> = [
    ["preview.deleted", data.preview?.deleted],
    ["exportHistory.deleted", data.exportHistory?.deleted],
    ["exportHistory.assetsMarkedDeleted", data.exportHistory?.assetsMarkedDeleted],
    ["orphan.markedDeleted", data.orphan?.markedDeleted],
    ["purgedDeleted.purged", data.purgedDeleted?.purged],
    ["inactiveTenants", inactive],
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
      {items.map(([k, v]) => (
        <div key={k} className="rounded-xl border border-slate-800 bg-slate-950/30 px-3 py-2">
          <div className="text-[11px] text-slate-500">{k}</div>
          <div className="text-sm text-slate-200 mt-1">{v ?? "—"}</div>
        </div>
      ))}
    </div>
  );
}

function TenantAgg({ title, rows }: { title: string; rows: TenantAggRow[] }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-950/30 p-3">
      <div className="text-sm font-semibold text-slate-100">{title}</div>
      <div className="mt-2 space-y-2">
        {!rows.length ? <div className="text-xs text-slate-500">No data</div> : null}
        {rows.map(r => (
          <div key={r.tenantId} className="rounded-xl border border-slate-800 px-3 py-2">
            <div className="text-sm text-slate-200 truncate">{r.tenantName}</div>
            <div className="text-xs text-slate-500 truncate">{r.ownerEmail}</div>
            <div className="text-xs text-slate-400 mt-1">
              {r.count} files • <span className="text-orange-300 font-semibold">{formatBytes(r.bytes)}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function AssetsTable({ title, rows }: { title: string; rows: PreviewAssetRow[] }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-950/30 p-3">
      <div className="text-sm font-semibold text-slate-100">{title}</div>
      <div className="mt-2 space-y-2 max-h-[520px] overflow-auto pr-1">
        {!rows.length ? <div className="text-xs text-slate-500">No rows</div> : null}
        {rows.map(a => (
          <div key={a.id} className="rounded-xl border border-slate-800 px-3 py-2">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm text-slate-200 truncate">{a.tenantName ?? a.tenantId}</div>
                <div className="text-xs text-slate-500 truncate">{a.ownerEmail ?? "—"}</div>
              </div>
              <div className="text-xs text-orange-300 font-semibold">{formatBytes(a.bytes ?? 0)}</div>
            </div>
            <div className="text-[11px] text-slate-500 mt-1 truncate">
              {a.kind} • {a.storagePath}
            </div>
            <div className="text-[11px] text-slate-500 mt-1">
              created: {new Date(a.createdAt).toLocaleString()}
              {a.lastUsedAt ? ` • lastUsed: ${new Date(a.lastUsedAt).toLocaleString()}` : ""}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}