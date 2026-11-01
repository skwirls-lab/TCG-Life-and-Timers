"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { z } from "zod";
import { getDb } from "@/lib/db";
import { applyTestHooks } from "@/state/testHooks";
import { useGameStore } from "@/state/gameStore";

/**
 * Pages outside the board (/tools, /tools/mana, /history) attach to the active game: apply the
 * test-only URL hooks, then resume the stored game when none is in memory.
 */
export function useGameBootstrap(): void {
  useEffect(() => {
    const started = applyTestHooks(new URLSearchParams(window.location.search));
    const st = useGameStore.getState();
    if (!started && !st.session && st.loadState === "idle") void st.resume().catch(() => false);
  }, []);
}

/** URL query param read after mount (avoids a Suspense boundary for useSearchParams). */
export function useQueryParam(name: string): string | null | undefined {
  const [v, setV] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    const read = () => setV(new URLSearchParams(window.location.search).get(name));
    const id = requestAnimationFrame(read);
    return () => cancelAnimationFrame(id);
  }, [name]);
  return v;
}

/**
 * Device-level value persisted in the Dexie `kv` table. `saved` turns true once the latest
 * value has been written (used by e2e before reloading).
 */
export function useKvValue<T>(key: string, fallback: T, schema: z.ZodType<T>) {
  const [value, setValue] = useState<T>(fallback);
  const [loaded, setLoaded] = useState(false);
  const [saved, setSaved] = useState(true);
  const rev = useRef(0);
  const current = useRef<T>(fallback);

  useEffect(() => {
    let alive = true;
    getDb()
      .kv.get(key)
      .then((row) => {
        if (!alive) return;
        const parsed = schema.safeParse(row?.value);
        if (parsed.success && rev.current === 0) {
          current.current = parsed.data;
          setValue(parsed.data);
        }
        setLoaded(true);
      })
      .catch(() => alive && setLoaded(true));
    return () => {
      alive = false;
    };
  }, [key, schema]);

  const set = useCallback(
    (next: T | ((prev: T) => T)) => {
      const v = typeof next === "function" ? (next as (p: T) => T)(current.current) : next;
      current.current = v;
      const mine = ++rev.current;
      setValue(v);
      setSaved(false);
      void getDb()
        .kv.put({ key, value: v })
        .catch((e: unknown) => console.warn("[tools] kv save failed", e))
        .finally(() => {
          if (rev.current === mine) setSaved(true);
        });
    },
    [key],
  );

  return { value, set, loaded, saved };
}
