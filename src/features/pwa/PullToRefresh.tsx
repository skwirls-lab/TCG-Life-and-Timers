"use client";
/**
 * Pull-to-refresh for the installed app. Browsers offer it in a normal tab, but an installed PWA
 * (standalone display mode) has none, so pages had no obvious way to refresh. Pulling down from
 * the top of any page except the game board shows a small indicator; releasing past the threshold
 * reloads (taking a waiting app update with it).
 */
import { RotateCw } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { isStandalone } from "@/lib/device/fullscreen";
import { t } from "@/lib/i18n";
import { pullProgress, PULL_THRESHOLD } from "./pull";

export function PullToRefresh() {
  const pathname = usePathname();
  const [pull, setPull] = useState(0);
  const start = useRef<number | null>(null);
  const dist = useRef(0);

  useEffect(() => {
    if (pathname?.startsWith("/play")) return;
    const nav = navigator as Navigator & { standalone?: boolean };
    if (!isStandalone((q) => window.matchMedia(q), nav)) return;

    const onStart = (e: TouchEvent) => {
      const target = e.target as Element | null;
      // Not inside dialogs/sheets or anything that scrolls on its own.
      if (e.touches.length !== 1 || window.scrollY > 0) return;
      if (target?.closest('[role="dialog"], [data-no-pull-refresh]')) return;
      start.current = e.touches[0]!.clientY;
      dist.current = 0;
    };
    const onMove = (e: TouchEvent) => {
      if (start.current === null) return;
      const dy = e.touches[0]!.clientY - start.current;
      if (dy <= 0 || window.scrollY > 0) {
        start.current = null;
        dist.current = 0;
        setPull(0);
        return;
      }
      dist.current = dy;
      setPull(dy);
    };
    const onEnd = () => {
      if (start.current === null) return;
      const done = dist.current >= PULL_THRESHOLD;
      start.current = null;
      dist.current = 0;
      setPull(0);
      if (done) window.location.reload();
    };
    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchmove", onMove, { passive: true });
    window.addEventListener("touchend", onEnd);
    window.addEventListener("touchcancel", onEnd);
    return () => {
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
      window.removeEventListener("touchcancel", onEnd);
    };
  }, [pathname]);

  if (pull <= 0) return null;
  const { offset, ready, turn } = pullProgress(pull);
  return (
    <div
      data-testid="pull-refresh"
      data-ready={ready || undefined}
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed left-1/2 top-0 z-[90] flex -translate-x-1/2 items-center gap-2 rounded-full bg-surface px-3 py-2 text-sm text-fg shadow-lg ring-1 ring-border"
      style={{ transform: `translate(-50%, ${offset}px)` }}
    >
      <RotateCw aria-hidden size={18} style={{ transform: `rotate(${turn}deg)` }} />
      <span>{ready ? t("pwa.pullRelease") : t("pwa.pullHint")}</span>
    </div>
  );
}
