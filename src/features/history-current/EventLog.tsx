"use client";
/**
 * HIST-011..013 event log, newest first: colored seat dot, name or "Source → Target", counter
 * icon, delta chip colored by counter category, "→ value"; linked effects grouped; inline
 * turn / dice / elimination rows; undone events (D-027, from session.future) struck through at
 * the top. Tap a row for its time (and an "Undo to here" button); long-press opens "Undo to here".
 */
import { useState } from "react";
import { Undo2 } from "lucide-react";
import { Button, Sheet } from "@/components/ui";
import { GameIcon } from "@/components/icons/GameIcon";
import type { GameEvent, GameSession } from "@/engine";
import { t } from "@/lib/i18n";
import { useHold } from "@/lib/hooks/useHold";
import { cn } from "@/lib/ui/cn";
import { useDispatch } from "@/state/gameStore";
import {
  eventsFrom,
  filterGroups,
  formatClock,
  formatEventRow,
  groupEvents,
  undoneEvents,
  type EventRowView,
  type Tone,
} from "./format";

const CHIP: Record<Tone, string> = {
  loss: "bg-danger text-black",
  gain: "bg-success text-black",
  poison: "bg-poison text-black",
  commander: "bg-commander text-black",
  timer: "bg-timer text-black",
  neutral: "bg-surface-3 text-fg",
};

function RowContent({ row, undone }: { row: EventRowView; undone?: boolean }) {
  return (
    <span
      className={cn(
        "flex min-w-0 flex-1 items-center gap-2",
        undone && "text-fg-subtle line-through",
        row.variant === "event" && "italic",
      )}
    >
      <span
        aria-hidden
        className="size-3 shrink-0 rounded-full border border-border"
        style={{ background: row.color ?? "transparent" }}
      />
      <span className="min-w-0 flex-1 truncate" data-testid="log-row-label">
        {row.label}
      </span>
      <GameIcon
        id={row.icon}
        size={20}
        className={cn("shrink-0", row.tone === "timer" ? "text-timer" : "text-fg-muted")}
      />
      {row.chip && (
        <span
          className={cn(
            "shrink-0 rounded-lg px-2 py-0.5 text-sm font-bold tabular not-italic",
            CHIP[row.chip.tone],
          )}
          data-testid="log-row-chip"
          data-tone={row.chip.tone}
        >
          {row.chip.text}
        </span>
      )}
      {row.value && (
        <span className="shrink-0 tabular text-fg-muted" data-testid="log-row-value">
          {row.value}
        </span>
      )}
    </span>
  );
}

function LogRow({
  event,
  row,
  open,
  onToggle,
  onUndoTo,
}: {
  event: GameEvent;
  row: EventRowView;
  open: boolean;
  onToggle: () => void;
  onUndoTo: (e: GameEvent) => void;
}) {
  const hold = useHold({ delay: 550, onHold: () => onUndoTo(event), onTap: onToggle });
  return (
    <div data-testid="log-row" data-event-id={event.id} data-kind={event.kind}>
      <button
        type="button"
        aria-expanded={open}
        className="flex min-h-12 w-full select-none items-center px-3 py-1 text-left"
        {...hold}
        onClick={(e) => {
          // Keyboard activation (pointer taps are handled by useHold).
          if (e.detail === 0) onToggle();
        }}
      >
        <RowContent row={row} />
      </button>
      {open && (
        <div className="flex items-center justify-between gap-2 px-3 pb-2 pl-8 text-sm text-fg-muted">
          <span data-testid="log-row-time">{t("history.at", { time: formatClock(row.at) })}</span>
          <Button
            size="sm"
            variant="outline"
            icon={<Undo2 size={16} aria-hidden />}
            onClick={() => onUndoTo(event)}
            data-testid="log-row-undo"
          >
            {t("history.undoToHere")}
          </Button>
        </div>
      )}
    </div>
  );
}

export function EventLog({ session, filter }: { session: GameSession; filter: string | null }) {
  const dispatch = useDispatch();
  const game = session.game;
  const [openId, setOpenId] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<GameEvent | null>(null);
  const groups = filterGroups(groupEvents(game.log), filter);
  const undone = undoneEvents(session).filter(
    (e) => !filter || e.seatId === filter || e.sourceSeatId === filter,
  );
  const toggle = (id: string) => setOpenId((cur) => (cur === id ? null : id));

  return (
    <section className="mt-4" aria-labelledby="log-title">
      <h2 id="log-title" className="sr-only">
        {t("history.log")}
      </h2>
      <p className="mb-2 text-sm text-fg-muted">{t("history.rowHint")}</p>
      {undone.length > 0 && (
        <ul
          className="mb-3 overflow-hidden rounded-2xl border border-dashed border-border"
          aria-label={t("history.undoneHint")}
          data-testid="log-undone"
        >
          {undone.map((e) => (
            <li
              key={`u-${e.id}`}
              className="flex min-h-12 items-center gap-2 px-3"
              data-testid="log-undone-row"
            >
              <span className="shrink-0 rounded bg-surface-3 px-1.5 text-xs uppercase text-fg">
                {t("history.undone")}
              </span>
              <RowContent row={formatEventRow(e, session.future.at(-1) ?? game)} undone />
            </li>
          ))}
        </ul>
      )}
      {groups.length === 0 && undone.length === 0 ? (
        <p className="py-6 text-center text-fg-muted" data-testid="log-empty">
          {t("history.noEvents")}
        </p>
      ) : (
        <ul className="flex flex-col gap-1.5" data-testid="log-list">
          {groups.map((g) => {
            const linked = g.linked.length > 0;
            return (
              <li
                key={g.event.id}
                data-testid={linked ? "log-group-linked" : "log-group"}
                className={cn(
                  "overflow-hidden rounded-2xl bg-surface",
                  linked && "border-l-4 border-commander",
                )}
              >
                {[g.event, ...g.linked].map((e, i) => (
                  <div key={e.id} className={cn(i > 0 && "border-t border-border/60")}>
                    <LogRow
                      event={g.event}
                      row={formatEventRow(e, game)}
                      open={openId === e.id}
                      onToggle={() => toggle(e.id)}
                      onUndoTo={setConfirm}
                    />
                  </div>
                ))}
              </li>
            );
          })}
        </ul>
      )}
      <Sheet
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        title={t("history.undoToHere")}
        testId="undo-to-sheet"
      >
        {confirm && (
          <div className="flex flex-col gap-3">
            <p>{t("history.undoToHereConfirm")}</p>
            {eventsFrom(game, confirm.id) > 1 && (
              <p className="text-fg-muted">
                {t("history.undoToHereBody", { count: eventsFrom(game, confirm.id) - 1 })}
              </p>
            )}
            <div className="grid grid-cols-2 gap-2">
              <Button onClick={() => setConfirm(null)} data-testid="undo-to-cancel">
                {t("common.cancel")}
              </Button>
              <Button
                variant="danger"
                data-testid="undo-to-confirm"
                onClick={() => {
                  dispatch({ type: "UNDO_TO", eventId: confirm.id });
                  setConfirm(null);
                  setOpenId(null);
                }}
              >
                {t("history.undoToHere")}
              </Button>
            </div>
          </div>
        )}
      </Sheet>
    </section>
  );
}
