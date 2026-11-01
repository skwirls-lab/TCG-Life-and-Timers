"use client";
/**
 * Dev/test harness for Past Games and the Who-won flow (test builds only; not user-facing copy).
 *   ?fixtures=1          replace the stored records with the 26 stats fixtures
 *   ?policy=tiered       entitlement policy TIERED (free user) — also a toggle button
 *   ?who=always|never    Who-won setting override (default: the app setting, "unclear")
 *   plus the usual test hooks (quick=…, players=…, names=…, seed=…)
 */
import { useEffect, useState } from "react";
import { Button } from "@/components/ui";
import { PastGamesPanel } from "@/features/history-past/PastGamesPanel";
import { WhoWonHost } from "@/features/history-past/WhoWonPrompt";
import { requestReset } from "@/features/history-past/whoWon";
import { useRecords } from "@/features/history-past/useRecords";
import { getDb } from "@/lib/db";
import { useEntitlements } from "@/lib/entitlements/store";
import type { WhoWonSetting } from "@/lib/records";
import { FIXTURE_RECORDS } from "@/lib/stats/fixtures";
import { useGameStore } from "@/state/gameStore";
import { recordKeeperIdle, startRecordKeeper } from "@/state/recordKeeper";
import { applyTestHooks } from "@/state/testHooks";

declare global {
  interface Window {
    __tcgRecordsIdle?: () => Promise<void>;
  }
}

function whoParam(): WhoWonSetting | undefined {
  const w = new URLSearchParams(window.location.search).get("who");
  return w === "always" || w === "unclear" || w === "never" ? w : undefined;
}

export function HistoryHarness() {
  const [ready, setReady] = useState(false);
  const policy = useEntitlements((s) => s.policy);
  const setPolicy = useEntitlements((s) => s.setPolicy);
  const game = useGameStore((s) => s.session?.game);
  const records = useRecords();

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    startRecordKeeper(useGameStore);
    window.__tcgRecordsIdle = recordKeeperIdle;
    if (q.get("policy") === "tiered") useEntitlements.getState().setPolicy("TIERED");
    const quick = applyTestHooks(q);
    const boot = async () => {
      if (q.get("fixtures") === "1") {
        const db = getDb();
        await db.records.clear();
        await db.records.bulkPut(FIXTURE_RECORDS.map((r) => ({ ...r })));
      }
      if (!quick && !useGameStore.getState().session) await useGameStore.getState().resume();
    };
    void boot().finally(() => setReady(true));
  }, []);

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-3 p-4" data-testid="history-harness">
      <h1 className="text-xl">History harness</h1>
      <p data-testid="harness-ready">{ready ? "ready" : "booting"}</p>
      <p data-testid="harness-records">{records?.length ?? 0}</p>
      <p data-testid="harness-game">{game ? `${game.id} ${game.status}` : "none"}</p>
      <div className="flex flex-wrap gap-2">
        <Button
          data-testid="harness-reset"
          onClick={() =>
            void requestReset({
              game: useGameStore.getState().session?.game,
              setting: whoParam(),
              proceed: () => useGameStore.getState().dispatch({ type: "RESET_GAME" }),
            })
          }
        >
          Reset via requestReset
        </Button>
        <Button
          data-testid="harness-policy"
          onClick={() => setPolicy(policy === "TIERED" ? "ALL_FREE" : "TIERED")}
        >
          Policy: {policy}
        </Button>
      </div>
      <PastGamesPanel />
      <WhoWonHost />
    </main>
  );
}
