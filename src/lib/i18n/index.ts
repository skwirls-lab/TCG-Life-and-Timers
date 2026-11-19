/**
 * Minimal typed i18n (SET-034). Each feature lane owns one JSON file in src/i18n/en/
 * with keys prefixed by its namespace (e.g. "board.*"). Register new files below.
 */
import common from "@/i18n/en/common.json";
import engine from "@/i18n/en/engine.json";
import account from "@/i18n/en/account.json";
import art from "@/i18n/en/art.json";
import board from "@/i18n/en/board.json";
import brand from "@/i18n/en/brand.json";
import builder from "@/i18n/en/builder.json";
import history from "@/i18n/en/history.json";
import historyPast from "@/i18n/en/historyPast.json";
import install from "@/i18n/en/install.json";
import legal from "@/i18n/en/legal.json";
import pay from "@/i18n/en/pay.json";
import presets from "@/i18n/en/presets.json";
import profiles from "@/i18n/en/profiles.json";
import seat from "@/i18n/en/seat.json";
import setups from "@/i18n/en/setups.json";
import shell from "@/i18n/en/shell.json";
import timer from "@/i18n/en/timer.json";
import tools from "@/i18n/en/tools.json";

const dictionaries = [
  common,
  engine,
  account,
  art,
  board,
  brand,
  builder,
  history,
  historyPast,
  install,
  legal,
  pay,
  presets,
  profiles,
  seat,
  setups,
  shell,
  timer,
  tools,
] as const;

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
