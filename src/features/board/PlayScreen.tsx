"use client";
/**
 * /play (T1.7/T1.8): loads the session (test quick-start → memory → IndexedDB resume → /setup),
 * renders the board inside the error boundary, mounts game-flow overlays and the seat menu, and
 * runs device services while on the board (wake lock PWA-005; fullscreen + audio unlock on the
 * first tap PWA-006/INP-008).
 */
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { GameFlowOverlays } from "@/features/game-flow/GameFlowOverlays";
// TIMER-UI (W3): scheduler, signals, auto-pause and the PAUSED overlay; test-only `t.*` params.
import { TimerLayer } from "@/features/timer/TimerLayer";
import { applyTimerTestParams } from "@/features/timer/testParams";
import { browserAudio } from "@/lib/device/audio";
import { enterFullscreen, isStandalone } from "@/lib/device/fullscreen";
import { browserWakeLock } from "@/lib/device/wakeLock";
import { t } from "@/lib/i18n";
import { GameErrorBoundary } from "@/state/GameErrorBoundary";
import { useGameStore } from "@/state/gameStore";
import { mergeSettings, useSettingsStore } from "@/state/settingsStore";
import { TEST_HOOKS_ENABLED } from "@/state/testHooksFlag";
import { Board } from "./Board";
import { PlayersSheet, QuickToolsMenu } from "./Toolbar";
import { parseSettingsParams } from "./boardHelpers";
import { useBoardUi } from "./boardStore";
import { lazyComponent } from "@/lib/hooks/lazyComponent";

// PERF-003: sheets that are not needed for the first paint of the board load on demand.
const SeatMenu = lazyComponent(() => import("@/features/seat/SeatMenu").then((m) => m.SeatMenu));
const CalculatorSheet = lazyComponent(() =>
  import("@/features/calculator/CalculatorSheet").then((m) => m.CalculatorSheet),
);

const BOARD_CSS = `
@keyframes board-confetti {
  0% { transform: translateY(-10%) rotate(0deg); opacity: 1; }
  100% { transform: translateY(110cqh) rotate(540deg); opacity: 0.2; }
}
.board-confetti { animation: board-confetti 2.6s linear infinite; }
`;

async function loadSession(search: URLSearchParams): Promise<boolean> {
  const settings = useSettingsStore.getState();
  if (!settings.hydrated) await settings.load().catch(() => undefined);
  if (TEST_HOOKS_ENABLED) {
    const patch = parseSettingsParams(search);
    if (Object.keys(patch).length > 0) {
      useSettingsStore.setState((s) => ({ settings: mergeSettings({ ...s.settings, ...patch }) }));
    }
    // Dynamic so production builds drop the hooks (and the preset registry) entirely (PERF-003).
    const { applyTestHooks } = await import("@/state/testHooks");
    applyTestHooks(search);
    applyTimerTestParams(search); // TIMER-UI: test builds only, after a quick start
  }
  if (useGameStore.getState().session) return true;
  return useGameStore
    .getState()
    .resume()
    .catch(() => false);
}

function useDeviceServices(active: boolean) {
  const keepAwake = useSettingsStore((s) => s.settings.keepAwake);
  const fallback = useSettingsStore((s) => s.settings.keepAwakeFallback);

  useEffect(() => {
    if (!active || !keepAwake) return;
    const wl = browserWakeLock();
    void wl.enable({ fallback }).catch(() => undefined);
    return () => void wl.disable().catch(() => undefined);
  }, [active, keepAwake, fallback]);

  useEffect(() => {
    if (!active) return;
    const onFirst = () => {
      void browserAudio()
        .unlock()
        .catch(() => false);
      const { hideSystemBars } = useSettingsStore.getState().settings;
      if (
        hideSystemBars &&
        !isStandalone(
          (q) => window.matchMedia(q),
          navigator as Navigator & { standalone?: boolean },
        )
      ) {
        void enterFullscreen(document);
      }
    };
    window.addEventListener("pointerdown", onFirst, { once: true, capture: true });
    return () => window.removeEventListener("pointerdown", onFirst, { capture: true });
  }, [active]);
}

/**
 * Warm the lazily loaded sheets once the board is up and the main thread is idle, so the first
 * long-press / menu tap doesn't wait for the network (PERF-002) while keeping them out of the
 * initial /play JS (PERF-003). One-shot, no repeating work (PERF-004).
 */
function usePrefetchSheets(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const warm = () => {
      for (const c of [SeatMenu, CalculatorSheet, QuickToolsMenu, PlayersSheet]) {
        void c.preload().catch(() => undefined);
      }
    };
    const w = window as Window & {
      requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number;
      cancelIdleCallback?: (id: number) => void;
    };
    if (w.requestIdleCallback) {
      const id = w.requestIdleCallback(warm, { timeout: 3000 });
      return () => w.cancelIdleCallback?.(id);
    }
    const id = window.setTimeout(warm, 1500);
    return () => window.clearTimeout(id);
  }, [active]);
}

export function PlayScreen() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const started = useRef(false);
  const hasSession = useGameStore((s) => s.session !== null);
  const menu = useBoardUi((s) => s.menu);
  const closeMenu = useBoardUi((s) => s.closeMenu);
  const calc = useBoardUi((s) => s.calc);
  const closeCalc = useBoardUi((s) => s.closeCalc);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void loadSession(new URLSearchParams(window.location.search)).then((ok) => {
      if (ok) setReady(true);
      else router.replace("/setup");
    });
  }, [router]);

  useEffect(() => {
    if (ready && !hasSession) router.replace("/setup");
  }, [ready, hasSession, router]);

  useEffect(
    () => () => {
      useBoardUi.setState({ menu: null, cmdMode: false, calc: null });
    },
    [],
  );

  useDeviceServices(ready && hasSession);
  usePrefetchSheets(ready && hasSession);

  return (
    <main
      className="no-select fixed inset-0 overflow-hidden overscroll-none bg-bg safe-area"
      data-testid="play"
      aria-label={t("board.label")}
    >
      <style>{BOARD_CSS}</style>
      {ready && hasSession ? (
        <GameErrorBoundary>
          <h1 className="sr-only">{t("board.label")}</h1>
          <Board />
          <GameFlowOverlays />
          {/* TIMER-UI: clock services + PAUSED overlay (T2.5/T2.6) */}
          <TimerLayer />
          {menu !== null && (
            <SeatMenu
              seatId={menu.seatId}
              open
              onClose={closeMenu}
              {...(menu.tab ? { initialTab: menu.tab } : {})}
              {...(menu.focusCounterId ? { focusCounterId: menu.focusCounterId } : {})}
              {...(menu.rotation !== undefined ? { rotation: menu.rotation } : {})}
            />
          )}
          {calc && (
            <CalculatorSheet
              seatId={calc.seatId}
              open
              onClose={closeCalc}
              {...(calc.rotation !== undefined ? { rotation: calc.rotation } : {})}
            />
          )}
        </GameErrorBoundary>
      ) : (
        <p
          className="flex h-full items-center justify-center text-fg-muted"
          data-testid="play-loading"
        >
          {t("board.loading")}
        </p>
      )}
    </main>
  );
}
