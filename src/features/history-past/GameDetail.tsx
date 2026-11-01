"use client";
/**
 * HIST-020 Game detail: read-only standings, event log and life chart of a past game (reusing the
 * current-game formatters and chart with the decoded snapshot), Rematch with same setup, Edit
 * (HIST-035: winner, names, deck) and Delete.
 */
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Pencil, RotateCcw, Skull, Trash2, Trophy } from "lucide-react";
import { Button, Segmented, Sheet, useSnackbar } from "@/components/ui";
import { GameIcon } from "@/components/icons/GameIcon";
import type { Game, NewGameConfig } from "@/engine";
import { LifeChart } from "@/features/history-current/LifeChart";
import {
  formatClock,
  formatEventRow,
  groupEvents,
  type EventRowView,
  type Tone,
} from "@/features/history-current/format";
import { startNewGame } from "@/features/setup/startGame";
import { getAnyPreset } from "@/lib/customPresets";
import { t } from "@/lib/i18n";
import {
  decodeLog,
  deleteRecord,
  updateRecord,
  type GameRecord,
  type RecordEdit,
} from "@/lib/records";
import { cn } from "@/lib/ui/cn";
import { useGameStore } from "@/state/gameStore";
import { causeText, dateText, durationText, outcomeText } from "./format";
import { BackButton, Card, Section } from "./parts";
import { requestReset } from "./whoWon";

const CHIP: Record<Tone, string> = {
  loss: "bg-danger text-black",
  gain: "bg-success text-black",
  poison: "bg-poison text-black",
  commander: "bg-commander text-black",
  timer: "bg-timer text-black",
  neutral: "bg-surface-3 text-fg",
};

function Row({ row }: { row: EventRowView }) {
  return (
    <div
      className={cn(
        "flex min-h-12 items-center gap-2 px-3 py-1",
        row.variant === "event" && "italic",
      )}
      data-testid="past-log-row"
    >
      <span
        aria-hidden
        className="size-3 shrink-0 rounded-full border border-border"
        style={{ background: row.color ?? "transparent" }}
      />
      <span className="min-w-0 flex-1 truncate">{row.label}</span>
      <GameIcon id={row.icon} size={20} className="shrink-0 text-fg-muted" />
      {row.chip && (
        <span
          className={cn(
            "shrink-0 rounded-lg px-2 py-0.5 text-sm font-bold tabular not-italic",
            CHIP[row.chip.tone],
          )}
        >
          {row.chip.text}
        </span>
      )}
      {row.value && <span className="shrink-0 tabular text-fg-muted">{row.value}</span>}
      <span className="shrink-0 text-xs text-fg-subtle tabular">{formatClock(row.at)}</span>
    </div>
  );
}

function ReadOnlyLog({ game }: { game: Game }) {
  const groups = groupEvents(game.log);
  return (
    <ul className="mt-3 flex flex-col gap-1.5" data-testid="past-log">
      {groups.map((g) => (
        <li
          key={g.event.id}
          className={cn(
            "overflow-hidden rounded-2xl bg-surface",
            g.linked.length > 0 && "border-l-4 border-commander",
          )}
        >
          {[g.event, ...g.linked].map((e, i) => (
            <div key={e.id} className={cn(i > 0 && "border-t border-border/60")}>
              <Row row={formatEventRow(e, game)} />
            </div>
          ))}
        </li>
      ))}
    </ul>
  );
}

