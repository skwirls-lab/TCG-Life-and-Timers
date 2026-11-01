"use client";
/**
 * Center toolbar (T1.8) — PRD §7.2, LAY-010/011, SET-031, TOK-003, CMD-006 exit.
 * Positioned by the layout engine; icon-only with accessible names (labels via title/aria).
 */
import { Dices, History, RotateCcw, Settings, Users, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";
import { useSnackbar } from "@/components/ui/Snackbar";
import { GameIcon } from "@/components/icons/GameIcon";
import type { Rect, ToolbarOrientation } from "@/engine/layout";
import { enumLabel, globalValue } from "@/engine";
import { requestReset } from "@/features/history-past/whoWon";
import { afterOverlayClose } from "@/features/settings/afterOverlayClose";
import { QuickToolsMenu } from "@/features/tools/QuickToolsMenu";
import { ClockToolbar } from "@/features/timer/ClockToolbar";
import { useHold } from "@/lib/hooks/useHold";
import { t } from "@/lib/i18n";
import { cn } from "@/lib/ui/cn";
import { useDispatch, useGameStore, useGameValue } from "@/state/gameStore";
import { historyVisible } from "@/state/recordKeeper";
import { useSetting, useSettingsStore } from "@/state/settingsStore";
import { enumStateIcon, toolbarGlobals } from "./boardHelpers";
import { useBoardUi } from "./boardStore";
import { PlayersSheet } from "./PlayersSheet";

const AUTO_HIDE_MS = 5000;
const RESET_HOLD_MS = 1000;

interface Props {
  rect: Rect;
  orientation: ToolbarOrientation;
}

const btn =
  "relative inline-flex size-12 shrink-0 select-none items-center justify-center rounded-xl text-fg transition active:scale-95 focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-40";

function ToolButton({
  label,
  testId,
  children,
  ...rest
}: {
  label: string;
  testId: string;
  children: ReactNode;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      data-testid={testId}
      className={btn}
      {...rest}
    >
      {children}
    </button>
  );
}

export function Toolbar({ rect, orientation }: Props) {
  const router = useRouter();
  const dispatch = useDispatch();
  const players = useGameValue((g) => g.seats.length) ?? 0;
  const globalsKey = useGameValue((g) =>
    toolbarGlobals(g).map((d) => {
      const idx = globalValue(g, d.id);
      return JSON.stringify([d.id, d.name, enumStateIcon(d, idx), enumLabel(d, idx) ?? "", d.icon]);
    }),
  );
  const settings = useSettingsStore((s) => s.settings);
  // HIST-008: no history entry point when the game keeps no history.
  const showHistory = useGameValue((g) => historyVisible(settings, g)) ?? true;
  const cmdMode = useBoardUi((s) => s.cmdMode);
  const setCmdMode = useBoardUi((s) => s.setCmdMode);
  const autoHide = useSetting("autoHideMenu");
  const [playersOpen, setPlayersOpen] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const idle = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  const vertical = orientation === "vertical";
  const style: CSSProperties = {
    left: `${rect.x * 100}%`,
    top: `${rect.y * 100}%`,
    width: `${rect.w * 100}%`,
    height: `${rect.h * 100}%`,
  };

  let content: ReactNode;
  if (cmdMode) {
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
    content = (
      <>
        <ResetButton />
        <ToolButton
          label={t("board.toolbar.players", { count: players })}
          testId="toolbar-players"
          onClick={() => setPlayersOpen(true)}
        >
          <Users size={22} />
          <span className="absolute bottom-0.5 right-0.5 rounded-full bg-accent px-1 text-[0.65rem] font-bold leading-4 text-accent-fg">
            {players}
          </span>
        </ToolButton>
        {showHistory && (
          <ToolButton
            label={t("board.toolbar.history")}
            testId="toolbar-history"
            onClick={() => router.push("/history")}
          >
            <History size={24} />
          </ToolButton>
        )}
        {/* TIMER-UI: START / Pause / Resume + match clock (T2.5, T2.7) */}
        <ClockToolbar vertical={vertical} />
        <button
          type="button"
          aria-label={t("board.toolbar.tools")}
          title={t("board.toolbar.tools")}
          data-testid="toolbar-tools"
          className={btn}
          {...tools}
          onClick={(e) => {
            if (e.detail === 0) router.push("/tools");
          }}
        >
          <Dices size={24} />
        </button>
        <ToolButton
          label={t("board.toolbar.settings")}
          testId="toolbar-settings"
          onClick={() => router.push("/settings")}
        >
          <Settings size={24} />
        </ToolButton>
        {globals.map(([id, name, icon, label, baseIcon]) => (
          <ToolButton
            key={id}
            label={t("board.toolbar.global", { name, state: label })}
            testId={baseIcon === "daynight" ? "toolbar-daynight" : `toolbar-global-${id}`}
            data-state={label}
            onClick={() => dispatch({ type: "ENUM_NEXT", counterId: id })}
          >
            <GameIcon id={icon} size={24} />
          </ToolButton>
        ))}
      </>
    );
  }

  return (
    <div
      data-testid="toolbar"
      role="toolbar"
      aria-label={t("board.toolbar.label")}
      aria-orientation={orientation}
      className="absolute z-20 flex items-center justify-center p-1"
      style={style}
      onPointerDown={poke}
    >
      <div
        className={cn(
          "flex items-center justify-evenly gap-0.5",
          vertical ? "h-full max-h-[32rem] flex-col" : "w-full max-w-[32rem] flex-row",
          players === 2 && !cmdMode && "rounded-full bg-surface/90 px-2",
        )}
      >
        {content}
      </div>
      <PlayersSheet open={playersOpen} onClose={() => setPlayersOpen(false)} />
      <QuickToolsMenu open={toolsOpen} onClose={() => setToolsOpen(false)} />
    </div>
  );
}

/** GAME-010 / LAY-011: hold-to-confirm (default) or a confirm dialog, then RESET_GAME. */
function ResetButton() {
  const style = useSetting("confirmStyle");
  const dispatch = useDispatch();
  const show = useSnackbar((s) => s.show);
  const [dialog, setDialog] = useState(false);
  const [holding, setHolding] = useState(false);

  const doReset = () => {
    const game = useGameStore.getState().session?.game;
    if (!game) return;
    // HIST-031: the Who-won flow saves the game first (or the prompt is closed: no reset).
    // The "Game reset · Undo" snackbar is shown by GameFlowOverlays for every reset (D-039).
    void requestReset({ game, proceed: () => dispatch({ type: "RESET_GAME" }) });
  };

  const hold = useHold({
    delay: RESET_HOLD_MS,
    onTap: () => {
      setHolding(false);
      show({ message: t("board.reset.holdHint"), durationMs: 2000 });
    },
    onHold: () => {
      setHolding(false);
      doReset();
    },
  });

  const label = t("board.toolbar.reset");
  const holdMode = style === "hold";
  return (
    <>
      <button
        type="button"
        aria-label={holdMode ? t("board.toolbar.resetHold") : label}
        title={holdMode ? t("board.toolbar.resetHold") : label}
        data-testid="toolbar-reset"
        className={cn(btn, "overflow-hidden")}
        {...(holdMode
          ? {
              ...hold,
              onPointerDown: (e: React.PointerEvent) => {
                setHolding(true);
                hold.onPointerDown(e);
              },
              onPointerUp: (e: React.PointerEvent) => {
                setHolding(false);
                hold.onPointerUp(e);
              },
              onPointerCancel: (e: React.PointerEvent) => {
                setHolding(false);
                hold.onPointerCancel(e);
              },
              onPointerLeave: (e: React.PointerEvent) => {
                setHolding(false);
                hold.onPointerLeave(e);
              },
              onClick: (e: React.MouseEvent) => {
                if (e.detail === 0) setDialog(true); // keyboard: confirm via dialog
              },
            }
          : { onClick: () => setDialog(true) })}
      >
        <span
          aria-hidden
          className="absolute inset-y-0 left-0 bg-danger/40"
          style={{
            width: holding ? "100%" : "0%",
            transition: holding ? `width ${RESET_HOLD_MS}ms linear` : "none",
          }}
        />
        <RotateCcw size={24} className="relative" />
      </button>
      <Sheet
        open={dialog}
        onClose={() => setDialog(false)}
        title={t("board.reset.title")}
        testId="reset-dialog"
      >
        <p className="mb-4 text-fg-muted">{t("board.reset.body")}</p>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setDialog(false)}>
            {t("common.cancel")}
          </Button>
          <Button
            variant="danger"
            data-testid="reset-confirm"
            onClick={() => {
              setDialog(false);
              // The Who-won prompt may open next: wait until this sheet has left history.
              afterOverlayClose(doReset);
            }}
          >
            {t("common.reset")}
          </Button>
        </div>
      </Sheet>
    </>
  );
}
