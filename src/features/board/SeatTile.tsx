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
import { thresholdFor } from "@/engine/thresholds";
import type { MiniGrid as MiniGridPlacement } from "@/engine/layout";
import { useHold } from "@/lib/hooks/useHold";
import { t } from "@/lib/i18n";
import { cn } from "@/lib/ui/cn";
import type { Rotation } from "@/lib/ui/rotation";
import { useDispatch, useGameStore, useGameValue, useSeat } from "@/state/gameStore";
// TIMER-UI (W3): per-seat timer bar (turn chip, clock chip, PASS TURN / Respond / Pass back).
import { SeatTimerBar, passTurnWithUndo } from "@/features/timer/SeatTimerBar";
import { seatTimerView, timerBarActive, timerTileMetrics } from "@/features/timer/model";
import { useSetting } from "@/state/settingsStore";
import { shouldOpenCalculator } from "@/features/calculator/calc";
import { ArtBackground } from "@/features/art/ArtBackground";
import { Badges } from "./Badges";
import { HOLD_REPEAT_MS, formatDelta, formatValue, pipLayout, tileMetrics } from "./boardHelpers";
import { useBoardUi } from "./boardStore";
import { reducedMotion, tapFeedback } from "./feedback";
import { QuickCmdGrid, TileMiniGrid } from "./MiniGrid";
import type { SeatLook } from "./useSeatLooks";
import { notchRow, type NotchRow } from "./notch";
import { useSwipe } from "./useSwipe";
import { firstMarkerKey } from "@/features/game-flow/flow";
import { useFlowUi } from "@/features/game-flow/flowUi";
import { TEST_HOOKS_ENABLED } from "@/state/testHooksFlag";

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
  /** MENU: where the center menu button cuts into the name row ([from, to] px, player frame). */
  notch?: readonly [number, number] | null;
}

