"use client";
/**
 * Per-seat timer bar (T2.3 / T2.4 / T2.6), rendered inside the seat tile in the player's frame:
 *
 * - clocks off + turn tracking: "▶ Turn N" chip and PASS TURN on the active seat (TURN-001)
 * - clocks configured, not started: "Waiting to start" chip with the bank (TMR-001)
 * - running: the seat's clock chip (holder pulsing ▶ and large, TMR-041/042; others small and
 *   dimmed), PASS TURN on the turn holder (TMR-003/004), ⚡ Respond on every other living seat
 *   (TMR-005), ↩ Pass back on the responder (TMR-006), and on the turn holder during a response
 *   ↩ Return (TMR-008) in place of PASS TURN (TMR-009 "Resolve responses first").
 * - during a response every other seat sees the banner "⚡ {name} 0:12 ⚡×2" in place of its own
 *   chip, oriented to that seat's player (decision: per-tile banners; a single centre banner
 *   cannot face everyone on a shared phone).
 *
 * Only the holder's chip ticks (useClock), plus the tiny banner timer while a response runs
 * (§10.2).
 */
import { Hand, TriangleAlert, Undo2, Zap } from "lucide-react";
import { lazy, memo, Suspense, useEffect, useRef, useState, type CSSProperties } from "react";
import { formatClock, turnTimeUsed, type Game, type SeatId } from "@/engine";
import { useSnackbar, type SnackAnchor } from "@/components/ui/Snackbar";
import { useHold } from "@/lib/hooks/useHold";
import { t } from "@/lib/i18n";
import { cn } from "@/lib/ui/cn";
import type { Rotation } from "@/lib/ui/rotation";
import { useGameStore, useGameValue, useSeat } from "@/state/gameStore";
import { useClock } from "@/state/useClock";
import { responseElapsed, seatTimerView, type TimerTileMetrics } from "./model";
import { passTurn, playTone } from "./actions";
import { useTimerUi } from "./timerUi";
import { useTickNow } from "./useTickNow";

// Declare-blockers UI: its own chunk, fetched only when the window is enabled or open (PERF-003).
const blockers = () => import("./Blockers");
const BlockersBanner = lazy(() => blockers().then((m) => ({ default: m.BlockersBanner })));
const AttackButton = lazy(() => blockers().then((m) => ({ default: m.AttackButton })));
const DeclaredButton = lazy(() => blockers().then((m) => ({ default: m.DeclaredButton })));

export const PASS_HOLD_MS = 600;
export const PASS_UNDO_MS = 3000;
const PEEK_MS = 2000;

interface Props {
  index: number;
  seatId: SeatId;
  rotation: Rotation;
  metrics: TimerTileMetrics;
}

