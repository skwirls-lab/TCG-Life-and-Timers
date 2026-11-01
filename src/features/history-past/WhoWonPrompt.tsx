"use client";
/** HIST-031 "Who won?" prompt: seat buttons, Draw, No winner, Don't save this game. */
import { Trophy } from "lucide-react";
import { Button, Sheet } from "@/components/ui";
import type { Game } from "@/engine";
import type { WinnerDecision } from "@/lib/records";
import { t } from "@/lib/i18n";
import { useWhoWon } from "./whoWon";

interface Props {
  game: Game;
  onAnswer: (decision: WinnerDecision) => void;
  onClose: () => void;
}

export function WhoWonPrompt({ game, onAnswer, onClose }: Props) {
  const alive = game.seats.filter((s) => !s.eliminated);
  const seats = [...alive, ...game.seats.filter((s) => s.eliminated)];
  return (
    <Sheet open onClose={onClose} title={t("historyPast.who.title")} testId="who-won">
      <p className="mb-3 text-fg-muted">{t("historyPast.who.body")}</p>
      <ul className="flex flex-col gap-2">
        {seats.map((s) => (
          <li key={s.id}>
            <button
              type="button"
              data-testid={`who-won-seat-${s.id}`}
              onClick={() => onAnswer({ kind: "winners", seatIds: [s.id] })}
              className="flex min-h-14 w-full items-center gap-3 overflow-hidden rounded-2xl bg-surface-2 pr-4 text-left text-lg hover:bg-surface-3"
            >
              <span aria-hidden className="h-14 w-2 shrink-0" style={{ background: s.color }} />
              <Trophy size={20} aria-hidden className="text-warning" />
              <span className="min-w-0 flex-1 truncate">
                {t("historyPast.who.seat", { name: s.name })}
              </span>
            </button>
          </li>
        ))}
      </ul>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Button data-testid="who-won-draw" onClick={() => onAnswer({ kind: "draw" })}>
          {t("historyPast.who.draw")}
        </Button>
        <Button data-testid="who-won-none" onClick={() => onAnswer({ kind: "none" })}>
          {t("historyPast.who.none")}
        </Button>
      </div>
      <Button
        block
        variant="outline"
        className="mt-2 text-danger"
        data-testid="who-won-discard"
        onClick={() => onAnswer({ kind: "discard" })}
      >
        {t("historyPast.who.discard")}
      </Button>
    </Sheet>
  );
}

/** Mount once (app level). Shows the prompt for `requestReset` calls that need an answer. */
export function WhoWonHost() {
  const pending = useWhoWon((s) => s.pending);
  const answer = useWhoWon((s) => s.answer);
  const cancel = useWhoWon((s) => s.cancel);
  if (!pending) return null;
  return <WhoWonPrompt game={pending.game} onAnswer={(d) => void answer(d)} onClose={cancel} />;
}
