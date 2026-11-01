/**
 * Minimal typed i18n (SET-034). Each feature lane owns one JSON file in src/i18n/en/
 * with keys prefixed by its namespace (e.g. "board.*"). Register new files below.
 */
import common from "@/i18n/en/common.json";
import engine from "@/i18n/en/engine.json";
import seat from "@/i18n/en/seat.json";

const dictionaries = [common, engine, seat] as const;

type Merge<T extends readonly object[]> = T extends readonly [infer H, ...infer R extends object[]]
  ? H & Merge<R>
  : unknown;

export type Messages = Merge<typeof dictionaries>;
export type MessageKey = keyof Messages & string;

const messages: Record<string, string> = Object.assign({}, ...dictionaries);

/** Translate a key, replacing {name} placeholders. Unknown keys return the key (and warn in dev). */
export function t(key: MessageKey, vars?: Record<string, string | number>): string {
  let s = messages[key];
  if (s === undefined) {
    if (process.env.NODE_ENV !== "production") console.warn(`[i18n] missing key ${key}`);
    return key;
  }
  if (vars) {
    for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v));
  }
  return s;
}

/** Pluralization helper: picks `${key}.one` or `${key}.other`. */
export function tp(base: string, count: number, vars?: Record<string, string | number>): string {
  const key = (count === 1 ? `${base}.one` : `${base}.other`) as MessageKey;
  return t(key, { count, ...vars });
}

export function hasKey(key: string): key is MessageKey {
  return key in messages;
}