export const SeatTimerBar = memo(function SeatTimerBar({
  index,
  seatId,
  rotation,
  metrics,
}: Props) {
  const view = useSeat(seatId, (_s, g) => seatTimerView(g, seatId));
  const dispatch = useGameStore((s) => s.dispatch);
  const [peek, setPeek] = useState(false);
  const peekTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (peekTimer.current) clearTimeout(peekTimer.current);
    },
    [],
  );
  if (!view || !view.show) return null;

  const band = metrics.mode === "band";
  // Row mode (short tiles): secondary buttons are icon-only (⚡ / ↩) to fit between the corners.
  const compact = !band;
  const showBanner = view.depth > 0 && !view.isTop;
  const px = view.holding ? metrics.clockPx : metrics.smallClockPx;
  // Two big buttons side by side need room: narrow bands get the compact (icon + caption) look.
  const tight = compact || metrics.buttons.maxW < 300;
  const twoUp = view.canAttack || (view.canDeclare && (view.canPass || view.canRespond));

  const onChip = () => {
    // TMR-011: tapping a chip never does anything destructive; it shows the details for 2 s.
    setPeek(true);
    if (peekTimer.current) clearTimeout(peekTimer.current);
    peekTimer.current = setTimeout(() => setPeek(false), PEEK_MS);
  };

  let chip;
  if (!view.clocks) {
    chip = view.isTurn ? (
      <span
        data-testid={`seat-${index}-turn`}
        className="inline-flex h-10 shrink-0 items-center gap-1 rounded-full bg-black/60 px-3 text-sm font-bold"
      >
        <span aria-hidden>▶</span>
        {t("timer.turnChip", { n: view.turnNumber })}
      </span>
    ) : null;
  } else if (showBanner) {
    chip = <ResponseBanner index={index} view={view} px={metrics.smallClockPx} compact={compact} />;
  } else if (view.inWindow && view.depth === 0) {
    chip = (
      <Suspense fallback={null}>
        <BlockersBanner index={index} px={metrics.smallClockPx} compact={compact} />
      </Suspense>
    );
  } else {
    chip = (
      <ClockChip
        index={index}
        seatId={seatId}
        px={px}
        holding={view.holding}
        responder={view.isTop}
        paused={view.paused}
        waiting={view.waiting}
        caption={
          view.waiting
            ? t("timer.waiting")
            : view.isTop
              ? t("timer.responding")
              : view.isTurn
                ? t("timer.turnChip", { n: view.turnNumber })
                : null
        }
        onTap={onChip}
      />
    );
  }

  const buttons = (
    <>
      {view.canPass && (
        <PassTurnButton
          index={index}
          seatId={seatId}
          rotation={rotation}
          hold={view.passMode === "hold"}
          short={compact || (twoUp && tight)}
        />
      )}
      {(view.canAttack || view.canDeclare) && (
        <Suspense fallback={null}>
          {view.canAttack && <AttackButton index={index} compact={tight} />}
          {view.canDeclare && <DeclaredButton index={index} compact={tight} />}
        </Suspense>
      )}
      {view.canReturn && (
        <BarButton
          testId={`seat-${index}-return`}
          tone="accent"
          compact={compact}
          title={t("timer.resolveFirst")}
          label={t("timer.returnToMe")}
          short={t("timer.returnShort")}
          onClick={() => dispatch({ type: "TIMER_RETURN_TO_ACTIVE" })}
          icon={<Undo2 aria-hidden size={20} />}
        />
      )}
      {view.canPassBack && (
        <BarButton
          testId={`seat-${index}-passback`}
          tone="respond"
          compact={compact}
          label={t("timer.passBack")}
          short={t("timer.passBackShort")}
          onClick={() => dispatch({ type: "TIMER_PASS_BACK", seatId })}
          icon={<Undo2 aria-hidden size={20} />}
        />
      )}
      {view.canRespond && (
        <BarButton
          testId={`seat-${index}-respond`}
          tone="respond"
          compact={compact || view.canReturn || (view.canDeclare && tight)}
          label={t("timer.respond")}
          short={view.canReturn ? undefined : t("timer.respondShort")}
          onClick={() => dispatch({ type: "TIMER_RESPOND", seatId })}
          icon={<Zap aria-hidden size={20} />}
        />
      )}
    </>
  );

  const boxCls =
    "pointer-events-none absolute left-1/2 flex w-max -translate-x-1/2 items-center justify-center gap-1.5 text-white";
  const boxStyle = (b: TimerTileMetrics["chip"]): CSSProperties => ({
    top: b.top,
    height: b.h,
    maxWidth: b.maxW,
  });
  const peekEl = peek && <ClockPeek index={index} seatId={seatId} />;

  return (
    <>
      {view.clocks && (
        <TileFrame index={index} seatId={seatId} holding={view.holding} responder={view.isTop} />
      )}
      {band ? (
        <>
          <div
            data-testid={`seat-${index}-timerbar`}
            data-holding={view.holding || undefined}
            className={boxCls}
            style={boxStyle(metrics.chip)}
          >
            {chip}
            {peekEl}
          </div>
          <div className={boxCls} style={boxStyle(metrics.buttons)}>
            <div className="pointer-events-auto flex shrink-0 items-center gap-1.5">{buttons}</div>
          </div>
        </>
      ) : (
        <div
          data-testid={`seat-${index}-timerbar`}
          data-holding={view.holding || undefined}
          className={boxCls}
          style={boxStyle(metrics.chip)}
        >
          {chip}
          <div className="pointer-events-auto flex shrink-0 items-center gap-1.5">{buttons}</div>
          {peekEl}
        </div>
      )}
    </>
  );
});

