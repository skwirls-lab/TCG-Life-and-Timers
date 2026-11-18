"use client";
/**
 * Center toolbar (T1.8) — PRD §7.2, LAY-010/011, SET-031, TOK-003, CMD-006 exit.
 * Positioned by the layout engine; icon-only with accessible names (labels via title/aria).
 */
import { Dices, Ellipsis, History, RotateCcw, Settings, Users, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { GameIcon } from "@/components/icons/GameIcon";
import type { Rect, ToolbarOrientation } from "@/engine/layout";
import type { Rotation } from "@/lib/ui/rotation";
import { enumLabel, globalValue, type CounterDefinition } from "@/engine";
import { ClockControl, MatchClock, clockControlKind } from "@/features/timer/ClockToolbar";
import { useHold } from "@/lib/hooks/useHold";
import { t } from "@/lib/i18n";
import { cn } from "@/lib/ui/cn";
import { useDispatch, useGameValue } from "@/state/gameStore";
import { historyVisible } from "@/lib/records/policy";
import { useSetting, useSettingsStore } from "@/state/settingsStore";
import {
  enumStateIcon,
  fitToolbar,
  toolbarGlobals,
  trackGlobals,
  type ToolbarItem,
} from "./boardHelpers";
import { TrackGauge, type TrackOwner } from "./TrackGauge";
import { useBoardUi } from "./boardStore";
import { PlayersSheet, QuickToolsMenu } from "./lazySheets";
import { ResetButton } from "./ResetButton";

const AUTO_HIDE_MS = 5000;

interface Props {
  rect: Rect;
  orientation: ToolbarOrientation;
  /** Seat rotations by seat index (owners of a shared track, A-4). */
  seatRotations?: readonly Rotation[];
  /**
   * MENU: with the center menu style the strip only carries a shared track (D-073); this node
   * (the center menu button) replaces the strip's buttons.
   */
  centerSlot?: ReactNode;
}

const btnBase =
  "relative inline-flex shrink-0 select-none items-center justify-center rounded-xl text-fg transition active:scale-95 focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-40";
const btnCls = (compact: boolean) => cn(btnBase, compact ? "size-11" : "size-12");

function ToolButton({
  label,
  testId,
  compact = false,
  children,
  ...rest
}: {
  label: string;
  testId: string;
  compact?: boolean;
  children: ReactNode;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      data-testid={testId}
      className={btnCls(compact)}
      {...rest}
    >
      {children}
    </button>
  );
}

/** Main-axis length of an element (px), kept in state; re-measured on resize. */
function useMainAxis(ref: React.RefObject<HTMLElement | null>, vertical: boolean): number {
  const [len, setLen] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const read = () => {
      const r = el.getBoundingClientRect();
      const v = Math.round(vertical ? r.height : r.width);
      setLen((x) => (x === v ? x : v));
    };
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref, vertical]);
  return len;
}

