"use client";
/**
 * Past Games (PRD §12.2): sub-tabs Games · Players · Decks · Insights, a Filter bar with chips
 * and Export (⤓). Free-tier gating per §17.2 through `useCan` / `useLimit` (all free today).
 */
import { useMemo, useState } from "react";
import { Download, History, SlidersHorizontal } from "lucide-react";
import { IconButton, Tabs } from "@/components/ui";
import { t } from "@/lib/i18n";
import { useCan, useLimit } from "@/lib/entitlements/store";
import { applyFilter, freeTierFilter, identityNames, type RecordFilter } from "@/lib/stats";
import { cn } from "@/lib/ui/cn";
import { DeckDetailView, DecksTab } from "./DecksTab";
import { ExportSheet } from "./ExportSheet";
import { FilterChips, FilterSheet } from "./FilterSheet";
import { gameNumbers } from "./format";
import { GameDetail } from "./GameDetail";
import { GamesTab } from "./GamesTab";
import { InsightsTab } from "./InsightsTab";
import { PlayerDetailView, PlayersTab } from "./PlayersTab";
import { useRecords } from "./useRecords";

type Tab = "games" | "players" | "decks" | "insights";
type Detail =
  { kind: "game"; id: string } | { kind: "player"; id: string } | { kind: "deck"; id: string };

export function PastGamesPanel() {
  const all = useRecords();
  const [tab, setTab] = useState<Tab>("games");
  const [detail, setDetail] = useState<Detail | null>(null);
  const [filter, setFilter] = useState<RecordFilter>({});
  const [sheet, setSheet] = useState<"filter" | "export" | null>(null);

  const canFilter = useCan("historyFiltersAll");
  const canPlayerDetail = useCan("historyPlayerDetail");
  const canDecks = useCan("historyDecks");
  const canInsights = useCan("historyInsightsFull");
  const canExport = useCan("historyExport");
  const visibleLimit = useLimit("historyVisibleGames");
  const deckPreview = useLimit("decksPreview");

  const applied = useMemo(() => (canFilter ? filter : freeTierFilter(filter)), [canFilter, filter]);
  const records = useMemo(() => applyFilter(all ?? [], applied), [all, applied]);
  const numbers = useMemo(() => gameNumbers(all ?? []), [all]);
  const names = useMemo(() => identityNames(all ?? []), [all]);
  const opts = { includeDefaultNames: applied.includeDefaultNames === true };
  // HIST-007: stats only use the games a free user can view (the most recent N).
  const viewable = Number.isFinite(visibleLimit) ? records.slice(0, visibleLimit) : records;

  if (all === null) {
    return (
      <p className="mt-10 text-center text-fg-muted" data-testid="past-loading">
        {t("historyPast.loading")}
      </p>
    );
  }
  if (all.length === 0) {
    return (
      <div className="mt-10 flex flex-col items-center gap-3 text-center" data-testid="past-games">
        <History size={40} aria-hidden className="text-fg-muted" />
        <p className="text-xl" data-testid="past-empty">
          {t("historyPast.empty")}
        </p>
        <p className="max-w-xs text-fg-muted">{t("historyPast.emptyHint")}</p>
      </div>
    );
  }

  const record = detail?.kind === "game" ? all.find((r) => r.id === detail.id) : undefined;
  const back = () => setDetail(null);

  let body;
  if (detail?.kind === "game" && record) {
    body = <GameDetail record={record} number={numbers.get(record.id) ?? 0} onBack={back} />;
  } else if (detail?.kind === "player") {
    body = (
      <PlayerDetailView
        records={viewable}
        identity={detail.id}
        opts={opts}
        allowed={canPlayerDetail}
        onBack={back}
      />
    );
  } else if (detail?.kind === "deck") {
    body = <DeckDetailView records={viewable} deckKey={detail.id} onBack={back} />;
  } else {
    body = (
      <>
        <div className="mt-3 flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <Tabs
              label={t("historyPast.tabs")}
              value={tab}
              onChange={setTab}
              testId="past-tabs"
              tabs={[
                { value: "games", label: t("historyPast.tab.games") },
                { value: "players", label: t("historyPast.tab.players") },
                { value: "decks", label: t("historyPast.tab.decks") },
                { value: "insights", label: t("historyPast.tab.insights") },
              ]}
            />
          </div>
          <IconButton
            label={t("historyPast.filter")}
            onClick={() => setSheet("filter")}
            data-testid="past-filter"
            className={cn(Object.keys(filter).length > 0 && "text-accent")}
          >
            <SlidersHorizontal size={22} aria-hidden />
          </IconButton>
          <IconButton
            label={t("historyPast.export")}
            onClick={() => setSheet("export")}
            data-testid="past-export"
          >
            <Download size={22} aria-hidden />
          </IconButton>
        </div>
        <FilterChips value={filter} names={names} onChange={setFilter} />
        {records.length === 0 ? (
          <p className="mt-8 text-center text-fg-muted" data-testid="past-no-match">
            {t("historyPast.noMatch")}
          </p>
        ) : (
          <div role="tabpanel" aria-label={t(`historyPast.tab.${tab}`)}>
            {tab === "games" && (
              <GamesTab
                records={records}
                numbers={numbers}
                limit={visibleLimit}
                onOpen={(id) => setDetail({ kind: "game", id })}
              />
            )}
            {tab === "players" && (
              <PlayersTab
                records={viewable}
                opts={opts}
                onToggleDefaults={(v) => setFilter((f) => ({ ...f, includeDefaultNames: v }))}
                onOpen={(id) => setDetail({ kind: "player", id })}
              />
            )}
            {tab === "decks" && (
              <DecksTab
                records={viewable}
                opts={opts}
                allowed={canDecks}
                previewCount={deckPreview}
                onOpen={(id) => setDetail({ kind: "deck", id })}
              />
            )}
            {tab === "insights" && (
              <InsightsTab records={viewable} opts={opts} allowed={canInsights} />
            )}
          </div>
        )}
      </>
    );
  }

  return (
    <div data-testid="past-games">
      {body}
      {sheet === "filter" && (
        <FilterSheet
          records={all}
          value={filter}
          allowAll={canFilter}
          onApply={setFilter}
          onClose={() => setSheet(null)}
        />
      )}
      {sheet === "export" && (
        <ExportSheet records={records} allowed={canExport} onClose={() => setSheet(null)} />
      )}
    </div>
  );
}