/** TMR-041 holder border (⚡ accent for a responder); overtime flashes it red (§9.5); warnings flash. */
function TileFrame({
  index,
  seatId,
  holding,
  responder,
}: {
  index: number;
  seatId: SeatId;
  holding: boolean;
  responder: boolean;
}) {
  const state = useGameValue((g) => g.timer.clocks[seatId]?.state ?? "normal");
  const flash = useTimerUi((s) => s.flashes[seatId]);
  const red = state === "overtime" || state === "flagged";
  if (!holding && !red && !flash) return null;
  return (
    <span
      key={flash?.nonce}
      aria-hidden
      data-testid={`seat-${index}-frame`}
      data-state={state}
      className={cn(
        "pointer-events-none absolute inset-0 rounded-tile ring-4 ring-inset",
        red ? "ring-danger" : flash ? "ring-warning" : responder ? "ring-respond" : "ring-timer",
        state === "overtime" && "timer-flash-loop",
        flash && "timer-flash",
      )}
    />
  );
}

// ---------------------------------------------------------------------------------------------

function ClockChip({
  index,
  seatId,
  px,
  holding,
  responder,
  paused,
  waiting,
  caption,
  onTap,
}: {
  index: number;
  seatId: SeatId;
  px: number;
  holding: boolean;
  responder: boolean;
  paused: boolean;
  waiting: boolean;
  caption: string | null;
  onTap: () => void;
}) {
  const clock = useClock(seatId);
  const flash = useTimerUi((s) => s.flashes[seatId]);
  const showTurnTime = useGameValue(
    (g) => g.timer.config.showTurnTime && g.turn.activeSeat === seatId,
  );
  if (!clock) return null;
  const low =
    clock.state === "overtime" ||
    clock.state === "flagged" ||
    clock.state === "timedOut" ||
    (Number.isFinite(clock.remainingMs) && clock.remainingMs < 10_000 && !waiting);
  const stateCaption =
    clock.state === "overtime"
      ? t("timer.overtime")
      : clock.state === "flagged"
        ? t("timer.flagged")
        : null;
  const top = stateCaption ?? (holding && paused ? t("timer.paused") : caption);
  return (
    <button
      type="button"
      data-testid={`seat-${index}-clock`}
      data-state={clock.state}
      data-holder={holding || undefined}
      data-running={clock.running || undefined}
      data-responder={responder || undefined}
      data-flash={flash?.kind}
      title={t("timer.chipHint")}
      onClick={onTap}
      className={cn(
        "pointer-events-auto relative flex min-w-0 shrink-0 flex-col items-center justify-center rounded-2xl px-3 leading-none",
        holding ? "bg-black/70" : "bg-black/45",
        !holding && !waiting && "opacity-80",
        holding && !paused && "timer-holder",
        responder && "ring-2 ring-respond",
        holding && !responder && "ring-2 ring-timer",
        low && "text-danger ring-2 ring-danger",
        clock.state === "overtime" && "timer-overtime",
        flash && "timer-flash",
      )}
      style={{ minHeight: 40 }}
      key={flash?.nonce}
    >
      {top && (
        <span className="mb-0.5 max-w-full truncate text-[11px] font-semibold uppercase tracking-wide text-white/85">
          {top}
        </span>
      )}
      <span className="flex items-center gap-1 font-bold tabular" style={{ fontSize: px }}>
        {holding && (
          <span
            aria-hidden
            className={cn(responder ? "text-respond" : "text-timer")}
            style={{ fontSize: px * 0.6 }}
          >
            {responder ? "⚡" : "▶"}
          </span>
        )}
        {/* A11Y-004: low time / overtime is not signalled by the red colour alone. */}
        {low && (
          <TriangleAlert
            data-testid={`seat-${index}-clock-low`}
            role="img"
            aria-label={t("timer.lowTime")}
            className="shrink-0"
            style={{ width: px * 0.6, height: px * 0.6 }}
          />
        )}
        <span data-testid={`seat-${index}-clock-time`}>{clock.display}</span>
      </span>
      {showTurnTime && holding && <TurnTime seatId={seatId} />}
    </button>
  );
}

