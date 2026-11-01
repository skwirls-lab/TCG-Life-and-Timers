"use client";
/**
 * Install UX (PWA-003): after the first completed game, offer "Install app" (Android/Chromium
 * `beforeinstallprompt`) or, on iOS Safari, an "Add to Home Screen" instruction sheet. Never on
 * first open, only on the launcher (never over the board or another screen's controls), never
 * once installed; "Not now" is remembered.
 * Mount once in Providers: `<InstallPromptHost />`.
 */
import { usePathname } from "next/navigation";
import { lazy, Suspense, useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { telemetryConfigured, useConsent } from "@/lib/analytics";
import { isStandalone } from "@/lib/device/fullscreen";
import { useMounted } from "@/features/consent/useMounted";
import {
  captureInstallPrompt,
  deferredInstallPrompt,
  subscribeInstall,
  wasInstalled,
} from "./installEvents";
import {
  installOffer,
  isIosSafari,
  justCompleted,
  readInstallRecord,
  writeInstallRecord,
  type InstallRecord,
} from "./policy";

// The visible card + iOS sheet load only when there is something to offer (PERF-003).
const InstallOfferUi = lazy(() => import("./InstallOfferUi"));

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function useInstallEvents(): { hasPrompt: boolean; installed: boolean } {
  const hasPrompt = useSyncExternalStore(
    subscribeInstall,
    () => deferredInstallPrompt() !== null,
    () => false,
  );
  const installed = useSyncExternalStore(subscribeInstall, wasInstalled, () => false);
  return { hasPrompt, installed };
}

export const TEST_INSTALL_KEY = "tcg.test.install";

/**
 * Test builds only: the offer is opt-in per tab (`?install=1`), so it can't cover controls in
 * unrelated specs that finish games on the iOS-emulated project. Production builds always allow.
 */
function installHookAllows(): boolean {
  if (process.env.NEXT_PUBLIC_TEST_HOOKS !== "1") return true;
  try {
    if (new URLSearchParams(window.location.search).get("install") === "1") {
      window.sessionStorage.setItem(TEST_INSTALL_KEY, "1");
    }
    return window.sessionStorage.getItem(TEST_INSTALL_KEY) === "1";
  } catch {
    return false;
  }
}

export function InstallPromptHost() {
  const mounted = useMounted();
  const pathname = usePathname();
  const { hasPrompt, installed } = useInstallEvents();
  const consentPending = useConsent((s) => s.choice === "unset");
  const [record, setRecord] = useState<InstallRecord | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const update = useCallback((patch: Partial<InstallRecord>) => {
    setRecord((r) => {
      const next = { ...(r ?? readInstallRecord(storage())), ...patch };
      writeInstallRecord(storage(), next);
      return next;
    });
  }, []);

  useEffect(() => {
    captureInstallPrompt();
    const rec = readInstallRecord(storage());
    const standalone = isStandalone(
      window.matchMedia.bind(window),
      navigator as Navigator & { standalone?: boolean },
    );
    // Lazy: the effect below is a no-op (setState in a promise) for already-decided devices.
    void Promise.resolve().then(() => setRecord(rec));
    if (rec.completedGame || rec.dismissedAt !== null || standalone) return;
    let unsub: (() => void) | null = null;
    let live = true;
    void import("@/state/gameStore").then(({ useGameStore }) => {
      if (!live) return;
      const initial = useGameStore.getState().session?.game;
      if (justCompleted(initial, undefined)) update({ completedGame: true });
      unsub = useGameStore.subscribe((s, prev) => {
        if (justCompleted(s.session?.game, prev.session?.game)) update({ completedGame: true });
      });
    });
    // Games finished on an earlier visit (before this feature) are in the records table.
    void import("@/lib/db")
      .then(({ getDb }) => getDb().records.count())
      .then((n) => live && n > 0 && update({ completedGame: true }))
      .catch(() => undefined);
    return () => {
      live = false;
      unsub?.();
    };
  }, [update]);

  const allowed = installHookAllows(); // evaluated on every route so ?install=1 is remembered
  if (!mounted || !record || pathname !== "/" || !allowed) return null;
  // Don't stack on top of the consent banner; the offer waits until consent is answered.
  if (consentPending && telemetryConfigured()) return null;
  const offer = installOffer({
    record,
    standalone: isStandalone(
      window.matchMedia.bind(window),
      navigator as Navigator & { standalone?: boolean },
    ),
    installed,
    hasPrompt,
    iosSafari: isIosSafari(navigator.userAgent, navigator.maxTouchPoints),
  });
  if (!offer && !sheetOpen) return null;

  return (
    <Suspense fallback={null}>
      <InstallOfferUi
        offer={offer}
        sheetOpen={sheetOpen}
        setSheetOpen={setSheetOpen}
        onDismiss={() => update({ dismissedAt: Date.now() })}
      />
    </Suspense>
  );
}
