"use client";
/** T1.18 /history: Current Game | Past Games (PRD §12; LifeTap Game History baseline). */
import { useState } from "react";
import { PageShell, Segmented } from "@/components/ui";
import { useGameBootstrap } from "@/features/tools/hooks";
import { t } from "@/lib/i18n";
import { CurrentGamePanel } from "./CurrentGamePanel";
import { PastGamesPanel } from "./PastGamesSlot";

type Segment = "current" | "past";

export function HistoryPage() {
  useGameBootstrap();
  const [segment, setSegment] = useState<Segment>("current");
  return (
    <PageShell title={t("history.title")} backHref="/play" testId="history-page">
      <div className="mt-3">
        <Segmented
          label={t("history.segments")}
          value={segment}
          onChange={setSegment}
          testId="history-segment"
          options={[
            { value: "current", label: t("history.current") },
            { value: "past", label: t("history.past") },
          ]}
        />
      </div>
      <div
        role="tabpanel"
        aria-label={t(segment === "current" ? "history.current" : "history.past")}
      >
        {segment === "current" ? <CurrentGamePanel /> : <PastGamesPanel />}
      </div>
    </PageShell>
  );
}
