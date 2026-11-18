"use client";
/**
 * GAME-010 / LAY-011: hold-to-confirm (default) or a confirm dialog, then RESET_GAME. Shared by the
 * toolbar strip and the center menu (MENU), which keep the same test ids and behaviour.
 */
import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";
import { useSnackbar } from "@/components/ui/Snackbar";
import { requestReset } from "@/features/history-past/whoWon";
import { afterOverlayClose } from "@/features/settings/afterOverlayClose";
import { useHold } from "@/lib/hooks/useHold";
import { t } from "@/lib/i18n";
import { cn } from "@/lib/ui/cn";
import { useDispatch, useGameStore } from "@/state/gameStore";
import { useSetting } from "@/state/settingsStore";

export const RESET_HOLD_MS = 1000;

interface Props {
  className: string;
  children: ReactNode;
  /** Called once the reset is confirmed (before the Who-won flow), e.g. to close the menu. */
  onDone?: () => void;
}

export function ResetButton({ className, children, onDone }: Props) {
  const style = useSetting("confirmStyle");
  const dispatch = useDispatch();
  const show = useSnackbar((s) => s.show);
  const [dialog, setDialog] = useState(false);
  const [holding, setHolding] = useState(false);

  const doReset = () => {
    const game = useGameStore.getState().session?.game;
    if (!game) return;
    onDone?.();
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
        className={cn(className, "overflow-hidden")}
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
        {children}
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
