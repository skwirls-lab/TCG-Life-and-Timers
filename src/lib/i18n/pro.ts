/**
 * Route-scoped copy for the Pro entry points (launcher card, Settings card, Account, /pro, the
 * paywall sheet, the game menu's lazy panel). Not merged into the global dictionaries in
 * ./index.ts on purpose: those ship with every route, and /play's first load is at its size cap
 * (PERF-003). Only the modules that import this file carry src/i18n/en/pro.json.
 */
import pro from "@/i18n/en/pro.json";

export type ProMessageKey = keyof typeof pro & string;

const messages: Record<string, string> = pro;

/** Translate a `pro.*` key, replacing {name} placeholders (same rules as `t`). */
export function tPro(key: ProMessageKey, vars?: Record<string, string | number>): string {
  let s = messages[key] ?? key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v));
  return s;
}

/** A date for "Renews on …" in the user's locale, e.g. "Jan 15, 2027". */
export function proDate(ms: number, locale?: string): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(ms));
}