/** TMR-043: "this turn 1:23" under the active seat's time (ticks only while it holds). */
function TurnTime({ seatId }: { seatId: SeatId }) {
  const ms = useTicking((g, now) => turnTimeUsed(g, seatId, now));
  return (
    <span
      data-testid={`turn-time-${seatId}`}
      className="mt-0.5 text-[11px] font-semibold text-white/80 tabular"
    >
      {t("timer.turnTime", { time: formatClock(ms, { showTenths: false }) })}
    </span>
  );
}

/** Re-computes `fn(game, now)` every 250 ms while the clocks run (tiny isolated components). */
function useTicking(fn: (g: Game, now: number) => number): number {
  const game = useGameStore((s) => s.session?.game);
  const now = useTickNow(game?.timer.status === "running");
  return game ? fn(game, now) : 0;
}

function ResponseBanner({
  index,
  view,
  px,
  compact,
}: {
  index: number;
  view: ReturnType<typeof seatTimerView>;
  px: number;
  compact: boolean;
}) {
  const elapsed = useTicking((g, now) => responseElapsed(g, now));
  return (
    <div
      data-testid={`seat-${index}-banner`}
      role="status"
      className={cn(
        "flex min-w-0 shrink items-center overflow-hidden rounded-2xl bg-black/75 py-1 font-semibold ring-2 ring-respond",
        compact ? "gap-1 px-2" : "gap-1.5 px-3",
      )}
      title={view.isTurn ? t("timer.resolveFirst") : undefined}
    >
      {/* Short tiles: the ⚡×N badge doubles as the icon. */}
      {!(compact && view.depth > 1) && (
        <Zap aria-hidden size={16} className="shrink-0 text-respond" />
      )}
      {/* A-7: compact tiles abbreviate the responder's name rather than hiding it. */}
      <span
        data-testid={`seat-${index}-banner-name`}
        className={cn(
          "min-w-0 truncate",
          compact ? "min-w-[2.5rem] max-w-[5.5rem] text-xs" : "text-sm",
        )}
      >
        {t("timer.bannerName", { name: view.responderName })}
      </span>
      <span
        className="shrink-0 font-bold tabular"
        style={{ fontSize: compact ? 15 : Math.max(14, px) }}
      >
        {formatClock(elapsed, { showTenths: false })}
      </span>
      {view.depth > 1 && (
        <span
          data-testid={`seat-${index}-depth`}
          className="shrink-0 rounded-full bg-respond px-1.5 text-xs font-bold text-black"
        >
          {t("timer.depth", { n: view.depth })}
        </span>
      )}
    </div>
  );
}

function ClockPeek({ index, seatId }: { index: number; seatId: SeatId }) {
  const clock = useClock(seatId);
  if (!clock) return null;
  return (
    <div
      data-testid={`seat-${index}-clock-peek`}
      role="status"
      className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 flex -translate-x-1/2 flex-col items-center rounded-2xl bg-black/85 px-4 py-2 text-white shadow-xl"
    >
      <span className="text-2xl font-bold tabular">
        {t("timer.peekRemaining", { time: clock.display })}
      </span>
      <span className="text-sm tabular text-white/85">
        {t("timer.peekUsed", { time: formatClock(clock.usedMs, { showTenths: false }) })}
      </span>
    </div>
  );
}

function BarButton({
  testId,
  label,
  title,
  icon,
  tone,
  compact,
  short,
  onClick,
}: {
  testId: string;
  label: string;
  title?: string;
  icon: React.ReactNode;
  tone: "accent" | "respond";
  compact?: boolean;
  /** A-7: short visible caption under the icon on compact (icon-only) buttons. */
  short?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      aria-label={label}
      title={title ?? label}
      onClick={onClick}
      className={cn(
        "inline-flex h-12 min-w-12 shrink-0 select-none items-center justify-center gap-1 rounded-full px-3 text-sm font-bold shadow active:scale-95",
        tone === "respond" ? "bg-respond text-black" : "bg-accent text-accent-fg",
        compact && "flex-col gap-0 px-1",
      )}
    >
      {icon}
      {!compact && <span className="whitespace-nowrap">{label}</span>}
      {compact && short && (
        <span aria-hidden className="whitespace-nowrap text-[0.6rem] leading-none">
          {short}
        </span>
      )}
    </button>
  );
}

