"use client";

import * as React from "react";

type PresetsBlockProps<T> = {
  title?: string;

  items: T[];

  loading?: boolean;
  error?: string | null;

  getId: (item: T) => string;
  renderCard: (item: T) => React.ReactNode;

  gap?: number; // px
  className?: string;
  maxHeightClassName?: string;

  layout?: "grid" | "masonry";

  // ✅ infinite scroll
  onEndReached?: () => void;
  hasMore?: boolean;
  loadingMore?: boolean;
  endReachedMarginPx?: number; // насколько заранее триггерить (rootMargin)
};

export function PresetsBlock<T>(props: PresetsBlockProps<T>) {
  const {
    items,
    loading,
    error,
    getId,
    renderCard,
    gap = 10,
    className,
    maxHeightClassName,
    layout = "grid",

    onEndReached,
    hasMore = false,
    loadingMore = false,
    endReachedMarginPx = 400,
  } = props;

  const scrollRootRef = React.useRef<HTMLDivElement | null>(null);
  const sentinelRef = React.useRef<HTMLDivElement | null>(null);

  // локальный предохранитель, чтобы не дёргать onEndReached по кругу, пока sentinel видим
  const firedRef = React.useRef(false);

  React.useEffect(() => {
  firedRef.current = false;
}, [items.length]);

  React.useEffect(() => {
  const rootEl = scrollRootRef.current;
  const sentinelEl = sentinelRef.current;
  if (!sentinelEl) return;

  if (!onEndReached) return;
  if (!hasMore) return;

  const useWindowRoot =
    !rootEl || rootEl.scrollHeight <= rootEl.clientHeight + 1;

  const io = new IntersectionObserver(
    (entries) => {
      const e = entries[0];
      if (!e?.isIntersecting) return;

      if (loading) return;
      if (loadingMore) return;
      if (!hasMore) return;

      if (firedRef.current) return;
      firedRef.current = true;

      onEndReached();
    },
    {
      root: useWindowRoot ? null : rootEl,
      rootMargin: `${endReachedMarginPx}px`,
      threshold: 0,
    }
  );

  io.observe(sentinelEl);
  return () => io.disconnect();
}, [onEndReached, hasMore, loading, loadingMore, endReachedMarginPx]);


  return (
    <div className={className ?? ""}>
      <div className="flex items-center gap-2 mb-2 px-5">
        {loading && <span className="text-xs text-slate-400">Loading…</span>}
        {error && <span className="text-xs text-red-400">{error}</span>}
      </div>

      <div
        ref={scrollRootRef}
        className={[
          "overflow-y-auto overflow-x-hidden",
          "scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent",
          maxHeightClassName ?? "",
        ].join(" ")}
      >
        {layout === "masonry" ? (
          <div className="p-2 columns-2" style={{ columnGap: gap }}>
            {items.map((it) => {
              const id = getId(it);
              return (
                <div
                  key={id}
                  className="break-inside-avoid mb-[var(--mb)]"
                  style={{ ["--mb" as unknown as string]: `${gap}px` }}
                >
                  {renderCard(it)}
                </div>
              );
            })}

            {items.length === 0 && !loading && !error && (
              <div className="text-sm text-slate-400 py-2 px-4">No templates</div>
            )}

            {/* ✅ sentinel всегда внизу контента */}
            <div ref={sentinelRef} className="h-1 w-full" />

            {loadingMore && (
              <div className="text-xs text-slate-400 px-3 py-2">Loading…</div>
            )}
          </div>
        ) : (
          <div className="p-2 grid grid-cols-2" style={{ gap }}>
            {items.map((it) => {
              const id = getId(it);
              return (
                <div key={id} className="min-w-0">
                  {renderCard(it)}
                </div>
              );
            })}

            {items.length === 0 && !loading && !error && (
              <div className="col-span-2 text-sm text-slate-400 p-3">
                No templates
              </div>
            )}

            <div ref={sentinelRef} className="col-span-2 h-1 w-full" />

            {loadingMore && (
              <div className="col-span-2 text-xs text-slate-400 px-3 py-2">
                Loading…
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
