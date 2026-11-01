"use client";
import { Skull, TriangleAlert } from "lucide-react";
import { useMemo, useState } from "react";
import {
  commanderDamageGrid,
  thresholdFor,
  type DamageCell,
  type Game,
  type Seat,
  type SeatId,
} from "@/engine";
import { artToCss } from "@/features/backgrounds/gradients";
import { cellLevel, matrixCounter } from "./damage";
import { OptionsPanel } from "@/features/seat/OptionsPanel";
import { TapHoldButton } from "@/features/seat/TapHoldButton";
import { t } from "@/lib/i18n";
import { cn } from "@/lib/ui/cn";
import { useDispatch } from "@/state/gameStore";

interface Props {
  game: Game;
  /** the seat whose menu is open: the damage TARGET */
  seatId: SeatId;
}

interface Group {
  seat: Seat;
  index: number;
  cells: DamageCell[];
}

function commanderLabel(seat: Seat, i: number): string {
  return seat.commanders[i]?.trim() || t("seat.commander.fallback", { n: i + 1 });
}

/**
 * Commander damage tab (SEAT-002, CMD-001..005): one tile per seat at the table (art/color
 * thumbnail + name; own tile = "me" for self-inflicted damage). Partner sources are split into
 * two halves. Tap = +1 received from that commander, hold = options (−1, set, reset).
 */
export function CommanderTab({ game, seatId }: Props) {
  const dispatch = useDispatch();
  const def = matrixCounter(game);
  const [optionsFor, setOptionsFor] = useState<{ src: SeatId; idx: number } | null>(null);
  const groups = useMemo<Group[]>(() => {
    const cells = commanderDamageGrid(game, seatId, def?.id);
    return game.seats.map((seat, index) => ({
      seat,
      index,
      cells: cells.filter((c) => c.sourceSeatId === seat.id),
    }));
  }, [game, seatId, def?.id]);
  if (!def) return null;
  const threshold = thresholdFor(game, def, seatId)?.value ?? null;

  const add = (src: SeatId, idx: number, delta: number) =>
    dispatch({
      type: "CMD_DAMAGE_ADD",
      counterId: def.id,
      targetSeatId: seatId,
      sourceSeatId: src,
      sourceIndex: idx,
      delta,
    });
  const set = (src: SeatId, idx: number, value: number) =>
    dispatch({
      type: "COUNTER_SET",
      counterId: def.id,
      seatId,
      sourceSeatId: src,
      sourceIndex: idx,
      value: Math.max(0, value),
    });

  if (optionsFor) {
    const g = groups.find((x) => x.seat.id === optionsFor.src);
    const cell = g?.cells.find((c) => c.sourceIndex === optionsFor.idx);
    if (g && cell) {
      const who = cell.self ? t("seat.commander.me") : g.seat.name;
      const title =
        g.cells.length > 1 ? `${who} · ${commanderLabel(g.seat, cell.sourceIndex)}` : who;
      return (
        <OptionsPanel
          testId="cmd-options"
          title={title}
          valueLabel={String(cell.value)}
          onBack={() => setOptionsFor(null)}
          onMinus={() => add(g.seat.id, cell.sourceIndex, -1)}
          onSet={(v) => {
            set(g.seat.id, cell.sourceIndex, v);
            setOptionsFor(null);
          }}
          onReset={() => set(g.seat.id, cell.sourceIndex, 0)}
        />
      );
    }
  }

  return (
    <div className="@container flex flex-col gap-3">
      <p className="text-sm text-fg-muted">
        {threshold !== null
          ? t("seat.commander.help", { threshold })
          : t("seat.commander.helpNoThreshold")}
      </p>
      <div className="grid grid-cols-2 gap-2 @md:grid-cols-3" data-testid="cmd-grid">
        {groups.map((g) => {
          const self = g.seat.id === seatId;
          const total = g.cells.reduce((sum, c) => sum + c.value, 0);
          return (
            <div
              key={g.seat.id}
              data-testid={`cmd-seat-${g.index}`}
              className="relative overflow-hidden rounded-2xl"
              style={artToCss(g.seat.art, g.seat.color)}
            >
              <div className="flex items-center gap-2 bg-black/70 px-3 py-1.5 text-white">
                <span className="min-w-0 flex-1 truncate text-base font-semibold">
                  {self ? t("seat.commander.me") : g.seat.name}
                </span>
                {g.cells.length > 1 && (
                  <span className="text-sm tabular" data-testid={`cmd-total-${g.index}`}>
                    {t("seat.commander.total", { total })}
                  </span>
                )}
              </div>
              <div className="flex">
                {g.cells.map((c) => {
                  const level = cellLevel(c.value, threshold);
                  const label =
                    g.cells.length > 1 ? commanderLabel(g.seat, c.sourceIndex) : undefined;
                  const who = self ? t("seat.commander.me") : g.seat.name;
                  return (
                    <TapHoldButton
                      key={c.sourceIndex}
                      testId={`cmd-cell-${g.index}-${c.sourceIndex}`}
                      data={{ level, value: c.value }}
                      onTap={() => add(g.seat.id, c.sourceIndex, 1)}
                      onHold={() => setOptionsFor({ src: g.seat.id, idx: c.sourceIndex })}
                      className={cn(
                        "flex min-h-20 flex-1 flex-col items-center justify-center bg-black/45 px-1 py-2 text-white",
                        g.cells.length > 1 && c.sourceIndex > 0 && "border-l border-white/40",
                        level === "warning" && "bg-warning/80 text-black",
                        level === "lethal" && "bg-danger/90",
                      )}
                    >
                      <span className="sr-only">{t("seat.commander.cellLabel", { who })}</span>
                      {label && (
                        <span className="w-full truncate text-center text-xs">{label}</span>
                      )}
                      <span className="flex items-center gap-1 text-3xl font-semibold tabular">
                        {/* A11Y-004: near-lethal / lethal is not shown by colour alone. */}
                        {level === "warning" && (
                          <TriangleAlert
                            role="img"
                            aria-label={t("seat.commander.warning")}
                            data-testid={`cmd-cell-${g.index}-${c.sourceIndex}-warning`}
                            className="size-5"
                          />
                        )}
                        {level === "lethal" && (
                          <Skull
                            role="img"
                            aria-label={t("seat.commander.lethal")}
                            data-testid={`cmd-cell-${g.index}-${c.sourceIndex}-lethal`}
                            className="size-5"
                          />
                        )}
                        {c.value}
                      </span>
                    </TapHoldButton>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
