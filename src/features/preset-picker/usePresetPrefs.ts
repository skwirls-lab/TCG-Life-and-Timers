"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { getDb } from "@/lib/db";
import { FAVORITES_KEY, idList, pushRecent, RECENT_KEY, toggleFavorite } from "./model";

/** A device-level id list in the Dexie `kv` table. `saved` is false while a write is pending. */
function useIdList(key: string) {
  const [ids, setIds] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [pending, setPending] = useState(0);
  const current = useRef<string[]>([]);
  const touched = useRef(false);

  useEffect(() => {
    let alive = true;
    getDb()
      .kv.get(key)
      .then((row) => {
        if (!alive || touched.current) return;
        current.current = idList(row?.value);
        setIds(current.current);
      })
      .catch(() => undefined)
      .finally(() => alive && setLoaded(true));
    return () => {
      alive = false;
    };
  }, [key]);

  const update = useCallback(
    (fn: (prev: string[]) => string[]) => {
      touched.current = true;
      const next = fn(current.current);
      current.current = next;
      setIds(next);
      setPending((n) => n + 1);
      void getDb()
        .kv.put({ key, value: next })
        .catch((e: unknown) => console.warn("[presets] kv save failed", e))
        .finally(() => setPending((n) => n - 1));
    },
    [key],
  );

  return { ids, update, loaded, saved: pending === 0 };
}

/** Recent (kv `presets.recent`) and favorite (kv `presets.favorites`) preset ids. */
export function usePresetPrefs() {
  const recent = useIdList(RECENT_KEY);
  const favorites = useIdList(FAVORITES_KEY);
  const { update: updateRecent } = recent;
  const { update: updateFavorites } = favorites;
  const addRecent = useCallback(
    (id: string) => updateRecent((l) => pushRecent(l, id)),
    [updateRecent],
  );
  const toggleFav = useCallback(
    (id: string) => updateFavorites((l) => toggleFavorite(l, id)),
    [updateFavorites],
  );
  return {
    recent: recent.ids,
    favorites: favorites.ids,
    addRecent,
    toggleFavorite: toggleFav,
    loaded: recent.loaded && favorites.loaded,
    saved: recent.saved && favorites.saved,
  };
}

/** Record a preset as recently used (e.g. when a game starts) without rendering the picker. */
export async function rememberPresetUse(id: string): Promise<void> {
  const db = getDb();
  const row = await db.kv.get(RECENT_KEY);
  await db.kv.put({ key: RECENT_KEY, value: pushRecent(idList(row?.value), id) });
}