/** "Rematch with same setup": the snapshot's config, else the preset + stored config. */
export async function rematchConfig(
  r: GameRecord,
  snapshot: Game | null,
): Promise<NewGameConfig | null> {
  if (snapshot) {
    return {
      preset: snapshot.preset,
      seats: snapshot.seats.map((s) => ({
        id: s.id,
        name: s.name,
        profileId: s.profileId,
        deckId: s.deckId,
        deckName: s.deckName,
        commanders: s.commanders,
        art: s.art,
        color: s.color,
        rotationOverride: s.rotationOverride,
        contrast: s.contrast,
      })),
      layoutId: snapshot.layoutId,
      options: snapshot.options,
      timer: snapshot.timer.config,
      startOverrides: snapshot.startOverrides,
      thresholdOverrides: snapshot.thresholdOverrides,
      perSeatStart: snapshot.perSeatStart,
      perSeatThreshold: snapshot.perSeatThreshold,
      enabledCounters: snapshot.enabledCounters,
    };
  }
  const preset = await getAnyPreset(r.presetId);
  if (!preset) return null;
  const c = r.config;
  return {
    preset,
    seats: r.players.map((p) => ({
      id: p.seatId,
      name: p.name,
      profileId: p.profileId,
      deckId: p.deckId,
      deckName: p.deckName,
      commanders: p.commanders,
      color: p.color,
      art: p.art,
    })),
    ...(c
      ? {
          layoutId: c.layoutId,
          options: c.options,
          timer: c.timer,
          startOverrides: c.startOverrides,
          thresholdOverrides: c.thresholdOverrides,
          perSeatStart: c.perSeatStart,
          perSeatThreshold: c.perSeatThreshold,
          enabledCounters: c.enabledCounters,
        }
      : {}),
  };
}

function EditSheet({ record, onClose }: { record: GameRecord; onClose: () => void }) {
  const show = useSnackbar((s) => s.show);
  const initial = record.winners[0] ?? (record.outcome === "draw" ? "draw" : "none");
  const [winner, setWinner] = useState<string>(initial);
  const [names, setNames] = useState<Record<string, string>>(
    Object.fromEntries(record.players.map((p) => [p.seatId, p.name])),
  );
  const [decks, setDecks] = useState<Record<string, string>>(
    Object.fromEntries(record.players.map((p) => [p.seatId, p.deckName ?? ""])),
  );
  const save = async () => {
    const edit: RecordEdit = { names };
    if (winner === "draw") Object.assign(edit, { winners: [], outcome: "draw" });
    else if (winner === "none") Object.assign(edit, { winners: [], outcome: "none" });
    else edit.winners = [winner];
    edit.decks = {};
    for (const p of record.players) {
      const name = decks[p.seatId]?.trim() ?? "";
      if (name !== (p.deckName ?? "")) {
        edit.decks[p.seatId] = name
          ? { ...(p.deckId ? { deckId: p.deckId } : {}), deckName: name }
          : {};
      }
    }
    await updateRecord(record.id, edit);
    show({ message: t("historyPast.edit.saved") });
    onClose();
  };
  const options = [
    ...record.players.map((p) => ({ value: p.seatId, label: p.name })),
    { value: "draw", label: t("historyPast.who.draw") },
    { value: "none", label: t("historyPast.who.none") },
  ];
  return (
    <Sheet open onClose={onClose} title={t("historyPast.edit.title")} testId="edit-game">
      <fieldset>
        <legend className="mb-2 text-fg-muted">{t("historyPast.edit.winner")}</legend>
        <div
          className="flex flex-wrap gap-2"
          role="radiogroup"
          aria-label={t("historyPast.edit.winner")}
        >
          {options.map((o) => (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={winner === o.value}
              onClick={() => setWinner(o.value)}
              data-testid={`edit-winner-${o.value}`}
              className={cn(
                "min-h-12 rounded-full px-4",
                winner === o.value ? "bg-surface-3 ring-2 ring-accent" : "bg-surface-2",
              )}
            >
              {o.label}
            </button>
          ))}
        </div>
      </fieldset>
      <div className="mt-4 flex flex-col gap-3">
        {record.players.map((p, i) => (
          <div key={p.seatId} className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1 text-sm text-fg-muted">
              {t("historyPast.edit.name", { n: i + 1 })}
              <input
                value={names[p.seatId] ?? ""}
                maxLength={40}
                onChange={(e) => setNames((s) => ({ ...s, [p.seatId]: e.target.value }))}
                className="min-h-12 rounded-xl bg-surface-2 px-3 text-base text-fg"
                data-testid={`edit-name-${i}`}
              />
            </label>
            <label className="flex flex-col gap-1 text-sm text-fg-muted">
              {t("historyPast.edit.deck", { n: i + 1 })}
              <input
                value={decks[p.seatId] ?? ""}
                maxLength={60}
                onChange={(e) => setDecks((s) => ({ ...s, [p.seatId]: e.target.value }))}
                className="min-h-12 rounded-xl bg-surface-2 px-3 text-base text-fg"
                data-testid={`edit-deck-${i}`}
              />
            </label>
          </div>
        ))}
      </div>
      <p className="mt-3 text-sm text-fg-muted">{t("historyPast.edit.hint")}</p>
      <Button
        className="mt-3"
        block
        variant="primary"
        onClick={() => void save()}
        data-testid="edit-save"
      >
        {t("historyPast.edit.save")}
      </Button>
    </Sheet>
  );
}

