"use client";
/**
 * Timer scheduler (T2.2, TMR-051): arms ONE setTimeout for the game's next significant event
 * (`nextSignificantEvent`) and re-arms after every state change and on `visibilitychange`.
 *
 * - warning / matchEnd → `onTimerSignal` listeners (the UI lane plays sound / vibrates / flashes).
 * - timeout / graceEnd → listeners, then `dispatch({ type: 'TIMER_TIMEOUT', seatId })`.
 * - Hidden page with `config.autoPauseBackground` → `TIMER_PAUSE { reason: 'background' }` and an
 *   immediate autosave flush, so a reload shows the time at hide (TMR-021, Scenario 5). Without
 *   auto-pause, time keeps elapsing from timestamps and the visible page recomputes (a timeout
 *   that passed while throttled is dispatched at once).
 */
import { nextSignificantEvent, type Game, type SignificantEvent } from "@/engine";
import { flushAutosave, useGameStore, type GameStoreState } from "./gameStore";

export type TimerSignal = SignificantEvent;
export type TimerSignalListener = (signal: TimerSignal) => void;

const listeners = new Set<TimerSignalListener>();

/** Register a warning / timeout / match-end callback. Returns an unsubscribe function. */
export function onTimerSignal(cb: TimerSignalListener): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

function emit(signal: TimerSignal): void {
  for (const cb of [...listeners]) {
    try {
      cb(signal);
    } catch (e) {
      console.warn("[timerScheduler] signal listener failed", e);
    }
  }
}

/** The part of the Zustand store API the scheduler uses. */
export interface GameStoreLike {
  getState(): Pick<GameStoreState, "session" | "dispatch">;
  subscribe(listener: (state: GameStoreState, prev: GameStoreState) => void): () => void;
}

export interface TimerSchedulerOptions {
  /** Clock used to compute delays (defaults to Date.now, the same clock the store stamps). */
  now?: () => number;
}

let activeStop: (() => void) | null = null;

/** Start the scheduler (one per app; starting again replaces the previous one). Returns stop. */
export function startTimerScheduler(
  store: GameStoreLike = useGameStore,
  opts: TimerSchedulerOptions = {},
): () => void {
  activeStop?.();
  const now = opts.now ?? (() => Date.now());
  let handle: ReturnType<typeof setTimeout> | null = null;
  // Guards against re-firing a due timeout the engine did not apply (no state change).
  let lastDue: { game: Game; key: string } | null = null;

  const game = () => store.getState().session?.game;

  const clear = () => {
    if (handle !== null) clearTimeout(handle);
    handle = null;
  };

  const arm = () => {
    clear();
    const g = game();
    if (!g) return;
    const ev = nextSignificantEvent(g, now());
    if (!ev) return;
    handle = setTimeout(() => fire(ev), Math.max(0, ev.at - now()));
  };

  const fire = (ev: SignificantEvent) => {
    handle = null;
    if (now() < ev.at) return arm();
    const g = game();
    if (!g) return;
    if (ev.kind === "timeout" || ev.kind === "graceEnd" || ev.kind === "blockersEnd") {
      const key = `${ev.kind}:${ev.seatId}`;
      if (lastDue && lastDue.game === g && lastDue.key === key) return;
      lastDue = { game: g, key };
      emit(ev);
      store
        .getState()
        .dispatch(
          ev.kind === "blockersEnd"
            ? { type: "TIMER_BLOCKERS_END", reason: "timeout" }
            : { type: "TIMER_TIMEOUT", seatId: ev.seatId! },
        );
    } else {
      emit(ev);
    }
    arm();
  };

  const unsubscribe = store.subscribe((state, prev) => {
    if (state.session?.game !== prev.session?.game) arm();
  });

  const onVisibility = () => {
    const g = game();
    if (document.visibilityState === "hidden") {
      if (g && g.timer.status === "running" && g.timer.config.autoPauseBackground) {
        store.getState().dispatch({ type: "TIMER_PAUSE", reason: "background" });
        void flushAutosave();
      }
      return;
    }
    arm();
  };
  if (typeof document !== "undefined") document.addEventListener("visibilitychange", onVisibility);

  arm();
  const stop = () => {
    clear();
    unsubscribe();
    if (typeof document !== "undefined") {
      document.removeEventListener("visibilitychange", onVisibility);
    }
    if (activeStop === stop) activeStop = null;
  };
  activeStop = stop;
  return stop;
}
