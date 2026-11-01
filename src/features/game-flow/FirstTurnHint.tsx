"use client";
/**
 * PRD §10.3 first-turn reminder: on turn 1 of a game whose preset has the `firstTurnReminder`
 * capability (and the game option is on), a dismissible hint reminds the table of the first
 * player's restrictions. Shown once per game, after the first-player announcement; it disappears
 * when the turn passes. Board quick-starts in e2e that skip the announcement skip it too.
 */
import { Info } from "lucide-react";
import type { Game } from "@/engine";
import { Button } from "@/components/ui";
import { t } from "@/lib/i18n";
import { TEST_HOOKS_ENABLED } from "@/state/testHooks";
import { firstTurnReminderDue, latestFirstPlayerEvent, seatName, shouldAnnounce } from "./flow";
import { useFlowUi } from "./flowUi";

export function FirstTurnHint({ game }: { game: Game }) {
  const ev = latestFirstPlayerEvent(game);
  const key = ev ? `${game.id}:${ev.id}` : null;
  const announcing = useFlowUi((s) => !!key && !s.announced.includes(key)) && shouldAnnounce(game);
  const dismissed = useFlowUi((s) => s.hintsDismissed.includes(game.id));
  const dismiss = useFlowUi((s) => s.dismissHint);
  const testSkip =
    TEST_HOOKS_ENABLED && typeof window !== "undefined" && window.__tcgSkipAnnounceGame === game.id;
  if (testSkip || dismissed || announcing || !firstTurnReminderDue(game)) return null;
  return (
    <div
      role="status"
      data-testid="first-turn-hint"
      className="fixed inset-x-3 bottom-3 z-[54] mx-auto flex max-w-md items-start gap-3 rounded-2xl border border-accent/50 bg-surface p-3 text-fg shadow-2xl"
    >
      <Info aria-hidden size={22} className="mt-0.5 shrink-0 text-accent" />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-sm font-semibold">
          {t("shell.firstTurn.title")} ·{" "}
          {t("shell.firstTurn.starter", { name: seatName(game, game.turn.firstSeat) })}
        </span>
        <span className="text-sm">{t("shell.firstTurn.hint")}</span>
      </div>
      <Button size="sm" onClick={() => dismiss(game.id)} data-testid="first-turn-hint-dismiss">
        {t("shell.firstTurn.dismiss")}
      </Button>
    </div>
  );
}
