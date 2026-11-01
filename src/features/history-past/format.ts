/** Display helpers for Past Games (labels come from i18n). */
import type { CauseKind, GameRecord } from "@/lib/records";
import { t } from "@/lib/i18n";

/** "1 h 05 min" / "45 min" / "30 s" (HIST-030: never "171 hr"). */
export function durationText(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || !Number.isFinite(ms)) return "—";
  const totalSec = Math.max(0, Math.round(ms / 1000));
  if (totalSec < 60) return t("historyPast.duration.s", { s: totalSec });
  const totalMin = Math.round(totalSec / 60);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return t("historyPast.duration.m", { m });
  return t("historyPast.duration.hm", { h, m: String(m).padStart(2, "0") });
}

export function pctText(p: number | null | undefined): string {
  if (p === null || p === undefined) return t("historyPast.players.noPct");
  return t("historyPast.players.pct", { pct: Math.round(p * 100) });
}

export function dateText(at: number, locale = "en-US"): string {
  return new Date(at).toLocaleString(locale, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** yyyy-mm-dd (local) for <input type="date">. */
export function dateInputValue(at: number | undefined): string {
  if (at === undefined) return "";
  const d = new Date(at);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Local midnight of a yyyy-mm-dd value (undefined when empty / invalid). */
export function parseDateInput(v: string, endOfDay = false): number | undefined {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (!m) return undefined;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + (endOfDay ? 1 : 0));
  return d.getTime();
}

const CAUSE_KEYS = {
  life: "historyPast.cause.life",
  poison: "historyPast.cause.poison",
  commander: "historyPast.cause.commander",
  counter: "historyPast.cause.counter",
  time: "historyPast.cause.time",
  concede: "historyPast.cause.concede",
  manual: "historyPast.cause.manual",
} as const satisfies Record<CauseKind, string>;

export function causeText(kind: CauseKind): string {
  return t(CAUSE_KEYS[kind]);
}

/** Game numbers in chronological order across all records (#1 = oldest). */
export function gameNumbers(records: readonly GameRecord[]): Map<string, number> {
  const sorted = [...records].sort((a, b) => a.endedAt - b.endedAt || a.id.localeCompare(b.id));
  return new Map(sorted.map((r, i) => [r.id, i + 1]));
}

export function winnerPlayers(r: GameRecord) {
  return r.players.filter((p) => p.winner);
}

export function outcomeText(r: GameRecord): string {
  const w = winnerPlayers(r);
  if (w.length) return t("historyPast.game.winner", { name: w.map((p) => p.name).join(" & ") });
  return t(r.outcome === "draw" ? "historyPast.game.draw" : "historyPast.game.noWinner");
}
