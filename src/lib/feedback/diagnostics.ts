/**
 * Diagnostics bundle (SET-042): app version, browser/OS, settings, active preset and the last
 * 200 events of the current game. The user previews the exact JSON before sending. No images,
 * emails or names unless the user ticks "include player names".
 */
import type { Game, GameEvent } from "@/engine";
import { LIMITS } from "@/lib/firebase/docs";
import { appVersion } from "./version";

export const DIAGNOSTICS_EVENTS = 200;
export const REDACTED = "[redacted]";

export interface DiagnosticsOptions {
  includeNames: boolean;
}

export interface DiagnosticsSources {
  appVersion: string;
  userAgent: string;
  settings: unknown;
  game: Game | null;
  now: number;
}

export interface Diagnostics {
  kind: "tcg-life-diagnostics";
  appVersion: string;
  createdAt: string;
  userAgent: string;
  includesNames: boolean;
  settings: unknown;
  activePresetId: string | null;
  game: {
    id: string;
    presetId: string;
    presetVersion: number;
    status: string;
    layoutId: string;
    seats: { id: string; name: string; color: string; eliminated: boolean }[];
    eventCount: number;
    events: GameEvent[];
  } | null;
}

/** Any image-ish string (data URLs, blob URLs) is dropped from the bundle. */
const IMAGE_RE = /^(data:image\/|blob:)/;

function scrub(
  value: unknown,
  isName: (s: string) => boolean,
  redactNames: boolean,
  key = "",
): unknown {
  if (typeof value === "string") {
    if (IMAGE_RE.test(value)) return REDACTED;
    if (redactNames && (/name/i.test(key) || isName(value))) return REDACTED;
    return value;
  }
  if (Array.isArray(value)) return value.map((v) => scrub(v, isName, redactNames, key));
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, scrub(v, isName, redactNames, k)]),
    );
  return value;
}

export function assembleDiagnostics(
  opts: DiagnosticsOptions,
  src: DiagnosticsSources,
): Diagnostics {
  const game = src.game;
  const names = new Set(
    (game?.seats ?? []).map((s) => s.name.trim().toLocaleLowerCase()).filter((n) => n.length > 0),
  );
  const isName = (s: string) => names.has(s.trim().toLocaleLowerCase());
  const redact = !opts.includeNames;
  return {
    kind: "tcg-life-diagnostics",
    appVersion: src.appVersion,
    createdAt: new Date(src.now).toISOString(),
    userAgent: src.userAgent,
    includesNames: opts.includeNames,
    settings: scrub(src.settings, () => false, false),
    activePresetId: game?.preset.id ?? null,
    game: game
      ? {
          id: game.id,
          presetId: game.preset.id,
          presetVersion: game.preset.version,
          status: game.status,
          layoutId: game.layoutId,
          seats: game.seats.map((s, i) => ({
            id: s.id,
            name: redact ? `Player ${i + 1}` : s.name,
            color: s.color,
            eliminated: s.eliminated,
          })),
          eventCount: game.log.length,
          events: game.log
            .slice(-DIAGNOSTICS_EVENTS)
            .map((e) => scrub(e, isName, redact) as GameEvent),
        }
      : null,
  };
}

/** Pretty JSON exactly as it will be sent; trims old events if over the size cap. */
export function diagnosticsJson(d: Diagnostics): string {
  let cur = d;
  let json = JSON.stringify(cur, null, 2);
  while (json.length > LIMITS.diagnosticsMax && cur.game && cur.game.events.length > 0) {
    cur = {
      ...cur,
      game: { ...cur.game, events: cur.game.events.slice(Math.ceil(cur.game.events.length / 4)) },
    };
    json = JSON.stringify(cur, null, 2);
  }
  return json;
}

/** Collect diagnostics from the running app (settings store + current game). */
export async function buildDiagnostics(
  opts: DiagnosticsOptions,
  overrides: Partial<DiagnosticsSources> = {},
): Promise<Diagnostics> {
  const [{ useSettingsStore }, { useGameStore }] = await Promise.all([
    import("@/state/settingsStore"),
    import("@/state/gameStore"),
  ]);
  let game = useGameStore.getState().session?.game ?? null;
  if (!game && overrides.game === undefined) {
    const { loadActive } = await import("@/lib/db");
    game = (await loadActive()).session?.game ?? null;
  }
  const settingsState = useSettingsStore.getState();
  const settings = settingsState.hydrated ? settingsState.settings : await settingsState.load();
  return assembleDiagnostics(opts, {
    appVersion: appVersion(),
    userAgent: typeof navigator === "undefined" ? "" : navigator.userAgent,
    settings,
    game,
    now: Date.now(),
    ...overrides,
  });
}
