"use client";
/**
 * Board-level timer layer (T2.5 / T2.6 / T2.7), mounted once by PlayScreen:
 * - runs the timer scheduler while the board is shown (TMR-051)
 * - warning / timeout / match-end signals → tile flash + sound (Settings › Sounds › Alerts) +
 *   vibration (Settings › Haptics) (TMR-031)
 * - "+N min added (once)" notice when the add-time-once extension kicks in (§9.5)
 * - SET-013: pauses the clocks while the seat menu is open or the board is left for Settings /
 *   History / Tools (config.autoPauseMenus); the PAUSED overlay is the resume prompt on return
 * - the full-screen PAUSED overlay with a big Resume (TMR-020/021)
 */
import { Play } from "lucide-react";
import { useEffect } from "react";
import { useSnackbar } from "@/components/ui/Snackbar";
import { formatClock, warningFor } from "@/engine";
import { useBoardUi } from "@/features/board/boardStore";
import { t } from "@/lib/i18n";
import { useDispatch, useGameStore, useGameValue } from "@/state/gameStore";
import { onTimerSignal, startTimerScheduler } from "@/state/timerScheduler";
import { buzz, pauseForMenus, playTone } from "./actions";
import { useTimerUi } from "./timerUi";

export const TIMER_CSS = `
@keyframes timer-pulse { 0%,100% { transform: scale(1); } 50% { transform: scale(1.04); } }
@keyframes timer-flash { 0%,100% { opacity: 1; } 25%,75% { opacity: .35; } }
@media (prefers-reduced-motion: no-preference) {
  .timer-holder { animation: timer-pulse 1.6s ease-in-out infinite; }
  .timer-flash { animation: timer-flash .5s ease-in-out 3; }
  .timer-overtime { animation: timer-flash 1s ease-in-out infinite; }
  .timer-flash-loop { animation: timer-flash 1s ease-in-out infinite; }
}
`;

let boardMounts = 0;

function useTimerServices() {
  // Scheduler (one per app) while the board is shown; other pages pause the clocks (SET-013).
  useEffect(() => {
    boardMounts++;
    const stop = startTimerScheduler();
    return () => {
      stop();
      boardMounts--;
      // Deferred so a dev StrictMode remount does not count as leaving the board.
      setTimeout(() => {
        if (boardMounts === 0) pauseForMenus();
      }, 0);
    };
  }, []);

  // Signals → feedback (TMR-031, §9.5).
  useEffect(
    () =>
      onTimerSignal((sig) => {
        const flash = useTimerUi.getState().flash;
        if (sig.kind === "warning") {
          // TMR-031: each threshold has its own sound / vibrate / flash flags.
          const cfg = useGameStore.getState().session?.game.timer.config;
          const w = cfg ? warningFor(cfg, sig.thresholdMs) : null;
          if (sig.seatId && w?.flash !== false) flash(sig.seatId, "warning");
          if (w?.sound !== false) playTone("warn");
          if (w?.vibrate !== false) buzz("warn");
        } else if (sig.kind === "timeout" || sig.kind === "graceEnd") {
          if (sig.seatId) flash(sig.seatId, "timeout");
          playTone("timeout");
          buzz("timeout");
        } else if (sig.kind === "blockersEnd") {
          // Declare-blockers time is up: the warning alerts on every seat (Sounds / Haptics).
          const g = useGameStore.getState().session?.game;
          for (const s of g?.seats ?? []) if (!s.eliminated) flash(s.id, "warning");
          playTone("warn");
          buzz("warn");
          useSnackbar.getState().show({ message: t("timer.blockersUp"), durationMs: 4000 });
        } else if (sig.kind === "matchEnd") {
          playTone("timeout");
          buzz("timeout");
          const g = useGameStore.getState().session?.game;
          useSnackbar.getState().show({
            message: t("timer.match.banner", { n: g?.timer.match?.extraTurnsRemaining ?? 0 }),
            durationMs: 6000,
          });
        }
      }),
    [],
  );

  // Add-time-once notice (and seat-menu auto-pause, SET-013).
  useEffect(() => {
    const unsubGame = useGameStore.subscribe((state, prev) => {
      const g = state.session?.game;
      const p = prev.session?.game;
      if (!g || !p || g.id !== p.id) return;
      for (const seat of g.seats) {
        const c = g.timer.clocks[seat.id];
        if (c?.addOnceUsed && !p.timer.clocks[seat.id]?.addOnceUsed) {
          useSnackbar.getState().show({
            message: t("timer.addOnce", {
              name: seat.name,
              time: formatClock(g.timer.config.addOnceMs, { showTenths: false }),
            }),
            durationMs: 4000,
          });
        }
      }
    });
    const unsubMenu = useBoardUi.subscribe((state, prev) => {
      if (state.menu && !prev.menu) pauseForMenus();
    });
    return () => {
      unsubGame();
      unsubMenu();
    };
  }, []);
}

export function TimerLayer() {
  useTimerServices();
  return (
    <>
      <style>{TIMER_CSS}</style>
      <PauseOverlay />
    </>
  );
}

function PauseOverlay() {
  const dispatch = useDispatch();
  const menuOpen = useBoardUi((s) => s.menu !== null);
  const paused = useGameValue((g) =>
    g.timer.status === "paused" && g.status !== "ended" ? (g.timer.pausedReason ?? "user") : null,
  );
  if (!paused || menuOpen) return null;
  return <PausedDialog paused={paused} onResume={() => dispatch({ type: "TIMER_RESUME" })} />;
}

function PausedDialog({ paused, onResume }: { paused: string; onResume: () => void }) {
  // A-8: snackbars ("Passed to … · Undo") must not sit on top of the PAUSED layer.
  useEffect(() => useSnackbar.getState().suppress(), []);
  const reason =
    paused === "background"
      ? t("timer.paused.background")
      : paused === "menu"
        ? t("timer.paused.menu")
        : t("timer.paused.user");
  return (
    <div
      data-testid="timer-paused"
      data-reason={paused}
      role="dialog"
      aria-modal="true"
      aria-labelledby="timer-paused-title"
      className="fixed inset-0 z-40 flex flex-col items-center justify-center gap-6 bg-black/80 p-6 text-center text-white"
    >
      <h2 id="timer-paused-title" className="text-5xl font-extrabold tracking-[0.2em]">
        {t("timer.paused.title")}
      </h2>
      <p className="max-w-xs text-lg text-white/85">{reason}</p>
      <button
        type="button"
        data-testid="timer-resume"
        autoFocus
        onClick={onResume}
        className="inline-flex min-h-16 min-w-48 items-center justify-center gap-3 rounded-full bg-success px-8 text-2xl font-extrabold uppercase text-black shadow-xl active:scale-95"
      >
        <Play aria-hidden size={28} />
        {t("timer.resume")}
      </button>
    </div>
  );
}