/**
 * PASS TURN with the pass chime and (optionally) the 3 s "Passed to {name} · Undo" snackbar facing
 * the passing seat. Shared by the button and the A11Y-005 keyboard shortcut on a focused seat.
 */
export function passTurnWithUndo(
  seatId: SeatId,
  rotation: Rotation,
  withUndo = true,
  anchor: SnackAnchor = { rotation, seatId },
): boolean {
  const r = passTurn();
  if (!r) return false;
  playTone("pass", "taps");
  if (withUndo) {
    useSnackbar.getState().show({
      message: t("timer.passedTo", { name: r.nextName }),
      actionLabel: t("common.undo"),
      durationMs: PASS_UNDO_MS,
      rotation,
      anchor,
      onAction: r.undo,
    });
  }
  return true;
}

/**
 * TMR-003/004: tap + 3 s undo snackbar on the passing seat (anchored to the seat tile when the
 * board registers it, else to this button — D-043/D-058), or hold-to-pass (600 ms).
 */
function PassTurnButton({
  index,
  seatId,
  rotation,
  hold,
  short,
}: {
  index: number;
  seatId: SeatId;
  rotation: Rotation;
  hold: boolean;
  short: boolean;
}) {
  const show = useSnackbar((s) => s.show);
  const [holding, setHolding] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const anchor = (): SnackAnchor => {
    const r = btnRef.current?.getBoundingClientRect();
    return {
      rotation,
      seatId,
      ...(r ? { rect: { left: r.left, top: r.top, width: r.width, height: r.height } } : {}),
    };
  };
  const doPass = (withUndo: boolean) => {
    // Anchor before the pass: the button unmounts once the turn moves on.
    passTurnWithUndo(seatId, rotation, withUndo, anchor());
  };
  const gesture = useHold({
    delay: PASS_HOLD_MS,
    onHold: () => {
      setHolding(false);
      doPass(false);
    },
    onTap: () => {
      setHolding(false);
      show({ message: t("timer.holdToPass"), durationMs: 2000, rotation, anchor: anchor() });
    },
  });
  const cls = cn(
    "relative inline-flex h-12 shrink-0 select-none items-center justify-center gap-1.5 overflow-hidden rounded-full bg-white px-4 text-sm font-extrabold uppercase tracking-wide text-black shadow-lg active:scale-95",
    short ? "px-3" : "min-w-28",
  );
  const label = hold ? t("timer.holdPass") : t("timer.pass");
  if (!hold) {
    return (
      <button
        ref={btnRef}
        type="button"
        data-testid={`seat-${index}-pass`}
        aria-label={label}
        className={cls}
        onClick={() => doPass(true)}
      >
        <Hand aria-hidden size={18} />
        <span className="whitespace-nowrap">{short ? t("timer.passShort") : t("timer.pass")}</span>
      </button>
    );
  }
  return (
    <button
      ref={btnRef}
      type="button"
      data-testid={`seat-${index}-pass`}
      data-hold="1"
      aria-label={label}
      className={cls}
      {...gesture}
      onPointerDown={(e) => {
        setHolding(true);
        gesture.onPointerDown(e);
      }}
      onPointerUp={(e) => {
        setHolding(false);
        gesture.onPointerUp(e);
      }}
      onPointerCancel={(e) => {
        setHolding(false);
        gesture.onPointerCancel(e);
      }}
      onPointerLeave={(e) => {
        setHolding(false);
        gesture.onPointerLeave(e);
      }}
      onClick={(e) => {
        if (e.detail === 0) doPass(true); // keyboard activation: tap semantics with undo
      }}
    >
      <span
        aria-hidden
        className="absolute inset-y-0 left-0 bg-timer/60"
        style={{
          width: holding ? "100%" : "0%",
          transition: holding ? `width ${PASS_HOLD_MS}ms linear` : "none",
        }}
      />
      <Hand aria-hidden size={18} className="relative" />
      <span className="relative whitespace-nowrap">
        {short ? t("timer.passShort") : t("timer.pass")}
      </span>
    </button>
  );
}
