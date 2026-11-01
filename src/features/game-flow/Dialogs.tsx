"use client";
/**
 * Threshold prompts (autoKO 'prompt', CTR-003) and the "Choose manually" first-player picker
 * (GAME-012). Both are centered, upright dialogs over the board.
 */
import type { ReactNode } from "react";
import { Button } from "@/components/ui";
import type { Game } from "@/engine";
import { t } from "@/lib/i18n";
import { useDispatch } from "@/state/gameStore";
import { formatCause, seatName } from "./flow";

function Modal({
  testId,
  title,
  children,
}: {
  testId: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-[56] flex items-center justify-center bg-black/70 p-4"
      data-testid={testId}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
        className="flex w-full max-w-sm flex-col gap-4 rounded-[2rem] bg-surface p-5 text-fg shadow-2xl"
      >
        <h2 className="text-xl font-semibold">{title}</h2>
        {children}
      </div>
    </div>
  );
}

export function PromptDialog({ game }: { game: Game }) {
  const dispatch = useDispatch();
  const prompt = game.pendingPrompts[0];
  if (!prompt || game.status === "ended") return null;
  const name = seatName(game, prompt.seatId);
  const cause = formatCause(game, prompt.seatId, prompt.cause);
  const title =
    prompt.kind === "win"
      ? t("shell.prompt.win", { name, cause })
      : t("shell.prompt.eliminate", { name, cause });
  const resolve = (accept: boolean) =>
    dispatch({ type: "RESOLVE_PROMPT", promptId: prompt.id, accept });
  return (
    <Modal testId="prompt-dialog" title={title}>
      <p className="text-sm text-fg-muted">{t("shell.prompt.hint")}</p>
      <div className="flex gap-3">
        <Button className="flex-1" onClick={() => resolve(false)} data-testid="prompt-no">
          {t("shell.prompt.no")}
        </Button>
        <Button
          className="flex-1"
          variant="danger"
          onClick={() => resolve(true)}
          data-testid="prompt-yes"
        >
          {t("shell.prompt.yes")}
        </Button>
      </div>
    </Modal>
  );
}

export function ChooseFirstPlayer({ game }: { game: Game }) {
  const dispatch = useDispatch();
  if (!game.turn.awaitingFirstPlayer || game.status === "ended") return null;
  return (
    <Modal testId="first-player-picker" title={t("shell.firstPlayer.chooseTitle")}>
      <div className="grid grid-cols-2 gap-2">
        {game.seats.map((s, i) => (
          <Button
            key={s.id}
            data-testid={`first-player-pick-${i}`}
            onClick={() => dispatch({ type: "SET_FIRST_PLAYER", seatId: s.id })}
            className="justify-start"
            icon={
              <span aria-hidden className="size-4 rounded-full" style={{ background: s.color }} />
            }
          >
            <span className="truncate">{s.name}</span>
          </Button>
        ))}
      </div>
    </Modal>
  );
}
