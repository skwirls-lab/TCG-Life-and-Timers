"use client";
import { useEffect, useRef, useState } from "react";
import { useActiveGameFlag } from "@/lib/app/activeGame";
import { t } from "@/lib/i18n";

/**
 * PWA-004: when a new service worker is waiting, offer a reload, but only while no game
 * is in progress. We never reload automatically.
 */
export function UpdatePrompt() {
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);
  const inProgress = useActiveGameFlag((s) => s.inProgress);
  const userRequested = useRef(false);

  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    let cancelled = false;
    void navigator.serviceWorker.getRegistration().then((reg) => {
      if (!reg || cancelled) return;
      if (reg.waiting) setWaiting(reg.waiting);
      reg.addEventListener("updatefound", () => {
        const sw = reg.installing;
        sw?.addEventListener("statechange", () => {
          if (sw.state === "installed" && navigator.serviceWorker.controller) setWaiting(sw);
        });
      });
    });
    // Only reload when the user asked for the update; first-install clientsClaim must not reload.
    const onCtrl = () => {
      if (userRequested.current) window.location.reload();
    };
    navigator.serviceWorker.addEventListener("controllerchange", onCtrl);
    return () => {
      cancelled = true;
      navigator.serviceWorker.removeEventListener("controllerchange", onCtrl);
    };
  }, []);

  if (!waiting || inProgress) return null;
  return (
    <div
      role="status"
      data-testid="update-prompt"
      className="fixed inset-x-3 bottom-3 z-[70] flex items-center gap-3 rounded-2xl bg-surface-3 p-3 shadow-xl"
    >
      <span className="flex-1">{t("pwa.updateAvailable")}</span>
      <button
        type="button"
        className="min-h-12 rounded-xl bg-accent px-4 font-semibold text-accent-fg"
        onClick={() => {
          userRequested.current = true;
          waiting.postMessage({ type: "SKIP_WAITING" });
        }}
      >
        {t("pwa.reload")}
      </button>
    </div>
  );
}
