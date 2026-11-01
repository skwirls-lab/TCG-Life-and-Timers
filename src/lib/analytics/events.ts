/** PRD §19.5 analytics events and their (PII-free) parameters. */
export interface AnalyticsEvents {
  game_start: { preset: string; players: number; timers: boolean; mode: string };
  game_end: { duration_s: number; turns: number };
  timer_respond: Record<string, never>;
  timer_timeout: Record<string, never>;
  preset_custom_created: Record<string, never>;
  art_scryfall_selected: Record<string, never>;
  art_uploaded: Record<string, never>;
  sign_in: { method: string };
  paywall_view: { feature: string };
  purchase: { plan: string };
}

export type AnalyticsEventName = keyof AnalyticsEvents;

export const ANALYTICS_EVENTS = [
  "game_start",
  "game_end",
  "timer_respond",
  "timer_timeout",
  "preset_custom_created",
  "art_scryfall_selected",
  "art_uploaded",
  "sign_in",
  "paywall_view",
  "purchase",
] as const satisfies readonly AnalyticsEventName[];

export type EventParams = Record<string, string | number | boolean>;

const MAX_STRING = 100; // GA4 parameter value limit

/** Keeps only primitive values, truncates strings, drops non-finite numbers. */
export function sanitizeParams(params: Record<string, unknown> | undefined): EventParams {
  const out: EventParams = {};
  if (!params) return out;
  for (const [k, v] of Object.entries(params)) {
    if (typeof v === "string") out[k] = v.slice(0, MAX_STRING);
    else if (typeof v === "number" && Number.isFinite(v)) out[k] = v;
    else if (typeof v === "boolean") out[k] = v;
  }
  return out;
}

export function isAnalyticsEvent(name: string): name is AnalyticsEventName {
  return (ANALYTICS_EVENTS as readonly string[]).includes(name);
}
