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
 */
import { useEffect } from "react";
import { Button, useSnackbar } from "@/components/ui";
import { t } from "@/lib/i18n";
import { useGameStore } from "@/state/gameStore";
import { ChooseFirstPlayer, PromptDialog } from "./Dialogs";
import { FirstPlayerOverlay } from "./FirstPlayerOverlay";
import { FirstTurnHint } from "./FirstTurnHint";
import { GameOverOverlay } from "./GameOverOverlay";
import { detectUndoable, seatName } from "./flow";

export const UNDO_SNACK_MS = 5000;

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
      const id = useSnackbar.getState().show({
        message,
        actionLabel: t("common.undo"),
        durationMs: UNDO_SNACK_MS,
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

export function GameFlowOverlays() {
  useUndoSnackbar();
  const game = useGameStore((s) => s.session?.game);
  return (
    <>
      {game && (
        <>
          <ChooseFirstPlayer game={game} />
          <FirstPlayerOverlay game={game} />
          <FirstTurnHint game={game} />
          <PromptDialog game={game} />
          <GameOverOverlay game={game} />
        </>
      )}
      <CorruptNotice />
    </>
  );
}