interface Props {
  record: GameRecord;
  number: number;
  onBack: () => void;
}

export function GameDetail({ record: r, number, onBack }: Props) {
  const router = useRouter();
  const show = useSnackbar((s) => s.show);
  const [snapshot, setSnapshot] = useState<Game | null | undefined>(undefined);
  const [view, setView] = useState<"list" | "chart">("list");
  const [confirm, setConfirm] = useState(false);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    let alive = true;
    void decodeLog(r.log).then((g) => alive && setSnapshot(g));
    return () => {
      alive = false;
    };
  }, [r.log]);

  const players = [...r.players].sort(
    (a, b) => (a.place ?? 99) - (b.place ?? 99) || a.seatIndex - b.seatIndex,
  );

  const rematch = async () => {
    const config = await rematchConfig(r, snapshot ?? null);
    if (!config) {
      show({ message: t("historyPast.detail.rematchUnavailable") });
      return;
    }
    const current = useGameStore.getState().session?.game;
    void requestReset({
      game: current,
      proceed: () => {
        void startNewGame(config).then(() => router.push("/play"));
      },
    });
  };

  const remove = async () => {
    await deleteRecord(r.id);
    setConfirm(false);
    show({ message: t("historyPast.detail.deleted") });
    onBack();
  };

  return (
    <div data-testid="past-game-detail" data-game-id={r.id}>
      <BackButton onClick={onBack} />
      <Card className="mt-2">
        <h2 className="text-xl font-semibold" data-testid="past-game-title">
          {t("historyPast.game.title", { number })}
        </h2>
        <p className="text-fg-muted">{dateText(r.startedAt)}</p>
        <p className="mt-1 flex flex-wrap gap-x-3">
          <span>{r.presetName}</span>
          {r.startValue > 0 && <span>{t("historyPast.game.start", { value: r.startValue })}</span>}
        </p>
        <p className="mt-1 text-fg-muted tabular" data-testid="past-game-duration">
          {t("historyPast.game.duration", { time: durationText(r.durationMs) })} ·{" "}
          {t("historyPast.game.wall", { time: durationText(r.wallMs) })}
        </p>
        {r.turnTracking && (
          <p className="text-fg-muted">
            {t("historyPast.detail.turns", { turns: r.turns, rounds: r.rounds })}
          </p>
        )}
        <p className="mt-2 flex items-center gap-1.5 font-medium" data-testid="past-game-outcome">
          {r.winners.length > 0 && <Trophy size={18} aria-hidden className="text-warning" />}
          {outcomeText(r)}
          {r.edited && (
            <span className="ml-2 rounded bg-surface-3 px-1.5 text-xs uppercase">
              {t("historyPast.game.edited")}
            </span>
          )}
        </p>
      </Card>

      <Section title={t("historyPast.detail.standings")} testId="past-standings">
        <ul className="overflow-hidden rounded-2xl bg-surface">
          {players.map((p, i) => {
            const elim = r.eliminations.find((e) => e.seatId === p.seatId);
            const subtitle = p.commanders.join(" / ") || p.deckName;
            return (
              <li
                key={p.seatId}
                className={cn(
                  "flex min-h-16 items-center gap-3 pr-4",
                  i > 0 && "border-t border-border",
                )}
                data-testid="past-standing"
              >
                <span aria-hidden className="h-16 w-1.5 shrink-0" style={{ background: p.color }} />
                <span className="w-8 shrink-0 text-fg-muted tabular">
                  {p.place !== undefined ? t("historyPast.detail.place", { place: p.place }) : ""}
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="flex items-center gap-2 truncate text-lg">
                    {p.name}
                    {p.winner && (
                      <Trophy
                        size={16}
                        className="text-warning"
                        role="img"
                        aria-label={t("history.winner")}
                      />
                    )}
                  </span>
                  {subtitle && <span className="truncate text-sm text-fg-muted">{subtitle}</span>}
                  {elim && (
                    <span className="truncate text-sm text-fg-muted">
                      {t("historyPast.detail.out", {
                        turn: elim.turn,
                        cause: causeText(elim.causeKind),
                      })}
                    </span>
                  )}
                  {p.clock && p.clock.avgTurnMs !== null && (
                    <span className="truncate text-sm text-fg-muted">
                      {t("historyPast.detail.clock", {
                        used: durationText(p.clock.usedMs),
                        avg: durationText(p.clock.avgTurnMs),
                      })}
                    </span>
                  )}
                </span>
                {elim && (
                  <Skull
                    size={20}
                    className="text-fg-subtle"
                    role="img"
                    aria-label={t("history.eliminated")}
                  />
                )}
                <span className="text-2xl font-semibold tabular">{p.primary}</span>
              </li>
            );
          })}
        </ul>
      </Section>

      <div className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-3">
        <Button
          variant="primary"
          icon={<RotateCcw size={18} aria-hidden />}
          onClick={() => void rematch()}
          data-testid="past-rematch"
        >
          {t("historyPast.detail.rematch")}
        </Button>
        <Button
          icon={<Pencil size={18} aria-hidden />}
          onClick={() => setEditing(true)}
          data-testid="past-edit"
        >
          {t("historyPast.detail.edit")}
        </Button>
        <Button
          variant="danger"
          icon={<Trash2 size={18} aria-hidden />}
          onClick={() => setConfirm(true)}
          data-testid="past-delete"
        >
          {t("historyPast.detail.delete")}
        </Button>
      </div>

      <Section title={t("historyPast.detail.log")} testId="past-log-section">
        {snapshot === undefined && r.log ? (
          <p className="text-fg-muted">{t("historyPast.detail.loadingLog")}</p>
        ) : snapshot ? (
          <>
            {r.logTruncated && (
              <p className="mb-2 text-sm text-fg-muted">{t("historyPast.detail.truncated")}</p>
            )}
            <Segmented
              label={t("historyPast.detail.view")}
              value={view}
              onChange={setView}
              testId="past-view"
              options={[
                { value: "list", label: t("historyPast.detail.list") },
                { value: "chart", label: t("historyPast.detail.chartTab") },
              ]}
            />
            {view === "list" ? (
              <ReadOnlyLog game={snapshot} />
            ) : (
              <LifeChart game={snapshot} now={snapshot.endedAt ?? r.endedAt} />
            )}
          </>
        ) : (
          <p className="text-fg-muted" data-testid="past-no-log">
            {t("historyPast.detail.noLog")}
          </p>
        )}
      </Section>

      <Sheet
        open={confirm}
        onClose={() => setConfirm(false)}
        title={t("historyPast.detail.delete")}
        testId="past-delete-sheet"
      >
        <p>{t("historyPast.detail.deleteConfirm")}</p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Button onClick={() => setConfirm(false)}>{t("common.cancel")}</Button>
          <Button
            variant="outline"
            className="text-danger"
            onClick={() => void remove()}
            data-testid="past-delete-confirm"
          >
            {t("common.delete")}
          </Button>
        </div>
      </Sheet>
      {editing && <EditSheet record={r} onClose={() => setEditing(false)} />}
    </div>
  );
}
