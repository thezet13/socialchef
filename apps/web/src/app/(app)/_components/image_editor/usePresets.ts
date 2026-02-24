import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  listPresets,
  getPreset,
  createPreset,
  deletePreset,
  renderPresetThumbnail,
  type PresetListItemDto,
} from "@/features/presets/presets.api";
import type { EditorPreset } from "@/features/presets/preset.editor.types";
import { getErrorMessage } from "@/lib/getErrorMessage";
import { useAuth } from "@/context/AuthContext";

type PresetsHook = {
  presets: PresetListItemDto[];
  presetsLoading: boolean;
  presetsLoadingMore: boolean;
  presetsHasMore: boolean;
  presetsError: string | null;
  presetsCursor: string | null;

  presetCounts: { system: number; mine: number; all: number };

  reloadPresets: () => Promise<void>;
  loadMorePresets: () => Promise<void>;

  fetchPreset: (id: string) => Promise<EditorPreset>;
  removePreset: (id: string) => Promise<void>;

  createAndRenderThumbnail: (body: unknown) => Promise<PresetListItemDto>;
  renderThumbnail: (presetId: string) => Promise<void>;

  setPresets: React.Dispatch<React.SetStateAction<PresetListItemDto[]>>;
};

export function usePresets(): PresetsHook {
  const [presets, setPresets] = useState<PresetListItemDto[]>([]);
  const [presetsLoading, setPresetsLoading] = useState(false);
  const [presetsLoadingMore, setPresetsLoadingMore] = useState(false);
  const [presetsError, setPresetsError] = useState<string | null>(null);

  const [presetsCursor, setPresetsCursor] = useState<string | null>(null);
  const [presetCounts, setPresetCounts] = useState({ system: 0, mine: 0, all: 0 });
  const [hasMore, setHasMore] = useState(true);

  const inFlightRef = useRef(false);

  const { user, me } = useAuth();
  const authed = !!user;

  const loadFirstPage = useCallback(async () => {
    if (!authed) return;
    if (inFlightRef.current) return;

    inFlightRef.current = true;
    setPresetsLoading(true);
    setPresetsError(null);

    try {
      const data = await listPresets({ take: 10 });

      setPresetCounts(data.counts ?? { system: 0, mine: 0, all: 0 });

      setPresets(data.items ?? []);
      setPresetsCursor(data.nextCursor ?? null);
      setHasMore(Boolean(data.nextCursor));
    } catch (e) {
      setPresetsError(getErrorMessage(e));
    } finally {
      inFlightRef.current = false;
      setPresetsLoading(false);
    }
  }, [authed]);


  const loadMorePresets = useCallback(async () => {
    if (!authed) return;
    if (!hasMore) return;
    if (!presetsCursor) return;
    if (inFlightRef.current) return;

    setPresetsLoadingMore(true);
    setPresetsError(null);
    inFlightRef.current = true;

    try {
      const data = await listPresets({ take: 10, cursor: presetsCursor });
      setPresets((prev) => {
        const seen = new Set(prev.map((x) => x.id));
        const merged = [...prev, ...(data.items ?? []).filter((x) => !seen.has(x.id))];
        return merged;
      });

      setPresetsCursor(data.nextCursor ?? null);
      setHasMore(Boolean(data.nextCursor));
    } catch (e) {
      setPresetsError(getErrorMessage(e));
    } finally {
      inFlightRef.current = false;
      setPresetsLoadingMore(false);
    }
  }, [authed, inFlightRef, presetsCursor, hasMore]);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!alive) return;
      await loadFirstPage();
    })();
    return () => {
      alive = false;
    };
  }, [loadFirstPage]);

  const reloadPresets = useCallback(async () => {
    await loadFirstPage();
  }, [loadFirstPage]);

  const fetchPreset = useCallback(
    async (id: string) => {
      if (!authed) throw new Error("Not authorized");
      return await getPreset(id);
    },
    [authed]
  );

  const removePreset = useCallback(
    async (id: string) => {
      if (!authed) throw new Error("Not authorized");

      const prev = presets;
      setPresets((p) => p.filter((x) => x.id !== id));

      try {
        await deletePreset(id);
      } catch (e) {
        setPresets(prev);
        throw e;
      }
      await reloadPresets();
    },
    [authed, presets]
  );

  const renderThumbnail = useCallback(
    async (presetId: string) => {
      if (!authed) throw new Error("Not authorized");
      await renderPresetThumbnail(presetId);
    },
    [authed]
  );

  const createAndRenderThumbnail = useCallback(
    async (body: unknown) => {
      if (!authed) throw new Error("Not authorized");

      const created = await createPreset(body);
      await renderPresetThumbnail(created.id);

      // важный момент: если список теперь постраничный — просто перегружаем первую страницу
      await reloadPresets();

      return created;
    },
    [authed, reloadPresets]
  );

  return useMemo(
    () => ({
      presets,
      presetsLoading,
      presetsLoadingMore,
      presetsHasMore: hasMore,
      presetsError,
      presetsCursor,
      presetCounts,
      reloadPresets,
      loadMorePresets,
      fetchPreset,
      removePreset,
      createAndRenderThumbnail,
      renderThumbnail,
      setPresets,
    }),
    [
      presets,
      presetsLoading,
      presetsLoadingMore,
      hasMore,
      presetsError,
      presetsCursor,
      presetCounts,
      reloadPresets,
      loadMorePresets,
      fetchPreset,
      removePreset,
      createAndRenderThumbnail,
      renderThumbnail,
    ]
  );
}
