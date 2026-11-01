"use client";
/**
 * Seat tile (T1.7) — PRD §8.1 anatomy, LAY-007/008, LIFE-001..006, INP-001..004/006/008/009.
 *
 * Everything inside the RotatedContainer is laid out in the seat player's own frame, so "+" is
 * always on the player's right (wide tiles) or toward the top (tall tiles), whatever the rotation.
 * Each half owns its own `useHold` pointer tracker, so many seats can be pressed at once (INP-001).
 * Subscribes only to its own seat slice (PERF-002).
 */
import { Minus, Plus, Skull, Trophy } from "lucide-react";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import { RotatedContainer } from "@/components/ui/RotatedContainer";
import { counterValue, primaryCounter, type Game, type Seat } from "@/engine";
import type { MiniGrid as MiniGridPlacement } from "@/engine/layout";
import { useHold } from "@/lib/hooks/useHold";
import { t } from "@/lib/i18n";
import { cn } from "@/lib/ui/cn";
import type { Rotation } from "@/lib/ui/rotation";
import { useDispatch, useGameValue, useSeat } from "@/state/gameStore";
// TIMER-UI (W3): per-seat timer bar (turn chip, clock chip, PASS TURN / Respond / Pass back).
import { SeatTimerBar } from "@/features/timer/SeatTimerBar";
import { timerBarActive, timerTileMetrics } from "@/features/timer/model";
import { useSetting } from "@/state/settingsStore";
import { shouldOpenCalculator } from "@/features/calculator/calc";
import { Badges } from "./Badges";
import { HOLD_REPEAT_MS, artStyle, formatDelta, formatValue, tileMetrics } from "./boardHelpers";
import { useBoardUi } from "./boardStore";
import { reducedMotion, tapFeedback } from "./feedback";
import { QuickCmdGrid, TileMiniGrid } from "./MiniGrid";
import type { SeatLook } from "./useSeatLooks";

export interface SeatTileProps {
  index: number;
  seatId: string;
  rotation: Rotation;
  /** The tile is wider than tall in its player's frame (+/− split left/right). */
  wide: boolean;
  /** Tile size in px as its player sees it. */
  frameW: number;
  frameH: number;
  grid: MiniGridPlacement;
  looks: SeatLook[];
  showMiniGrid: boolean;
}

function selectView(seat: Seat, game: Game) {
  const primary = primaryCounter(game.preset);
  return {
    name: seat.name,
    color: seat.color,
    art: seat.art,
    contrast: seat.contrast,
    eliminated: seat.eliminated,
    primaryId: primary.id,
    primaryName: primary.name,
    step: primary.step,
    holdStep: primary.holdStep ?? primary.step * 10,
    value: counterValue(game, primary.id, seat.id),
    winner: game.result?.winners.includes(seat.id) ?? false,
    active:
      game.options.turnTracking && game.status !== "ended" && game.turn.activeSeat === seat.id,
  };
}

