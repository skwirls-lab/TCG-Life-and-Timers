"use client";
/** HIST-022 Decks list (art thumb, player, deck / commander, W/L) and deck detail. */
import { ChevronRight } from "lucide-react";
import { artToCss } from "@/features/backgrounds/gradients";
import type { ArtRef } from "@/engine";
import { t, tp } from "@/lib/i18n";
import type { GameRecord } from "@/lib/records";
import { deckDetail, deckRows, type DeckRow, type StatsOptions } from "@/lib/stats";
import { pctText } from "./format";
import { BackButton, BucketRow, Card, Empty, Locked, Section } from "./parts";

function Thumb({ row }: { row: DeckRow }) {
  return (
    <span
      aria-hidden
      className="size-12 shrink-0 rounded-xl border border-border"
      style={artToCss(row.art as ArtRef | undefined, row.color)}
    />
  );
}

function DeckItem({ row, onOpen }: { row: DeckRow; onOpen?: () => void }) {
  const body = (
    <>
      <Thumb row={row} />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-lg" data-testid="deck-name">
          {row.deckName}
        </span>
        <span className="truncate text-sm text-fg-muted">
          {row.playerName} · {tp("historyPast.players.games", row.games)} ·{" "}
          {t("historyPast.players.wl", { wins: row.wins, losses: row.losses })}
        </span>
      </span>
      <span className="text-xl font-semibold tabular">{pctText(row.winPct)}</span>
      {onOpen && <ChevronRight size={20} aria-hidden className="text-fg-subtle" />}
    </>
  );
  return (
    <li
      className="border-t border-border first:border-t-0"
      data-testid="deck-row"
      data-deck={row.key}
    >
      {onOpen ? (
        <button
          type="button"
          onClick={onOpen}
          className="flex min-h-16 w-full items-center gap-3 px-3 text-left"
        >
          {body}
        </button>
      ) : (
        <div className="flex min-h-16 w-full items-center gap-3 px-3">{body}</div>
      )}
    </li>
  );
}

export function DecksTab({
  records,
  opts,
  allowed,
  previewCount,
  onOpen,
}: {
  records: GameRecord[];
  opts: StatsOptions;
  allowed: boolean;
  previewCount: number;
  onOpen: (key: string) => void;
}) {
  const rows = deckRows(records, opts);
  if (rows.length === 0) {
    return (
      <div className="mt-3" data-testid="past-decks">
        <Empty text={t("historyPast.decks.empty")} testId="decks-empty" />
      </div>
    );
  }
  const free = allowed ? rows : rows.slice(0, previewCount);
  const locked = allowed ? [] : rows.slice(previewCount);
  return (
    <div className="mt-3" data-testid="past-decks">
      {!allowed && (
        <p className="mb-2 text-sm text-fg-muted">
          {t("historyPast.decks.preview", { count: previewCount })}
        </p>
      )}
      <ul className="overflow-hidden rounded-2xl bg-surface">
        {free.map((r) => (
          <DeckItem key={r.key} row={r} onOpen={allowed ? () => onOpen(r.key) : undefined} />
        ))}
      </ul>
      {locked.length > 0 && (
        <Locked allowed={false} testId="decks-locked">
          <ul className="overflow-hidden rounded-2xl bg-surface">
            {locked.slice(0, 4).map((r) => (
              <DeckItem key={r.key} row={r} />
            ))}
          </ul>
        </Locked>
      )}
    </div>
  );
}

export function DeckDetailView({
  records,
  deckKey,
  onBack,
}: {
  records: GameRecord[];
  deckKey: string;
  onBack: () => void;
}) {
  const d = deckDetail(records, deckKey);
  if (!d) {
    return (
      <div data-testid="past-deck-detail">
        <BackButton onClick={onBack} />
        <Empty text={t("historyPast.noMatch")} />
      </div>
    );
  }
  const damage = (title: string, list: typeof d.damageTo, testId: string) =>
    list.length > 0 && (
      <Section title={title} testId={testId}>
        <ul className="rounded-2xl bg-surface px-3">
          {list.slice(0, 5).map((x) => (
            <li
              key={x.identity}
              className="flex min-h-12 items-center border-t border-border first:border-t-0"
            >
              <span className="min-w-0 flex-1 truncate">{x.name}</span>
              <span className="font-semibold tabular">{x.amount}</span>
            </li>
          ))}
        </ul>
      </Section>
    );
  return (
    <div data-testid="past-deck-detail">
      <BackButton onClick={onBack} />
      <Card className="mt-2 flex items-center gap-3">
        <Thumb row={d.row} />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-xl font-semibold">{d.row.deckName}</h2>
          <p className="text-fg-muted">
            {d.row.playerName} · {tp("historyPast.players.games", d.row.games)} ·{" "}
            {t("historyPast.players.wl", { wins: d.row.wins, losses: d.row.losses })} ·{" "}
            {pctText(d.row.winPct)}
          </p>
        </div>
      </Card>
      <Section title={t("historyPast.pd.byPosition")} testId="dd-position">
        <ul className="rounded-2xl bg-surface px-3">
          {d.byPosition.map((b) => (
            <BucketRow
              key={b.key}
              b={b}
              label={
                b.key === "1"
                  ? t("historyPast.pd.first")
                  : t("historyPast.pd.position", { n: b.key })
              }
            />
          ))}
        </ul>
      </Section>
      <Section title={t("historyPast.dd.avgPlace")} testId="dd-place">
        <Card>
          <span className="text-2xl font-semibold tabular">
            {d.avgPlace === null ? "—" : d.avgPlace.toFixed(1)}
          </span>
        </Card>
      </Section>
      {damage(t("historyPast.dd.damageTo"), d.damageTo, "dd-to")}
      {damage(t("historyPast.dd.damageFrom"), d.damageFrom, "dd-from")}
    </div>
  );
}
