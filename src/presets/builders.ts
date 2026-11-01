/**
 * Small counter-definition builders shared by the non-MTG presets (PRD §10.3–10.6). Presets stay
 * plain data (ARCH-003): these only fill in the boilerplate fields.
 */
import { defaultTimerConfig, type CounterDefinition, type TimerConfig } from "../engine";

type Overrides = Partial<CounterDefinition>;
type Base = Pick<CounterDefinition, "id" | "name" | "icon" | "category">;

export const MIN = 60_000;

/** The big number on the seat (player number, enabled, board). */
export function primary(
  base: Base,
  start: number,
  direction: CounterDefinition["direction"],
  o: Overrides = {},
): CounterDefinition {
  return {
    ...base,
    kind: "number",
    scope: "player",
    isPrimary: true,
    start,
    min: 0,
    max: null,
    step: 1,
    holdStep: 5,
    direction,
    visibility: "board",
    enabledByDefault: true,
    ...o,
  };
}

/** Player tally (badge), 0 by default. */
export function tally(base: Base, o: Overrides = {}): CounterDefinition {
  return {
    ...base,
    kind: "number",
    scope: "player",
    start: 0,
    min: 0,
    max: null,
    step: 1,
    holdStep: 5,
    direction: "up",
    visibility: "badge",
    enabledByDefault: false,
    ...o,
  };
}

/** Player on/off flag stored as 0/1 (badge). */
export function flag(base: Base, o: Overrides = {}): CounterDefinition {
  return {
    ...base,
    kind: "boolean",
    scope: "player",
    start: 0,
    min: 0,
    max: 1,
    step: 1,
    direction: "up",
    visibility: "badge",
    enabledByDefault: true,
    ...o,
  };
}

/** Exclusive marker held by at most one seat. */
export function token(base: Base, o: Overrides = {}): CounterDefinition {
  return {
    ...base,
    kind: "token",
    scope: "token",
    start: 0,
    step: 1,
    direction: "up",
    visibility: "badge",
    enabledByDefault: true,
    ...o,
  };
}

/** Timer defaults: clocks off unless overridden. */
export const timer = (o: Partial<TimerConfig> = {}) => defaultTimerConfig({ mode: "off", ...o });
