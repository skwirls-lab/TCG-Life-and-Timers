"use client";
/**
 * /play (T1.7/T1.8): loads the session (test quick-start → memory → IndexedDB resume → /setup),
 * renders the board inside the error boundary, mounts game-flow overlays and the seat menu, and
 * runs device services while on the board (wake lock PWA-005; fullscreen + audio unlock on the
 * first tap PWA-006/INP-008).
 */
import { useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
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
import { CENTER_MENU_CSS } from "./CenterMenuButton";
import { CenterMenuHost } from "./CenterMenuHost";
import { closeCenterMenu, resumeAfterReturn } from "./centerMenu";
import { CenterMenuPanel, PlayersSheet, QuickToolsMenu, Toolbar } from "./lazySheets";
import { parseSettingsParams } from "./boardHelpers";
import { isCenterMenu, useBoardUi } from "./boardStore";
import { lazyComponent } from "@/lib/hooks/lazyComponent";

// PERF-003: sheets that are not needed for the first paint of the board load on demand.
const SeatMenu = lazyComponent(() => import("@/features/seat/SeatMenu").then((m) => m.SeatMenu));
// A11Y-001 live region: not needed for the first paint either (it only speaks after changes).
const LiveAnnouncer = lazyComponent(() => import("./LiveAnnouncer").then((m) => m.LiveAnnouncer));
const CalculatorSheet = lazyComponent(() =>
  import("@/features/calculator/CalculatorSheet").then((m) => m.CalculatorSheet),
);
// PROF-010/ART-008: automatic commander backgrounds (Scryfall client loads on demand).
const CommanderArtLayer = lazyComponent(() =>
  import("@/features/profiles/CommanderArtLayer").then((m) => m.CommanderArtLayer),
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
      const strip = useSettingsStore.getState().settings.menuStyle === "strip";
      const loaders = [
        SeatMenu.preload,
        CalculatorSheet.preload,
        QuickToolsMenu.preload,
        PlayersSheet.preload,
        strip ? Toolbar.preload : CenterMenuPanel.preload,
      ];
      for (const load of loaders) void load().catch(() => undefined);
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

  // MENU: back from a page opened from the center menu → apply its closing rule before paint
  // (resume the clocks it paused), so the PAUSED overlay does not flash.
  useLayoutEffect(() => {
    if (ready && hasSession) resumeAfterReturn();
  }, [ready, hasSession]);

  useDeviceServices(ready && hasSession);
  usePrefetchSheets(ready && hasSession);

  return (
    <main
      className="no-select fixed inset-0 overflow-hidden overscroll-none bg-bg safe-area"
      data-testid="play"
      aria-label={t("board.label")}
    >
      <style>{BOARD_CSS + CENTER_MENU_CSS}</style>
      {ready && hasSession ? (
        <GameErrorBoundary>
          <h1 className="sr-only">{t("board.label")}</h1>
          <Board />
          <LiveAnnouncer />
          <CommanderArtLayer />
          <GameFlowOverlays />
          {/* TIMER-UI: clock services + PAUSED overlay (T2.5/T2.6) */}
          <TimerLayer />
          <CenterMenuHost />
          {menu !== null && !isCenterMenu(menu) && (
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
              onClose={() => {
                closeCalc();
                // Opened from the center menu: its closing rule applies now (MENU).
                closeCenterMenu();
              }}
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
