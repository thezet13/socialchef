"use client";

export default function PlansAndPricesModal(props: { open: boolean; onClose: () => void }) {
  if (!props.open) return null;

  return (
    <div className="fixed inset-0 z-[60] bg-black/60 flex items-center justify-center p-4">
      <div className="w-full max-w-3xl rounded-2xl border border-slate-800 bg-slate-950 p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-lg font-semibold">Plans and prices</div>
            <div className="text-xs text-slate-500 mt-1">Compare features and choose the best plan.</div>
          </div>
          <button
            className="rounded-lg border border-slate-800 px-2 py-1 text-sm hover:bg-slate-900"
            onClick={props.onClose}
          >
            ✕
          </button>
        </div>

        <div className="mt-5 grid grid-cols-1 md:grid-cols-3 gap-3">
          <PlanCard title="Free" price="$0" items={["Limited AI", "Standard export", "Watermark"]} />
          <PlanCard title="Editor" price="$9" items={["No AI", "Upload images", "HD export", "No watermark"]} />
          <PlanCard title="Pro" price="$19" items={["AI image", "Presets", "HD export", "No limits"]} />
        </div>
      </div>
    </div>
  );
}

function PlanCard(props: { title: string; price: string; items: string[] }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/30 p-4">
      <div className="text-sm font-semibold">{props.title}</div>
      <div className="text-2xl font-semibold mt-1">{props.price}</div>
      <ul className="mt-3 space-y-1 text-sm text-slate-300">
        {props.items.map((x) => (
          <li key={x} className="flex gap-2">
            <span className="text-slate-500">•</span>
            <span>{x}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
