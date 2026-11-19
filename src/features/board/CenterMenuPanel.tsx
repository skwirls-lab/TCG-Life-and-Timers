"use client";
/**
 * MENU: the center menu panel (lazy, PERF-003). A card over the dimmed board — brand header with
 * the clock status, a grid of labelled round actions (everything the toolbar strip offers,
 * including its "More" overflow, plus Full screen), and a big Resume. Closes on tap outside, Back
 * (top overlay only, D-070), Escape / M and Resume; see centerMenu.ts for the pause rules.
 * Test ids match the strip's (`toolbar-*`, `timer-start`, `match-clock`), so specs can use either.
 */
import {
  BookmarkPlus,
  Calculator,
  Dices,
  History,
  Maximize,
  Minimize,
  Pause,
  Play,
  RotateCcw,
  Settings,
  Timer,
  Users,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { AppMark } from "@/components/brand/AppMark";
import { GameIcon } from "@/components/icons/GameIcon";
import { aliveSeats, enumLabel, globalValue } from "@/engine";
import { shouldOpenCalculator } from "@/features/calculator/calc";

import { MatchClock, clockControlKind } from "@/features/timer/ClockToolbar";
import { startClocks } from "@/features/timer/actions";
import { enterFullscreen, exitFullscreen, fullscreenSupported } from "@/lib/device/fullscreen";
import { overlayStack } from "@/lib/hooks/overlayStack";
import { useHold } from "@/lib/hooks/useHold";
import { t } from "@/lib/i18n";
import { historyVisible } from "@/lib/records/policy";
import { cn } from "@/lib/ui/cn";
import { useDispatch, useGameStore, useGameValue } from "@/state/gameStore";
import { useSettingsStore } from "@/state/settingsStore";
import { enumStateIcon, toolbarGlobals } from "./boardHelpers";
import { useBoardUi } from "./boardStore";
import {
  closeCenterMenu,
  closeWithoutResume,
  keepClocksPaused,
  menuPausedClocks,
  openCenterSub,
} from "./centerMenu";
import { ResetButton } from "./ResetButton";

const tileCls =
  "relative flex min-h-[4.75rem] min-w-0 select-none flex-col items-center justify-start gap-1 rounded-2xl px-1 pt-1 pb-1.5 text-fg transition active:scale-95 focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-40";
const iconCls =
  "relative flex size-12 shrink-0 items-center justify-center rounded-full bg-surface-2 text-fg";
const labelCls = "relative w-full truncate text-center text-[0.72rem] font-medium leading-tight";

function Tile({
  testId,
  label,
  text,
  icon,
  className,
  iconClassName,
  labelClassName,
  ...rest
}: {
  testId: string;
  label: string;
  text: string;
  icon: ReactNode;
  className?: string;
  iconClassName?: string;
  /** Replaces the label's single-line truncation. */
  labelClassName?: string;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      data-testid={testId}
      aria-label={label}
      title={label}
      className={cn(tileCls, className)}
      {...rest}
    >
      <span aria-hidden className={cn(iconCls, iconClassName)}>
        {icon}
      </span>
      <span
        aria-hidden
        className={labelClassName ? labelCls.replace("truncate", labelClassName) : labelCls}
      >
        {text}
      </span>
    </button>
  );
}

/** Fullscreen state (PWA-006); null where the page can't go full screen (iOS Safari pages). */
function useFullscreen(): { on: boolean; toggle: () => void } | null {
  const [supported] = useState(
    () => typeof document !== "undefined" && fullscreenSupported(document),
  );
  const [on, setOn] = useState(
    () => typeof document !== "undefined" && !!document.fullscreenElement,
  );
  useEffect(() => {
    if (!supported) return;
    const sync = () => setOn(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, [supported]);
  if (!supported) return null;
  return {
    on,
    toggle: () => {
      if (document.fullscreenElement) void exitFullscreen(document);
      else void enterFullscreen(document);
    },
  };
}

/** Keep Tab inside the panel (aria-modal). */
/** Whether the current history entry is an overlay's Back entry (useBackClose / D-070). */
function overlayEntry(state: unknown): boolean {
  return !!state && typeof state === "object" && "overlay" in state;
}

function trapTab(e: React.KeyboardEvent<HTMLElement>) {
  if (e.key !== "Tab") return;
  const items = Array.from(
    e.currentTarget.querySelectorAll<HTMLElement>("button:not([disabled]), [tabindex='0']"),
  );
  if (items.length === 0) return;
  const first = items[0]!;
  const last = items[items.length - 1]!;
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
}

export function CenterMenuPanel({ leaving = false }: { leaving?: boolean }) {
  const router = useRouter();
  const dispatch = useDispatch();
  const panelRef = useRef<HTMLDivElement>(null);
  const resumeRef = useRef<HTMLButtonElement>(null);
  const kind = useGameValue(clockControlKind) ?? "off";
  const hasMatch = useGameValue((g) => g.timer.match !== undefined) ?? false;
  const players = useGameValue((g) => g.seats.length) ?? 0;
  const settings = useSettingsStore((s) => s.settings);
  const showHistory = useGameValue((g) => historyVisible(settings, g)) ?? true;
  const calcOn = useGameValue((g) => shouldOpenCalculator(g.preset, g.options)) ?? false;
  const globalsKey = useGameValue((g) =>
    toolbarGlobals(g).map((d) => {
      const idx = globalValue(g, d.id);
      return JSON.stringify([d.id, d.name, enumStateIcon(d, idx), enumLabel(d, idx) ?? "", d.icon]);
    }),
  );
  // Re-read on every render: the flag lives outside React state.
  const pausedHere = useBoardUi((s) => s.menuPaused) !== null && menuPausedClocks();
  const fullscreen = useFullscreen();

  // Back closes the menu (top overlay only, D-070); its entry is dropped when a page is opened.
  const backId = useRef<string | null>(null);
  useEffect(() => {
    const stack = overlayStack();
    const id = stack.push(() => closeCenterMenu());
    backId.current = id;
    return () => stack.release(id);
  }, []);

  useEffect(() => {
    resumeRef.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      if (e.key !== "Escape" && e.key !== "m" && e.key !== "M") return;
      // A sheet opened above the panel (reset confirm) handles its own Escape.
      const modals = document.querySelectorAll('[aria-modal="true"]');
      if (modals.length > 1 || (modals.length === 1 && modals[0] !== panelRef.current)) return;
      e.preventDefault();
      closeCenterMenu();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  /**
   * Leave the board from the menu: the clocks stay paused until the board is back. The page
   * replaces the menu's own Back entry, so Back from it returns straight to the board. The menu's
   * overlay-stack entry is forgotten (not released): a closed entry left on the stack would be
   * counted by a later trim on the new page and step history back too far.
   */
  const go = (path: string) => {
    const state: unknown = window.history.state;
    if (backId.current) overlayStack().forget(backId.current);
    backId.current = null;
    openCenterSub("route");
    if (overlayEntry(state)) {
      const { overlay: _overlay, ...rest } = state as Record<string, unknown>;
      window.history.replaceState(rest, "");
      router.replace(path);
    } else router.push(path);
  };

  const tools = useHold({
    delay: 500,
    onTap: () => go("/tools"),
    onHold: () => openCenterSub("tools"),
  });

  const openCalculator = () => {
    const g = useGameStore.getState().session?.game;
    if (!g) return;
    const alive = aliveSeats(g);
    const seat =
      g.seats.find((s) => s.id === g.turn.activeSeat && !s.eliminated) ?? alive[0] ?? g.seats[0];
    if (!seat) return;
    useBoardUi.getState().openCalc({ seatId: seat.id });
    openCenterSub("calc");
  };

  const status =
    kind === "start"
      ? t("board.menu.status.start")
      : kind === "off"
        ? t("board.menu.status.off")
        : kind === "ended"
          ? t("board.menu.status.ended")
          : pausedHere
            ? t("board.menu.status.pausedByMenu")
            : t("board.menu.status.paused");

  // The clock action: START, keep paused (the menu paused them), resume, or the disabled clock.
  let clock: ReactNode;
  if (kind === "start") {
    clock = (
      <button
        type="button"
        data-testid="timer-start"
        aria-label={t("timer.start")}
        onClick={() => {
          startClocks();
          closeWithoutResume();
        }}
        className="col-span-2 flex min-h-[4.75rem] select-none items-center justify-center gap-2 rounded-2xl bg-success px-3 text-base font-extrabold uppercase tracking-wider text-black shadow-lg transition active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        <Play aria-hidden size={22} />
        {t("timer.start")}
      </button>
    );
  } else if (kind === "paused" || kind === "running") {
    const keep = pausedHere || kind === "running";
    clock = (
      <Tile
        testId="toolbar-clock"
        data-state={keep ? "running" : "paused"}
        label={keep ? t("timer.toolbar.pause") : t("timer.toolbar.resume")}
        text={keep ? t("board.menu.item.pause") : t("board.menu.item.resume")}
        icon={keep ? <Pause size={24} /> : <Play size={24} />}
        iconClassName={keep ? undefined : "bg-accent text-accent-fg"}
        onClick={() => {
          if (keep) {
            if (kind === "running") dispatch({ type: "TIMER_PAUSE", reason: "user" });
            keepClocksPaused();
          } else {
            dispatch({ type: "TIMER_RESUME" });
            closeWithoutResume();
          }
        }}
      />
    );
  } else {
    clock = (
      <Tile
        testId="toolbar-clock"
        disabled
        label={kind === "off" ? t("timer.toolbar.off") : t("timer.toolbar.ended")}
        text={kind === "off" ? t("board.menu.item.clockOff") : t("board.menu.item.clockEnded")}
        icon={<Timer size={24} />}
      />
    );
  }

  if (leaving) return null;
  const globals = (globalsKey ?? []).map(
    (k) => JSON.parse(k) as [string, string, string, string, string],
  );

  return (
    <div className="fixed inset-0 z-[45]" data-testid="center-menu-root">
      <button
        type="button"
        tabIndex={-1}
        aria-label={t("board.menu.close")}
        data-testid="center-menu-backdrop"
        className="absolute inset-0 bg-black/70 backdrop-blur-[2px]"
        onClick={() => closeCenterMenu()}
      />
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-3">
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="center-menu-title"
          data-testid="center-menu-panel"
          onKeyDown={trapTab}
          className="pointer-events-auto flex max-h-full w-full max-w-[26rem] flex-col overflow-hidden rounded-[2rem] border border-white/10 bg-surface text-fg shadow-2xl landscape:max-w-[34rem]"
        >
          <div className="flex items-center gap-3 px-4 pt-4">
            <AppMark size={40} className="shrink-0" />
            <div className="min-w-0 flex-1">
              <h2 id="center-menu-title" className="truncate text-lg font-bold leading-tight">
                {t("board.menu.title")}
              </h2>
              <p
                data-testid="center-menu-status"
                className="truncate text-xs leading-tight text-fg-muted"
              >
                {status}
              </p>
            </div>
            {hasMatch && <MatchClock vertical={false} compact={false} />}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-2 pt-3">
            <div className="grid grid-cols-4 gap-1 landscape:grid-cols-6">
              {clock}
              <ResetButton className={tileCls} onDone={() => closeWithoutResume()}>
                <span aria-hidden className={iconCls}>
                  <RotateCcw size={24} />
                </span>
                <span aria-hidden className={labelCls}>
                  {t("board.menu.item.reset")}
                </span>
              </ResetButton>
              <Tile
                testId="toolbar-players"
                label={t("board.toolbar.players", { count: players })}
                text={t("board.menu.item.players", { count: players })}
                icon={<Users size={24} />}
                onClick={() => openCenterSub("players")}
              />
              {showHistory && (
                <Tile
                  testId="toolbar-history"
                  label={t("board.toolbar.history")}
                  text={t("board.menu.item.history")}
                  icon={<History size={24} />}
                  onClick={() => go("/history")}
                />
              )}
              <button
                type="button"
                aria-label={t("board.toolbar.tools")}
                title={t("board.toolbar.tools")}
                data-testid="toolbar-tools"
                className={tileCls}
                {...tools}
                onClick={(e) => {
                  if (e.detail === 0) go("/tools");
                }}
              >
                <span aria-hidden className={iconCls}>
                  <Dices size={24} />
                </span>
                <span aria-hidden className={labelCls}>
                  {t("board.menu.item.tools")}
                </span>
              </button>
              <Tile
                testId="toolbar-settings"
                label={t("board.toolbar.settings")}
                text={t("board.menu.item.settings")}
                icon={<Settings size={24} />}
                onClick={() => go("/settings")}
              />
              <Tile
                testId="center-menu-save-preset"
                label={t("setups.save.action")}
                text={t("setups.save.action")}
                // Two lines rather than "Save as pre…" (the visible text must match the name).
                labelClassName="line-clamp-2 whitespace-normal"
                icon={<BookmarkPlus size={24} />}
                onClick={() => openCenterSub("savePreset")}
              />
              {calcOn && (
                <Tile
                  testId="center-menu-calc"
                  label={t("board.menu.item.calculator")}
                  text={t("board.menu.item.calculator")}
                  icon={<Calculator size={24} />}
                  onClick={openCalculator}
                />
              )}
              {fullscreen && (
                <Tile
                  testId="center-menu-fullscreen"
                  aria-pressed={fullscreen.on}
                  label={t("board.menu.item.fullscreen")}
                  text={
                    fullscreen.on
                      ? t("board.menu.item.exitFullscreen")
                      : t("board.menu.item.fullscreen")
                  }
                  icon={fullscreen.on ? <Minimize size={24} /> : <Maximize size={24} />}
                  onClick={fullscreen.toggle}
                />
              )}
              {globals.map(([id, name, icon, label, baseIcon]) => (
                <Tile
                  key={id}
                  testId={baseIcon === "daynight" ? "toolbar-daynight" : `toolbar-global-${id}`}
                  data-state={label}
                  label={t("board.toolbar.global", { name, state: label })}
                  text={label || name}
                  icon={<GameIcon id={icon} size={24} />}
                  onClick={() => dispatch({ type: "ENUM_NEXT", counterId: id })}
                />
              ))}
            </div>
          </div>
          <div className="px-4 pb-4 pt-1">
            <button
              ref={resumeRef}
              type="button"
              data-testid="center-menu-resume"
              onClick={() => closeCenterMenu()}
              className="flex min-h-14 w-full select-none items-center justify-center gap-2 rounded-full bg-accent px-6 text-lg font-bold text-accent-fg shadow-lg transition active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fg"
            >
              {pausedHere && <Play aria-hidden size={22} />}
              {pausedHere ? t("board.menu.resume") : t("board.menu.back")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