export const SeatTile = memo(function SeatTile({
  index,
  seatId,
  rotation,
  wide,
  frameW,
  frameH,
  grid,
  looks,
  showMiniGrid,
}: SeatTileProps) {
  const view = useSeat(seatId, selectView);
  const dispatch = useDispatch();
  const openMenu = useBoardUi((s) => s.openMenu);
  const cmdMode = useBoardUi((s) => s.cmdMode);
  const cardLayout = useSetting("cardLayout");
  const tapZones = useSetting("tapZones");
  const holdDelay = useSetting("holdDelayMs");
  const holdRepeat = useSetting("holdRepeat");
  const bubbleMs = useSetting("bubbleMs");
  const timerOn = useGameValue(timerBarActive) ?? false;
  // INP-007: tapping the number opens the calculator for high-total presets (Yu-Gi-Oh! LP).
  const calcOn = useGameValue((g) => shouldOpenCalculator(g.preset, g.options)) ?? false;
  const openCalc = useBoardUi((s) => s.openCalc);

  // INP-006 pending-change bubble (the engine batches the history entry itself).
  const [bubble, setBubble] = useState(0);
  const bubbleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const numberRef = useRef<HTMLSpanElement>(null);
  useEffect(
    () => () => {
      if (bubbleTimer.current) clearTimeout(bubbleTimer.current);
    },
    [],
  );

  const primaryId = view?.primaryId;
  const change = useCallback(
    (delta: number) => {
      if (!primaryId) return;
      dispatch({ type: "COUNTER_ADD", counterId: primaryId, seatId, delta });
      setBubble((b) => b + delta);
      if (bubbleTimer.current) clearTimeout(bubbleTimer.current);
      bubbleTimer.current = setTimeout(() => setBubble(0), bubbleMs);
      tapFeedback(numberRef.current);
    },
    [dispatch, primaryId, seatId, bubbleMs],
  );

  const step = view?.step ?? 1;
  const holdStep = view?.holdStep ?? 10;
  const repeat = HOLD_REPEAT_MS[holdRepeat];
  const plus = useHold({
    delay: holdDelay,
    repeat,
    onTap: () => change(step),
    onHold: () => change(holdStep),
  });
  const minus = useHold({
    delay: holdDelay,
    repeat,
    onTap: () => change(-step),
    onHold: () => change(-holdStep),
  });

  if (!view) return null;

  const valueText = formatValue(view.value);
  const big = cardLayout === "bigFont";
  const halves = tapZones === "halves";
  const showDetails = cardLayout === "default";
  const metricOpts = {
    wide,
    // TIMER-UI: the timer bar needs the bottom row even in the name-only / big-font layouts.
    details: showDetails || timerOn,
    big,
    chars: valueText.length,
    gridRows: grid.rows,
  };
  const timerM = timerOn
    ? timerTileMetrics({ w: frameW, h: frameH }, (f) => tileMetrics(f, metricOpts))
    : null;
  const m = timerM ? timerM.tile : tileMetrics({ w: frameW, h: frameH }, metricOpts);
  const openSeat = () => openMenu({ seatId, tab: "player", rotation });
  const zoneLabel = (kind: "plus" | "minus") =>
    t(kind === "plus" ? "board.seat.increase" : "board.seat.decrease", {
      name: view.name,
      counter: view.primaryName,
    });

  const zone = (kind: "plus" | "minus") => {
    const hold = kind === "plus" ? plus : minus;
    const d = kind === "plus" ? step : -step;
    const pos = wide
      ? kind === "plus"
        ? "inset-y-0 right-0 w-1/2"
        : "inset-y-0 left-0 w-1/2"
      : kind === "plus"
        ? "inset-x-0 top-0 h-1/2"
        : "inset-x-0 bottom-0 h-1/2";
    if (!halves) return null;
    return (
      <button
        type="button"
        data-testid={`seat-${index}-${kind}`}
        aria-label={zoneLabel(kind)}
        className={cn("absolute outline-none focus-visible:bg-white/10", pos)}
        {...hold}
        onClick={(e) => {
          if (e.detail === 0) change(d); // keyboard activation
        }}
      />
    );
  };

  const glyph = (kind: "plus" | "minus") => {
    const Icon = kind === "plus" ? Plus : Minus;
    // Glyph centres in the player's frame (LAY-007: at the tile ends).
    const midY = m.numberTop + m.numberH / 2;
    const box = halves ? m.glyph : Math.max(56, m.glyph);
    const cx = wide ? (kind === "plus" ? frameW - 8 - m.glyph / 2 : 8 + m.glyph / 2) : frameW / 2;
    const cy = wide
      ? midY
      : kind === "plus"
        ? m.topH + (m.glyph + 8) / 2
        : frameH - m.bottomH - (m.glyph + 8) / 2;
    const style = { left: cx - box / 2, top: cy - box / 2, width: box, height: box };
    if (halves) {
      return (
        <span aria-hidden className="absolute text-white/75" style={style}>
          <Icon className="size-full" strokeWidth={2.5} />
        </span>
      );
    }
    const hold = kind === "plus" ? plus : minus;
    const d = kind === "plus" ? step : -step;
    return (
      <button
        type="button"
        data-testid={`seat-${index}-${kind}`}
        aria-label={zoneLabel(kind)}
        className="pointer-events-auto absolute flex items-center justify-center rounded-full bg-black/45 text-white"
        style={style}
        {...hold}
        onClick={(e) => {
          if (e.detail === 0) change(d);
        }}
      >
        <Icon className="size-3/5" strokeWidth={2.5} />
      </button>
    );
  };

  return (
    <RotatedContainer
      rotation={rotation}
      testId={`seat-${index}`}
      className={cn("size-full rounded-tile bg-surface", view.active && "ring-4 ring-accent")}
    >
      <div
        className="absolute inset-0 overflow-hidden rounded-tile [container-type:size]"
        data-seat-id={seatId}
        data-eliminated={view.eliminated || undefined}
      >
        {/* Background art + scrim (LAY-007, SET-003 contrast) */}
        <div
          aria-hidden
          className={cn("absolute inset-0", view.eliminated && "grayscale brightness-75")}
          style={artStyle(view.art, view.color)}
        />
        <div
          aria-hidden
          className={cn("absolute inset-0", view.contrast ? "bg-black/60" : "bg-black/30")}
        />
        {/* LIFE-004: skull watermark behind the number; the seat stays interactive. */}
        {view.eliminated && (
          <div
            data-testid={`seat-${index}-eliminated`}
            className="pointer-events-none absolute inset-0 flex items-center justify-center"
          >
            <Skull
              role="img"
              aria-label={t("board.seat.eliminated")}
              className="size-[min(78cqh,78cqw)] text-black/45"
              strokeWidth={1.75}
            />
          </div>
        )}

        {cmdMode && showMiniGrid ? (
          <div className="absolute inset-0 flex flex-col gap-1 p-2">
            <div className="flex items-center justify-between gap-2 px-1 text-white">
              <span className="truncate text-sm font-semibold">{view.name}</span>
              <span data-testid={`seat-${index}-value`} className="text-lg font-bold tabular">
                {valueText}
              </span>
            </div>
            <div className="min-h-0 flex-1">
              <QuickCmdGrid index={index} seatId={seatId} grid={grid} looks={looks} />
            </div>
          </div>
        ) : (
          <>
            {zone("minus")}
            {zone("plus")}
            <div
              className={cn(
                "pointer-events-none absolute inset-0 text-white",
                view.contrast && "[text-shadow:0_0_3px_#000,0_0_8px_#000]",
              )}
            >
              {glyph("minus")}
              {glyph("plus")}
              {/* Name pill (opens the seat menu; INP-009 visually distinct from the +/− zones) */}
              <div
                className="absolute inset-x-0 top-0 flex items-center justify-center px-14"
                style={{ height: m.topH }}
              >
                <button
                  type="button"
                  data-testid={`seat-${index}-name`}
                  aria-label={t("board.seat.menu", { name: view.name })}
                  onClick={openSeat}
                  className="pointer-events-auto flex h-full min-w-12 max-w-full items-center justify-center"
                >
                  <span
                    className={cn(
                      "max-w-full truncate rounded-full bg-black/60 px-3 py-1 font-semibold",
                      big ? "text-xs" : "text-sm",
                    )}
                  >
                    {view.name}
                  </span>
                </button>
              </div>
              {/* Primary number (LIFE-001, LAY-008 auto-fit) + bubble (INP-006) */}
              <div
                className="absolute inset-x-0 flex items-center justify-center"
                style={{ top: m.numberTop, height: m.numberH }}
              >
                <div className="relative flex flex-col items-center">
                  <span
                    ref={numberRef}
                    data-testid={`seat-${index}-value`}
                    className="block font-bold leading-none tabular tracking-tight [text-shadow:0_2px_10px_rgb(0_0_0/0.45)]"
                    style={{ fontSize: m.fontPx }}
                  >
                    {valueText}
                  </span>
                  {calcOn && (
                    <button
                      type="button"
                      data-testid={`seat-${index}-calc`}
                      aria-label={t("board.calc.open", { name: view.name })}
                      className="pointer-events-auto absolute inset-0 rounded-xl focus-visible:outline-2 focus-visible:outline-accent"
                      onClick={() => openCalc({ seatId, rotation })}
                    />
                  )}
                  {bubble !== 0 && (
                    <span
                      data-testid={`seat-${index}-bubble`}
                      aria-live="polite"
                      className={cn(
                        "absolute top-full z-10 rounded-full px-2.5 py-0.5 font-bold tabular shadow",
                        bubble > 0 ? "bg-success text-black" : "bg-danger text-white",
                      )}
                      style={{ fontSize: Math.max(14, Math.min(24, m.fontPx * 0.28)) }}
                    >
                      {formatDelta(bubble)}
                    </span>
                  )}
                </div>
              </div>
              {/* Bottom row: commander mini-grid + badges (default card layout only) */}
              {showDetails && (
                <div
                  className="absolute inset-x-1.5 bottom-1 flex items-end justify-between gap-2"
                  style={{ height: m.bottomH }}
                >
                  {showMiniGrid ? (
                    <TileMiniGrid
                      index={index}
                      seatId={seatId}
                      grid={grid}
                      looks={looks}
                      cellPx={m.cellPx}
                      onOpen={() => openMenu({ seatId, tab: "commander", rotation })}
                    />
                  ) : (
                    <span />
                  )}
                  <Badges
                    index={index}
                    seatId={seatId}
                    onOpen={(counterId) =>
                      openMenu({ seatId, tab: "counters", focusCounterId: counterId, rotation })
                    }
                  />
                </div>
              )}
              {timerM && (
                <SeatTimerBar index={index} seatId={seatId} rotation={rotation} metrics={timerM} />
              )}
            </div>
          </>
        )}
        {view.winner && <WinnerOverlay index={index} />}
      </div>
    </RotatedContainer>
  );
});

const CONFETTI = Array.from({ length: 18 }, (_, i) => i);

/** LIFE-005 winner overlay with confetti (static when motion is reduced). */
function WinnerOverlay({ index }: { index: number }) {
  const [animate] = useState(() => !reducedMotion());
  return (
    <div
      data-testid={`seat-${index}-winner`}
      className="pointer-events-none absolute inset-0 overflow-hidden rounded-tile ring-4 ring-warning ring-inset"
    >
      {animate &&
        CONFETTI.map((i) => (
          <span
            key={i}
            aria-hidden
            className="board-confetti absolute top-0 block size-2 rounded-[2px]"
            style={{
              left: `${(i * 37) % 100}%`,
              background: ["#facc15", "#f472b6", "#38bdf8", "#34d399"][i % 4],
              animationDelay: `${(i % 6) * 0.25}s`,
            }}
          />
        ))}
      <div className="absolute inset-x-0 top-[22cqh] flex flex-col items-center text-warning">
        <Trophy aria-hidden className="size-[min(22cqh,22cqw)]" strokeWidth={1.75} />
        <span className="rounded-full bg-black/60 px-3 text-sm font-bold uppercase tracking-wide">
          {t("board.seat.winner")}
        </span>
      </div>
    </div>
  );
}
