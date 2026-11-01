"use client";
import { useEffect, useRef } from "react";
import { ensureGameLoaded } from "@/features/setup/startGame";
import { applyTestHooks } from "@/state/testHooks";

/**
 * Page boot for shell pages: applies test-only URL hooks (test builds only) and, unless a
 * quick-start game was created, restores the active game from IndexedDB (GAME-016).
 */
export function usePageBoot(opts: { resume?: boolean } = {}): void {
  const done = useRef(false);
  const resume = opts.resume ?? true;
  useEffect(() => {
    if (done.current) return;
    done.current = true;
    const quick = applyTestHooks(new URLSearchParams(window.location.search));
    if (!quick && resume) {
      ensureGameLoaded().catch((e: unknown) => console.warn("[boot] resume failed", e));
    }
  }, [resume]);
}
