"use client";
/**
 * Per-seat clock display hook (T2.2, TMR-040/041, §10.2): `useClock(seatId)`.
 *
 * Subscribes only to the seat's own clock (plus the shared config), so a running clock never
 * re-renders other seats. While the seat holds a running clock the hook ticks at 4 Hz, or 10 Hz
 * under 10 s (when tenths are shown); everyone else renders a static value.
 */
import { useEffect, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import {
  clockAt,
  clockDisplayMs,
  clockRemaining,
  formatClock,
  holder,
  isCharging,
  type ClockState,
  type SeatId,
} from "@/engine";
import { useGameStore } from "./gameStore";

export interface ClockView {
  /** Time before the next timeout action (Infinity for count-up). */
  remainingMs: number;
  /** The value the chip shows (used time for count-up, per-turn part, grace in overtime…). */
  displayMs: number;
  /** Formatted per TMR-040. */
  display: string;
  state: ClockState;
  usedMs: number;
  /** The seat holds the clock (running or paused). */
  isHolder: boolean;
  /** The seat's clock is counting right now. */
  running: boolean;
}

export const TICK_MS = 250;
export const FAST_TICK_MS = 100;
const FAST_UNDER_MS = 10_000;

export function useClock(seatId: SeatId, opts: { now?: () => number } = {}): ClockView | undefined {
  const now = opts.now ?? Date.now;
  const sel = useGameStore(
    useShallow((s) => {
      const g = s.session?.game;
      const clock = g?.timer.clocks[seatId];
      if (!g || !clock) return null;
      const running = holder(g) === seatId && isCharging(g.timer);
      return {
        clock,
        config: g.timer.config,
        // The whole timer only for the running seat (it changes on every timer transition).
        timer: running ? g.timer : null,
        isHolder: g.timer.holder === seatId,
      };
    }),
  );
  const [, setTick] = useState(0);
  const timer = sel?.timer ?? null;

  useEffect(() => {
    if (!timer) return;
    let id: ReturnType<typeof setTimeout>;
    const schedule = () => {
      const c = clockAt({ timer }, seatId, now());
      const shown = c ? Math.abs(clockDisplayMs(c, timer.config)) : Number.POSITIVE_INFINITY;
      const fast = timer.config.showTenths && shown < FAST_UNDER_MS;
      id = setTimeout(
        () => {
          setTick((n) => n + 1);
          schedule();
        },
        fast ? FAST_TICK_MS : TICK_MS,
      );
    };
    schedule();
    return () => clearTimeout(id);
  }, [timer, seatId, now]);

  if (!sel) return undefined;
  const c = sel.timer ? (clockAt({ timer: sel.timer }, seatId, now()) ?? sel.clock) : sel.clock;
  const shown = clockDisplayMs(c, sel.config);
  return {
    remainingMs: clockRemaining(c, sel.config),
    displayMs: shown,
    display: formatClock(shown, { showTenths: sel.config.showTenths }),
    state: c.state,
    usedMs: c.usedMs,
    isHolder: sel.isHolder,
    running: sel.timer !== null,
  };
}