function selectView(seat: Seat, game: Game) {
  const primary = primaryCounter(game.preset);
  const rule = thresholdFor(game, primary, seat.id);
  const pips =
    primary.display === "pips" && typeof primary.max === "number" && Number.isFinite(primary.max)
      ? primary.max
      : 0;
  return {
    pips,
    // A-10 (PRE-013): a labelled limit ("Base HP 28") is shown under the number.
    limitLabel: rule?.label ?? "",
    limitValue: rule?.value ?? 0,
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
  notch = null,
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
  const swipeOn = useSetting("swipe");
  const timerOn = useGameValue(timerBarActive) ?? false;
  const firstMarker = useFirstMarker(seatId);
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

  const valueText = view ? formatValue(view.value) : "";
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

  const pipW = wide ? frameW - 2 * (m.glyph + 16) - 16 : frameW * 0.84;
  const limitFont =
    view && view.limitLabel ? Math.round(Math.max(12, Math.min(20, m.numberH * 0.12))) : 0;

  // INP-005: a vertical swipe (in this player's frame) between the name pill and the bottom row.
  const swipe = useSwipe({
    enabled: swipeOn && !cmdMode && !!view,
    rotation,
    top: m.topH,
    bottom: frameH - m.bottomH,
    onSwipe: (dir) => change(dir === "up" ? step : -step),
  });

  if (!view) return null;

  // A11Y-005: arrows adjust the focused seat (Shift = hold step); Space/Enter passes the turn when
  // it is this seat's; R responds (timers). Arrows also work from the seat's own buttons.
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (cmdMode || e.altKey || e.ctrlKey || e.metaKey) return;
    const k = e.key;
    if (k === "ArrowUp" || k === "ArrowRight" || k === "ArrowDown" || k === "ArrowLeft") {
      e.preventDefault();
      const amount = e.shiftKey ? holdStep : step;
      change(k === "ArrowUp" || k === "ArrowRight" ? amount : -amount);
      return;
    }
    if (e.target !== e.currentTarget) return;
    const game = useGameStore.getState().session?.game;
    if (!game) return;
    const tv = seatTimerView(game, seatId);
    if ((k === " " || k === "Enter") && tv.canPass) {
      e.preventDefault();
      passTurnWithUndo(seatId, rotation);
    } else if ((k === "r" || k === "R") && tv.canRespond) {
      e.preventDefault();
      dispatch({ type: "TIMER_RESPOND", seatId });
    }
  };
  const openSeat = () => openMenu({ seatId, tab: "player", rotation });
  const zoneLabel = (kind: "plus" | "minus") =>
    t(kind === "plus" ? "board.seat.increase" : "board.seat.decrease", {
      name: view.name,
      counter: view.primaryName,
      value: valueText,
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
      className={cn(
        "size-full rounded-tile bg-surface",
        "focus-visible:outline-solid focus-visible:outline-4 focus-visible:-outline-offset-4 focus-visible:outline-white",
        (view.active || firstMarker) && "ring-4 ring-accent",
      )}
      tabIndex={0}
      role="group"
      aria-label={t(view.active ? "board.seat.groupTurn" : "board.seat.group", {
        name: view.name,
        counter: view.primaryName,
        value: valueText,
      })}
      aria-keyshortcuts="ArrowUp ArrowDown ArrowLeft ArrowRight Space Enter R"
      data-active={view.active || undefined}
      onKeyDown={onKeyDown}
    >
      <div
        className="absolute inset-0 overflow-hidden rounded-tile [container-type:size]"
        data-seat-id={seatId}
        data-eliminated={view.eliminated || undefined}
        style={swipe ? { touchAction: "none" } : undefined}
        {...swipe}
      >
        {/* Background art + scrim (LAY-007, SET-003 contrast) */}
        <ArtBackground
          art={view.art}
          fallbackColor={view.color}
          className={cn("absolute inset-0", view.eliminated && "grayscale brightness-75")}
          testId={`seat-${index}-art`}
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
              {/* A-9: tall tiles have nothing beside the pill, so the name may use the width. */}
              {/* MENU: the center menu button may cut into this row (`notch`): go around it. */}
              <NameRow
                notch={notchRow(notch, frameW)}
                pad={wide ? 56 : 8}
                height={m.topH}
                name={
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
                }
                chip={
                  firstMarker && (
                    <span
                      data-testid={`seat-${index}-first`}
                      role="status"
                      className="ml-1 inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full bg-accent px-2.5 py-1 text-xs font-bold text-accent-fg shadow"
                    >
                      <span className="sr-only">
                        {t("board.seat.goesFirstLabel", { name: view.name })}
                      </span>
                      <span aria-hidden>▶</span>
                      <span aria-hidden>
                        {frameW - (wide ? 112 : 16) < 260 || notch
                          ? t("board.seat.goesFirstShort")
                          : t("board.seat.goesFirst")}
                      </span>
                    </span>
                  )
                }
              />
              {/* Primary number (LIFE-001, LAY-008 auto-fit) + bubble (INP-006) */}
              <div
                className="absolute inset-x-0 flex items-center justify-center"
                style={{ top: m.numberTop, height: m.numberH }}
              >
                <div className="relative flex flex-col items-center">
                  {view.pips > 0 ? (
                    <Pips
                      index={index}
                      value={view.value}
                      max={view.pips}
                      name={view.primaryName}
                      w={pipW}
                      h={m.numberH}
                      numberRef={numberRef}
                      valueText={valueText}
                    />
                  ) : (
                    <span
                      ref={numberRef}
                      data-testid={`seat-${index}-value`}
                      className="block font-bold leading-none tabular tracking-tight [text-shadow:0_2px_10px_rgb(0_0_0/0.45)]"
                      style={{
                        fontSize: limitFont ? Math.min(m.fontPx, m.numberH * 0.78) : m.fontPx,
                      }}
                    >
                      {valueText}
                    </span>
                  )}
                  {limitFont > 0 && (
                    <span
                      data-testid={`seat-${index}-limit`}
                      className="mt-0.5 whitespace-nowrap rounded-full bg-black/55 px-2.5 font-semibold leading-snug"
                      style={{ fontSize: limitFont }}
                    >
                      {t("board.seat.limit", { label: view.limitLabel, value: view.limitValue })}
                    </span>
                  )}
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
                      aria-hidden
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

/**
 * §10.5 pips display (`display: "pips"`, e.g. FFTCG damage): `max` slots that fill up, with the
 * count underneath. The whole group reads "Damage 3 of 7" to assistive tech.
 */
function Pips({
  index,
  value,
  max,
  name,
  w,
  h,
  numberRef,
  valueText,
}: {
  index: number;
  value: number;
  max: number;
  name: string;
  w: number;
  h: number;
  numberRef: React.RefObject<HTMLSpanElement | null>;
  valueText: string;
}) {
  const countPx = Math.round(Math.max(14, Math.min(40, h * 0.2)));
  const pl = pipLayout(max, Math.max(16, w), Math.max(16, h - countPx * 1.3));
  const filled = Math.max(0, Math.min(max, value));
  return (
    <div
      role="img"
      aria-label={t("board.seat.pips", { name, value, max })}
      data-testid={`seat-${index}-pips`}
      data-value={value}
      data-max={max}
      className="flex flex-col items-center"
      style={{ gap: Math.round(countPx * 0.3) }}
    >
      <div
        aria-hidden
        className="grid justify-center"
        style={{
          gridTemplateColumns: `repeat(${pl.cols}, ${pl.d}px)`,
          gap: pl.gap,
        }}
      >
        {Array.from({ length: max }, (_, k) => (
          <span
            key={k}
            data-testid={`seat-${index}-pip-${k}`}
            data-filled={k < filled ? "1" : "0"}
            className={cn(
              "block rounded-full border-[3px] shadow",
              k < filled ? "border-white bg-white" : "border-white/70 bg-black/30",
            )}
            style={{ width: pl.d, height: pl.d }}
          />
        ))}
      </div>
      <span aria-hidden className="font-bold leading-none tabular" style={{ fontSize: countPx }}>
        <span ref={numberRef} data-testid={`seat-${index}-value`}>
          {valueText}
        </span>
        <span className="opacity-70">{` / ${max}`}</span>
      </span>
    </div>
  );
}

const FIRST_MARKER_MS = 10_000;

/**
 * A-1 (GAME-011, LIFE-006): the starter's tile says "goes first" (even with turn tracking off)
 * until anyone changes a counter, the turn passes, or 10 s after the announcement closed.
 */
function useFirstMarker(seatId: string): boolean {
  const raw = useSeat(seatId, (_s, g) => firstMarkerKey(g, seatId)) ?? "";
  const [key, announcing] = raw.split("|");
  const testSkip =
    TEST_HOOKS_ENABLED &&
    typeof window !== "undefined" &&
    !!key &&
    window.__tcgSkipAnnounceGame === key.split(":")[0];
  const overlayUp = useFlowUi((s) => !!key && announcing === "1" && !s.announced.includes(key));
  const waiting = overlayUp && !testSkip;
  const done = useFlowUi((s) => !!key && s.markersDone.includes(key));
  const markerDone = useFlowUi((s) => s.markerDone);
  useEffect(() => {
    if (!key || done || waiting) return;
    const timer = setTimeout(() => markerDone(key), FIRST_MARKER_MS);
    return () => clearTimeout(timer);
  }, [key, done, waiting, markerDone]);
  return !!key && !done;
}

/**
 * The tile's top row (name pill + "goes first" chip). Centred by default; with the center menu
 * button cutting in (MENU), split around it or padded so the pill stays clear of it.
 */
function NameRow({
  notch,
  pad,
  height,
  name,
  chip,
}: {
  notch: NotchRow;
  pad: number;
  height: number;
  name: React.ReactNode;
  chip: React.ReactNode;
}) {
  if (notch.kind === "split") {
    return (
      <div
        className="absolute inset-x-0 top-0 flex items-center"
        style={{ height }}
        data-notch="split"
      >
        <div
          className="flex h-full min-w-0 shrink-0 items-center justify-end"
          style={{ width: notch.from, paddingLeft: Math.min(pad, notch.from / 4) }}
        >
          {name}
        </div>
        <div aria-hidden className="h-full shrink-0" style={{ width: notch.to - notch.from }} />
        <div className="flex h-full min-w-0 flex-1 items-center justify-start">{chip}</div>
      </div>
    );
  }
  const cut = (s: "left" | "right") =>
    notch.kind === "pad" && notch.side === s ? Math.max(pad, notch.pad) : pad;
  return (
    <div
      className="absolute inset-x-0 top-0 flex items-center justify-center"
      style={{ height, paddingLeft: cut("left"), paddingRight: cut("right") }}
      data-notch={notch.kind === "pad" ? "pad" : undefined}
    >
      {name}
      {chip}
    </div>
  );
}
