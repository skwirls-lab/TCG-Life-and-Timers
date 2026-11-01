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
import { SeatMenu } from "@/features/seat/SeatMenu";
import { browserAudio } from "@/lib/device/audio";
import { enterFullscreen, isStandalone } from "@/lib/device/fullscreen";
import { browserWakeLock } from "@/lib/device/wakeLock";
import { t } from "@/lib/i18n";
import { GameErrorBoundary } from "@/state/GameErrorBoundary";
import { useGameStore } from "@/state/gameStore";
import { mergeSettings, useSettingsStore } from "@/state/settingsStore";
import { TEST_HOOKS_ENABLED, applyTestHooks } from "@/state/testHooks";
import { Board } from "./Board";
import { parseSettingsParams } from "./boardHelpers";
import { useBoardUi } from "./boardStore";

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
  }
  applyTestHooks(search);
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

export function PlayScreen() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const started = useRef(false);
  const hasSession = useGameStore((s) => s.session !== null);
  const menu = useBoardUi((s) => s.menu);
  const closeMenu = useBoardUi((s) => s.closeMenu);

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
      useBoardUi.setState({ menu: null, cmdMode: false });
    },
    [],
  );

  useDeviceServices(ready && hasSession);

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
          <SeatMenu
            seatId={menu?.seatId ?? ""}
            open={menu !== null}
            onClose={closeMenu}
            {...(menu?.tab ? { initialTab: menu.tab } : {})}
            {...(menu?.focusCounterId ? { focusCounterId: menu.focusCounterId } : {})}
            {...(menu?.rotation !== undefined ? { rotation: menu.rotation } : {})}
          />
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
