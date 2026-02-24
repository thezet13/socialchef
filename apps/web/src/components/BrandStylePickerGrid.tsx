import { Check, Eye, Trash2 } from "lucide-react";
import { useEffect, useRef } from "react";

type BrandStyleListItem = {
  id: string;
  name: string;
  sourceImageUrl: string;    // full image
  thumbnailUrl?: string | null;  // optional thumb
  scope?: "TENANT" | "SYSTEM";
};

type Props = {
  styles: BrandStyleListItem[];
  value?: string | null;
  onChange: (id: string) => void;
  onView?: (url: string) => void;
  onDelete?: (id: string) => void;

  hasMore?: boolean;
  isLoadingMore?: boolean;
  onLoadMore?: () => void;
};

export function BrandStylePickerGrid({ 
  styles, 
  value, 
  onChange, 
  onView, 
  onDelete,
  hasMore = false,
  isLoadingMore = false,
  onLoadMore,
 }: Props) {

    const sentinelRef = useRef<HTMLDivElement | null>(null);
  
    useEffect(() => {
      if (!onLoadMore || !hasMore) return;
  
      const el = sentinelRef.current;
      if (!el) return;
  
      const obs = new IntersectionObserver(
        (entries) => {
          const entry = entries[0];
          if (!entry?.isIntersecting) return;
          if (isLoadingMore) return;
          onLoadMore();
        },
        { root: null, rootMargin: "600px", threshold: 0 }
      );
  
      obs.observe(el);
      return () => obs.disconnect();
    }, [onLoadMore, hasMore, isLoadingMore]);
    
  return (
    <div className="grid grid-cols-2 md:grid-cols-2 gap-3">
      {styles.map((s) => {
        const selected = value === s.id;
        const img = s.thumbnailUrl || s.sourceImageUrl;

        return (
          <div
            role="button"
            key={s.id}
            tabIndex={0}
            onClick={() => onChange(s.id)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onChange(s.id);
              }
            }}
            className={[
              "group text-left rounded-2xl border overflow-hidden",
              "bg-slate-950/60 hover:bg-slate-950",
              "transition-colors",
              selected
                ? "border-blue-500/70 border-[2px] ring-3 ring-blue-500/30"
                : "border-slate-800 hover:border-slate-700",
            ].join(" ")}
          >
            <div className="relative">
              <div className="relative aspect-[4/3] bg-slate-900">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={img}
                  alt={s.name}
                  className="h-full w-full object-cover"
                  draggable={false}
                  loading="lazy"
                  decoding="async"
                />
              </div>

              {selected && (
                <div className="absolute top-2 left-2 text-white hidden rounded-full bg-emerald-400 text-black text-[10px] px-2 py-1 font-semibold">
                  <Check size="14" />
                </div>
              )}

              {onView ? (
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onView(s.sourceImageUrl); // full image in modal
                  }}
                  className="absolute z-10 top-1 right-1 rounded-xl border border-slate-800 bg-slate-950/70 p-1 text-slate-300 hover:text-slate-100"
                  title="View"
                >
                  <Eye size={14} />
                </button>
              ) : null}

              {s.scope === "TENANT" && onDelete ? (
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onDelete(s.id);
                  }}
                  className="absolute z-10 top-8 right-1 rounded-xl border border-slate-800 bg-slate-950/70 p-1 text-slate-300 hover:text-red-300"
                  title="Delete"
                >
                  <Trash2 size={14} />
                </button>
              ) : null}
            </div>

            <div className="p-3 relative">
              <div className="text-[11px] text-slate-100 leading-tight">{s.name}</div>
            </div>
          </div>
        );
      })}
      {onLoadMore ? (
        <div ref={sentinelRef} className="col-span-2 py-4 flex justify-center">
          {isLoadingMore ? <div className="text-xs text-slate-400">Loading…</div> : <div className="h-6" />}
        </div>
      ) : null}
    </div>
  );
}
