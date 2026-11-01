"use client";
/**
 * Test-only timer config from the URL (`/play?quick=…&t.mode=bank&t.bankMs=600000`), applied with
 * TIMER_SET_CONFIG right after a quick start. Only in NEXT_PUBLIC_TEST_HOOKS=1 builds; documented
 * in tests/e2e/README.md.
 */
import { useGameStore } from "@/state/gameStore";
import { TEST_HOOKS_ENABLED } from "@/state/testHooksFlag";
import { parseTimerParams } from "./model";

export function applyTimerTestParams(search: URLSearchParams): void {
  if (!TEST_HOOKS_ENABLED || !search.get("quick")) return;
  const config = parseTimerParams(search);
  if (Object.keys(config).length === 0) return;
  useGameStore.getState().dispatch({ type: "TIMER_SET_CONFIG", config });
}