export function Toolbar({ rect, orientation, seatRotations = [], centerSlot }: Props) {
  const router = useRouter();
  const dispatch = useDispatch();
  const players = useGameValue((g) => g.seats.length) ?? 0;
  const globalsKey = useGameValue((g) =>
    toolbarGlobals(g).map((d) => {
      const idx = globalValue(g, d.id);
      return JSON.stringify([d.id, d.name, enumStateIcon(d, idx), enumLabel(d, idx) ?? "", d.icon]);
    }),
  );
  const trackKey = useGameValue((g) => {
    const defs = trackGlobals(g);
    if (defs.length === 0) return "";
    const owners =
      g.seats.length === 2
        ? g.seats.map((s, i) => ({
            name: s.name,
            color: s.color,
            rotation: (seatRotations[i] ?? (i === 0 ? 180 : 0)) as Rotation,
          }))
        : null;
    return JSON.stringify({ defs, owners });
  });
  const clockKind = useGameValue(clockControlKind) ?? "off";
  const hasMatch = useGameValue((g) => g.timer.match !== undefined) ?? false;
  const settings = useSettingsStore((s) => s.settings);
  // HIST-008: no history entry point when the game keeps no history.
  const showHistory = useGameValue((g) => historyVisible(settings, g)) ?? true;
  const cmdMode = useBoardUi((s) => s.cmdMode);
  const setCmdMode = useBoardUi((s) => s.setCmdMode);
  const autoHide = useSetting("autoHideMenu") && !centerSlot;
  const [playersOpen, setPlayersOpen] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const idle = useRef<ReturnType<typeof setTimeout> | null>(null);
  const vertical = orientation === "vertical";
  const outerRef = useRef<HTMLDivElement>(null);
  const mainAxis = useMainAxis(outerRef, vertical);

  // SET-031: collapse to a slim handle after 5 s without toolbar interaction.
  const poke = () => {
    if (idle.current) clearTimeout(idle.current);
    if (!autoHide) return;
    idle.current = setTimeout(() => setCollapsed(true), AUTO_HIDE_MS);
  };
  useEffect(() => {
    if (!autoHide) return;
    idle.current = setTimeout(() => setCollapsed(true), AUTO_HIDE_MS);
    return () => {
      if (idle.current) clearTimeout(idle.current);
    };
  }, [autoHide]);

  const tools = useHold({
    delay: 500,
    onTap: () => router.push("/tools"),
    onHold: () => setToolsOpen(true),
  });

  const style: CSSProperties = {
    left: `${rect.x * 100}%`,
    top: `${rect.y * 100}%`,
    width: `${rect.w * 100}%`,
    height: `${rect.h * 100}%`,
  };
  const pill = players === 2 && !cmdMode && !centerSlot;
  const track = trackKey
    ? (JSON.parse(trackKey) as {
        defs: CounterDefinition[];
        owners: [TrackOwner, TrackOwner] | null;
      })
    : null;

  let content: ReactNode;
  let dense = false;
  if (centerSlot) {
    content = centerSlot;
  } else if (cmdMode) {
    content = (
      <Button
        variant="primary"
        size="sm"
        data-testid="cmd-mode-exit"
        onClick={() => setCmdMode(false)}
        icon={<X size={20} />}
        className={cn(vertical && "[writing-mode:vertical-rl]")}
      >
        {t("board.cmd.exit")}
      </Button>
    );
  } else if (collapsed && autoHide) {
    content = (
      <button
        type="button"
        data-testid="toolbar-handle"
        aria-label={t("board.toolbar.show")}
        onClick={() => {
          setCollapsed(false);
          poke();
        }}
        className={cn("flex items-center justify-center", vertical ? "h-24 w-12" : "h-12 w-24")}
      >
        <span className={cn("rounded-full bg-fg-subtle", vertical ? "h-16 w-1.5" : "h-1.5 w-16")} />
      </button>
    );
  } else {
    const globals = (globalsKey ?? []).map(
      (k) => JSON.parse(k) as [string, string, string, string, string],
    );
    // A-5 (ENV-003): fit everything into the strip — compact density, then an overflow menu.
    const items: ToolbarItem[] = [
      { key: "reset", size: 48, compactSize: 44, priority: 1 },
      { key: "players", size: 48, compactSize: 44, priority: 4 },
      ...(showHistory ? [{ key: "history", size: 48, compactSize: 44, priority: 6 }] : []),
      {
        key: "clock",
        size: clockKind === "start" ? (vertical ? 112 : 120) : 48,
        compactSize: 44,
        priority: 0,
        pinned: true,
      },
      ...(hasMatch ? [{ key: "match", size: 80, compactSize: 64, priority: 2 }] : []),
      { key: "tools", size: 48, compactSize: 44, priority: 5 },
      { key: "settings", size: 48, compactSize: 44, priority: 3, pinned: true },
      ...globals.map(([id]) => ({ key: `g:${id}`, size: 48, compactSize: 44, priority: 7 })),
    ];
    const avail = mainAxis - 8 - (pill ? 16 : 0);
    const fit = mainAxis > 0 ? fitToolbar(items, avail) : { compact: false, overflow: [] };
    const compact = fit.compact;
    dense = compact;
    const hidden = new Set(fit.overflow);
    const nodes: Record<string, ReactNode> = {
      reset: (
        <ResetButton key="reset" className={btnCls(compact)}>
          <RotateCcw size={24} className="relative" />
        </ResetButton>
      ),
      players: (
        <ToolButton
          key="players"
          compact={compact}
          label={t("board.toolbar.players", { count: players })}
          testId="toolbar-players"
          onClick={() => setPlayersOpen(true)}
        >
          <Users size={22} />
          <span className="absolute bottom-0.5 right-0.5 rounded-full bg-accent px-1 text-[0.65rem] font-bold leading-4 text-accent-fg">
            {players}
          </span>
        </ToolButton>
      ),
      history: (
        <ToolButton
          key="history"
          compact={compact}
          label={t("board.toolbar.history")}
          testId="toolbar-history"
          onClick={() => router.push("/history")}
        >
          <History size={24} />
        </ToolButton>
      ),
      // TIMER-UI: START / Pause / Resume + match clock (T2.5, T2.7)
      clock: <ClockControl key="clock" vertical={vertical} compact={compact} />,
      match: <MatchClock key="match" vertical={vertical} compact={compact} />,
      tools: (
        <button
          key="tools"
          type="button"
          aria-label={t("board.toolbar.tools")}
          title={t("board.toolbar.tools")}
          data-testid="toolbar-tools"
          className={btnCls(compact)}
          {...tools}
          onClick={(e) => {
            if (e.detail === 0) router.push("/tools");
          }}
        >
          <Dices size={24} />
        </button>
      ),
      settings: (
        <ToolButton
          key="settings"
          compact={compact}
          label={t("board.toolbar.settings")}
          testId="toolbar-settings"
          onClick={() => router.push("/settings")}
        >
          <Settings size={24} />
        </ToolButton>
      ),
    };
    for (const [id, name, icon, label, baseIcon] of globals) {
      nodes[`g:${id}`] = (
        <ToolButton
          key={id}
          compact={compact}
          label={t("board.toolbar.global", { name, state: label })}
          testId={baseIcon === "daynight" ? "toolbar-daynight" : `toolbar-global-${id}`}
          data-state={label}
          onClick={() => dispatch({ type: "ENUM_NEXT", counterId: id })}
        >
          <GameIcon id={icon} size={24} />
        </ToolButton>
      );
    }
    const shown = items.filter((i) => !hidden.has(i.key)).map((i) => nodes[i.key]);
    const extra = items.filter((i) => hidden.has(i.key)).map((i) => nodes[i.key]);
    content = (
      <>
        {shown}
        {extra.length > 0 && (
          <div className="relative">
            <ToolButton
              compact
              label={t("board.toolbar.more")}
              testId="toolbar-more"
              aria-expanded={moreOpen}
              onClick={() => setMoreOpen((o) => !o)}
            >
              <Ellipsis size={24} />
            </ToolButton>
            {moreOpen && (
              <div
                data-testid="toolbar-more-menu"
                className={cn(
                  "absolute z-30 flex gap-1 rounded-2xl bg-surface-2 p-1 shadow-xl",
                  vertical
                    ? "left-full top-1/2 ml-1 -translate-y-1/2 flex-col"
                    : "bottom-full right-0 mb-1 flex-row",
                )}
                onClick={() => setMoreOpen(false)}
              >
                {extra}
              </div>
            )}
          </div>
        )}
      </>
    );
  }

  return (
    <div
      ref={outerRef}
      data-testid="toolbar"
      role="toolbar"
      aria-label={t("board.toolbar.label")}
      aria-orientation={orientation}
      className={cn(
        "absolute z-20 flex items-center justify-center gap-1 p-1",
        // A-4: a shared track gets its own row (column) beside the buttons.
        vertical ? "flex-row" : "flex-col",
      )}
      style={style}
      onPointerDown={poke}
    >
      {track && !cmdMode && (
        <div
          className={cn(
            "flex min-h-0 min-w-0 items-center justify-center gap-1",
            vertical ? "h-full w-[3.25rem] shrink-0 flex-row" : "w-full flex-col",
          )}
        >
          {track.defs.map((d) => (
            <TrackGauge key={d.id} def={d} vertical={vertical} owners={track.owners} />
          ))}
        </div>
      )}
      <div
        className={cn(
          "flex items-center justify-evenly",
          dense ? "gap-0" : "gap-0.5",
          vertical ? "h-full max-h-[32rem] flex-col" : "w-full max-w-[32rem] flex-row",
          pill && "rounded-full bg-surface/90 px-2",
        )}
      >
        {content}
      </div>
      {playersOpen && <PlayersSheet open onClose={() => setPlayersOpen(false)} />}
      {toolsOpen && <QuickToolsMenu open onClose={() => setToolsOpen(false)} />}
    </div>
  );
}
