/** Launcher summaries (GAME-016 resume card, GAME-001 quick start). Pure helpers. */
import { activeDuration, type Game, type NewGameConfig } from "@/engine";
import { t } from "@/lib/i18n";

/** "<1 min", "34 min", "1 h 05 min". */
export function formatElapsed(ms: number): string {
  const min = Math.floor(Math.max(0, ms) / 60_000);
  if (min < 1) return t("shell.time.underMinute");
  if (min < 60) return t("shell.time.minutes", { m: min });
  const h = Math.floor(min / 60);
  return t("shell.time.hoursMinutes", { h, m: String(min % 60).padStart(2, "0") });
}

/** Duration as m:ss or h:mm:ss (game-over overlay). */
export function formatClock(ms: number): string {
  const total = Math.floor(Math.max(0, ms) / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

export interface ResumeSummary {
  presetName: string;
  players: number;
  elapsed: string;
}

/** An unfinished game can be resumed (anything not ended). */
export function canResume(game: Game | undefined | null): game is Game {
  return !!game && game.status !== "ended";
}

export function resumeSummary(game: Game, now: number): ResumeSummary {
  return {
    presetName: game.preset.name,
    players: game.seats.length,
    elapsed: formatElapsed(activeDuration(game, now)),
  };
}

export interface QuickStartSummary {
  presetName: string;
  players: number;
  names: string[];
}

export function quickStartSummary(config: NewGameConfig): QuickStartSummary {
  const players = config.players ?? config.seats?.length ?? config.preset.defaultPlayers;
  const names = (config.seats ?? [])
    .slice(0, players)
    .map((s) => s.name?.trim() ?? "")
    .filter(Boolean);
  return { presetName: config.preset.name, players, names };
}
