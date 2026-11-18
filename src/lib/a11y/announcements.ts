/**
 * A11Y-001: what the board's live region says after a state change. Compares two consecutive game
 * states and returns batched per-seat counter messages ("Conner Life 21") plus immediate messages
 * (turn passes, timeouts, eliminations). A different game id (new game, reset) is a new baseline.
 */
import { counterValue, primaryCounter, type Game } from "@/engine";
import { t } from "@/lib/i18n";

export interface Announcements {
  counters: { key: string; text: string }[];
  immediate: string[];
}

const NONE: Announcements = { counters: [], immediate: [] };

export function diffAnnouncements(prev: Game | null | undefined, next: Game): Announcements {
  if (!prev || prev === next || prev.id !== next.id) return NONE;
  const primary = primaryCounter(next.preset);
  const counters: Announcements["counters"] = [];
  const immediate: string[] = [];
  for (const seat of next.seats) {
    const before = prev.seats.find((s) => s.id === seat.id);
    if (!before) continue;
    const value = counterValue(next, primary.id, seat.id);
    if (value !== counterValue(prev, primary.id, seat.id)) {
      counters.push({
        key: seat.id,
        text: t("board.announce.counter", { name: seat.name, counter: primary.name, value }),
      });
    }
    if (seat.eliminated && !before.eliminated) {
      immediate.push(t("board.announce.eliminated", { name: seat.name }));
    }
    const was = prev.timer.clocks[seat.id]?.state ?? "normal";
    const is = next.timer.clocks[seat.id]?.state ?? "normal";
    if (is !== was && is !== "normal") {
      immediate.push(t(`board.announce.clock.${is}`, { name: seat.name }));
    }
  }
  // MENU: pausing / resuming the clocks (center menu, PAUSED overlay, toolbar) is spoken too.
  if (next.status !== "ended") {
    const was = prev.timer.status;
    const is = next.timer.status;
    if (was === "running" && is === "paused") immediate.push(t("board.announce.paused"));
    else if (was === "paused" && is === "running") immediate.push(t("board.announce.resumed"));
  }
  const active = next.turn.activeSeat;
  const tracking = next.options.turnTracking || next.timer.mode !== "off";
  if (tracking && active && active !== prev.turn.activeSeat && next.status !== "ended") {
    const name = next.seats.find((s) => s.id === active)?.name ?? "";
    immediate.push(t("board.announce.turn", { name, n: next.turn.turnNumber }));
  }
  return { counters, immediate };
}
