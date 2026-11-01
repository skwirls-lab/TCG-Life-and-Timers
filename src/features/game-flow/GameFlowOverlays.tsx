"use client";
/**
 * Game-flow overlays (T1.13), mounted once by the /play board:
 * - first-player announcement (GAME-011; roll-off and opening coin flip, T3.7 / PRD §10.3) and
 *   the "Choose manually" picker (GAME-012)
 * - the first-turn reminder (PRD §10.3)
 * - threshold prompts for autoKO 'prompt' (CTR-003)
 * - game-over overlay with Rematch / New setup / Close (GAME-014)
 * - 5 s "Undo" snackbar after a reset or an elimination (GAME-015)
 * - the corrupt-save notice (REL-004)
 * - the "open in another tab" notice with "Use here" (B-2; see src/lib/db/tabGuard.ts)
 */
import { useEffect } from "react";
import { Button, useSnackbar } from "@/components/ui";
import type { SnackAnchor } from "@/components/ui/Snackbar";
import type { Rotation } from "@/lib/ui/rotation";
import { t } from "@/lib/i18n";
import { useGameStore } from "@/state/gameStore";
import {
  detectUndoable,
  firstTurnReminderDue,
  latestFirstPlayerEvent,
  seatName,
  shouldAnnounce,
} from "./flow";
import { lazyComponent } from "@/lib/hooks/lazyComponent";

// PERF-003: each overlay's code loads only when its trigger condition holds.
const ChooseFirstPlayer = lazyComponent(() => import("./Dialogs").then((m) => m.ChooseFirstPlayer));
const PromptDialog = lazyComponent(() => import("./Dialogs").then((m) => m.PromptDialog));
const FirstPlayerOverlay = lazyComponent(() =>
  import("./FirstPlayerOverlay").then((m) => m.FirstPlayerOverlay),
);
const FirstTurnHint = lazyComponent(() => import("./FirstTurnHint").then((m) => m.FirstTurnHint));
const GameOverOverlay = lazyComponent(() =>
  import("./GameOverOverlay").then((m) => m.GameOverOverlay),
);

export const UNDO_SNACK_MS = 5000;

const rectOf = (el: Element) => {
  const r = el.getBoundingClientRect();
  return { left: r.left, top: r.top, width: r.width, height: r.height };
};

/**
 * A-8: the elimination Undo sits on the eliminated seat's tile, facing that player, instead of
 * over the toolbar (null without a board: the centred stack).
 */
function seatTileAnchor(index: number): SnackAnchor | null {
  if (index < 0 || typeof document === "undefined") return null;
  const el = document.querySelector<HTMLElement>(
    `[data-testid="board"] [data-testid="seat-${index}"][data-rotation]`,
  );
  if (!el) return null;
  return { rect: rectOf(el), rotation: Number(el.dataset.rotation) as Rotation, region: "seat" };
}

/**
 * A-1 / A-8: the reset Undo sits just beside the toolbar strip (above a horizontal strip, to the
 * side of a vertical one) — not over the toolbar nor over the first-player announcement, which
 * is centred in each tile.
 */
function toolbarAnchor(): SnackAnchor | null {
  if (typeof document === "undefined") return null;
  const el = document.querySelector('[data-testid="board"] [data-testid="toolbar"]');
  if (!el || el.getBoundingClientRect().width === 0) return null;
  const vertical = el.getAttribute("aria-orientation") === "vertical";
  return { rect: rectOf(el), rotation: vertical ? 90 : 0, region: "above" };
}

/** Show an Undo snackbar after destructive changes (GAME-015). */
function useUndoSnackbar() {
  useEffect(() => {
    const shown: number[] = [];
    return useGameStore.subscribe((state, prev) => {
      const next = state.session;
      const before = prev.session;
      if (!next || !before) return;
      if (next.game.status === "ended" && before.game.status !== "ended") {
        // The game-over overlay takes over; drop pending undo snackbars so they don't cover it.
        for (const id of shown.splice(0)) useSnackbar.getState().dismiss(id);
        return;
      }
      const isUndo = next.future.length > before.future.length;
      const change = detectUndoable(before.game, next.game, isUndo);
      if (!change) return;
      const message =
        change.kind === "reset"
          ? t("shell.undo.reset")
          : t("shell.undo.eliminated", {
              names: change.seatIds.map((id) => seatName(next.game, id)).join(", "),
            });
      const anchor =
        change.kind === "reset"
          ? toolbarAnchor()
          : seatTileAnchor(next.game.seats.findIndex((s) => s.id === change.seatIds[0]));
      const id = useSnackbar.getState().show({
        message,
        actionLabel: t("common.undo"),
        durationMs: UNDO_SNACK_MS,
        ...(anchor ? { anchor } : {}),
        onAction: () => useGameStore.getState().dispatch({ type: "UNDO" }),
      });
      shown.push(id);
      if (shown.length > 5) shown.shift();
    });
  }, []);
}

function CorruptNotice() {
  const notice = useGameStore((s) => s.notice);
  const dismiss = useGameStore((s) => s.dismissNotice);
  if (notice !== "corrupt") return null;
  return (
    <div
      role="alert"
      data-testid="corrupt-notice"
      className="fixed inset-x-0 top-0 z-[57] m-3 flex items-center gap-3 rounded-2xl border border-warning/50 bg-surface p-3 shadow-xl"
    >
      <p className="flex-1 text-sm">{t("engine.corruptNotice")}</p>
      <Button size="sm" onClick={dismiss} data-testid="corrupt-notice-dismiss">
        {t("common.close")}
      </Button>
    </div>
  );
}

/** B-2: another tab took over the game; this tab stopped saving. Non-destructive. */
function StaleTabNotice() {
  const stale = useGameStore((s) => s.staleTab);
  const takeOverHere = useGameStore((s) => s.takeOverHere);
  if (!stale) return null;
  return (
    <div
      role="alert"
      data-testid="stale-tab-notice"
      className="fixed inset-x-0 top-0 z-[58] m-3 flex items-center gap-3 rounded-2xl border border-warning/50 bg-surface p-3 shadow-xl"
    >
      <p className="flex-1 text-sm">{t("engine.staleTab.body")}</p>
      <Button size="sm" onClick={() => void takeOverHere()} data-testid="stale-tab-use-here">
        {t("engine.staleTab.useHere")}
      </Button>
    </div>
  );
}

export function GameFlowOverlays() {
  useUndoSnackbar();
  const game = useGameStore((s) => s.session?.game);
  return (
    <>
      {game && (
        <>
          {game.turn.awaitingFirstPlayer && <ChooseFirstPlayer game={game} />}
          {latestFirstPlayerEvent(game) && shouldAnnounce(game) && (
            <FirstPlayerOverlay game={game} />
          )}
          {firstTurnReminderDue(game) && <FirstTurnHint game={game} />}
          {game.pendingPrompts.length > 0 && <PromptDialog game={game} />}
          {game.status === "ended" && <GameOverOverlay game={game} />}
        </>
      )}
      <CorruptNotice />
      <StaleTabNotice />
    </>
  );
}
