"use client";
/**
 * MENU: the round brand-mark button in the middle of the board (default menu style). Tapping it
 * (or M / Escape on a keyboard) pauses running clocks and opens the center menu. A badge shows
 * when the clocks are ready to START or paused. When a match timer is set, the round clock (and
 * "TIME · N") stays visible in a small pill beside the button. In quick commander-damage mode the
 * button is swapped for the mode's Done button (CMD-006).
 */
import { Pause, Play, X } from "lucide-react";
import { useCallback, useEffect } from "react";
import { AppMark } from "@/components/brand/AppMark";
import { Button } from "@/components/ui/Button";
import { formatClock, matchRemaining } from "@/engine";
import { clockControlKind } from "@/features/timer/ClockToolbar";
import { useTickNow } from "@/features/timer/useTickNow";
import { t } from "@/lib/i18n";
import { cn } from "@/lib/ui/cn";
import { useGameStore, useGameValue } from "@/state/gameStore";
import { isCenterMenu, useBoardUi } from "./boardStore";
import { openCenterMenu, registerCenterButton, toggleCenterMenu } from "./centerMenu";
import { CENTER_BUTTON_PX, PILL_OFFSET_PX } from "./notch";

interface Props {
  /** The seam runs top-to-bottom (the cmd-mode Done button then reads sideways). */
  vertical: boolean;
}

/**
 * TMR-032 always-visible round clock under the button: "50:00", then "TIME · N" with the extra
 * turns left (same test ids as the toolbar's MatchClock).
 */
function MatchPill() {
  const game = useGameStore((s) => s.session?.game);
  const now = useTickNow(game?.timer.status === "running");
  if (!game) return null;
  const m = matchRemaining(game, now);
  if (!m) return null;
  const time = formatClock(m.remainingMs, { showTenths: false });
  return (
    <div
      data-testid="match-clock"
      data-called={m.timeCalled || undefined}
      role="timer"
      aria-label={
        m.timeCalled
          ? t("timer.match.calledLabel", { n: m.extraTurnsRemaining })
          : t("timer.match.label", { time })
      }
      style={{ top: PILL_OFFSET_PX + CENTER_BUTTON_PX / 2 }}
      className={cn(
        "pointer-events-none absolute left-1/2 flex h-6 -translate-x-1/2 items-center whitespace-nowrap rounded-full px-2 text-xs font-bold tabular ring-2 ring-bg",
        m.timeCalled ? "bg-danger text-white" : "bg-surface-3 text-fg",
      )}
    >
      {m.timeCalled ? (
        <span data-testid="match-time-called">
          {t("timer.match.called", { n: m.extraTurnsRemaining })}
        </span>
      ) : (
        <span data-testid="match-clock-time">{time}</span>
      )}
    </div>
  );
}

/** Keyboard target? (M / Escape must not fire while typing.) */
function isEditable(el: Element | null): boolean {
  if (!el) return false;
  const tag = el.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    (el as HTMLElement).isContentEditable === true
  );
}

/** A11Y: M or Escape toggles the menu on desktop (Escape only when nothing else is open). */
function useMenuKeys() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.repeat) return;
      const key = e.key;
      if (key !== "Escape" && key !== "m" && key !== "M") return;
      if (isEditable(document.activeElement)) return;
      const { menu } = useBoardUi.getState();
      // Another overlay (seat menu, sheet, PAUSED, game over…) owns Escape; the open center
      // menu handles its own keys.
      if (menu || document.querySelector('[aria-modal="true"]')) return;
      e.preventDefault();
      openCenterMenu();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}

export function CenterMenuButton({ vertical }: Props) {
  const kind = useGameValue(clockControlKind) ?? "off";
  const hasMatch = useGameValue((g) => g.timer.match !== undefined) ?? false;
  const cmdMode = useBoardUi((s) => s.cmdMode);
  const setCmdMode = useBoardUi((s) => s.setCmdMode);
  // The panel shows the match clock itself while it is up (no duplicate).
  const panelUp = useBoardUi((s) => isCenterMenu(s.menu) && !s.menu.sub);
  const ref = useCallback((el: HTMLButtonElement | null) => registerCenterButton(el), []);
  useMenuKeys();

  if (cmdMode) {
    return (
      <Button
        variant="primary"
        size="sm"
        data-testid="cmd-mode-exit"
        onClick={() => setCmdMode(false)}
        icon={<X size={20} />}
        className={cn("shadow-lg", vertical && "[writing-mode:vertical-rl]")}
      >
        {t("board.cmd.exit")}
      </Button>
    );
  }

  const badge = kind === "start" ? "start" : kind === "paused" ? "paused" : null;
  const label =
    badge === "start"
      ? t("board.menu.openStart")
      : badge === "paused"
        ? t("board.menu.openPaused")
        : t("board.menu.open");
  return (
    <div className="relative flex items-center justify-center">
      <button
        ref={ref}
        type="button"
        data-testid="center-menu"
        data-clock={kind}
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={panelUp}
        title={label}
        onClick={toggleCenterMenu}
        style={{ width: CENTER_BUTTON_PX, height: CENTER_BUTTON_PX }}
        className={cn(
          "relative flex select-none items-center justify-center rounded-full bg-bg p-1 shadow-[0_0_0_3px_var(--color-bg),0_6px_18px_rgba(0,0,0,0.55)] ring-1 ring-white/15 transition active:scale-95",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
        )}
      >
        <AppMark size={CENTER_BUTTON_PX - 8} />
        {badge && (
          <span
            aria-hidden
            data-testid="center-menu-badge"
            data-kind={badge}
            className={cn(
              "absolute -right-1 -top-1 flex size-5 items-center justify-center rounded-full ring-2 ring-bg",
              badge === "start" ? "bg-success text-black" : "bg-warning text-black",
              badge === "start" && "center-badge-pulse",
            )}
          >
            {badge === "start" ? (
              <Play size={11} strokeWidth={3} className="translate-x-px" />
            ) : (
              <Pause size={11} strokeWidth={3} />
            )}
          </span>
        )}
      </button>
      {hasMatch && !panelUp && <MatchPill />}
    </div>
  );
}

/** Badge pulse (no motion when the user asked for less). */
export const CENTER_MENU_CSS = `
@keyframes center-badge-pulse { 0%,100% { transform: scale(1); } 50% { transform: scale(1.18); } }
@media (prefers-reduced-motion: no-preference) {
  .center-badge-pulse { animation: center-badge-pulse 1.8s ease-in-out infinite; }
}
`;
