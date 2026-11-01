/**
 * Low-time warnings sub-page model (TMR-031, §13.1-C): add / remove thresholds and toggle each
 * one's sound / vibrate / flash. Pure helpers over the engine's `TimerWarning` list; every edit
 * returns a TIMER config patch (`warnings` + the mirrored `warningsMs`).
 */
import {
  formatClock,
  timerWarnings,
  warningsPatch,
  type TimerConfig,
  type TimerWarning,
} from "@/engine";
import { MIN, SEC } from "./model";

export type WarningFlag = "sound" | "vibrate" | "flash";
export const WARNING_FLAGS: readonly WarningFlag[] = ["sound", "vibrate", "flash"];

/** Thresholds offered by "Add a warning". */
export const WARNING_CHOICES_MS = [
  10 * MIN,
  5 * MIN,
  3 * MIN,
  2 * MIN,
  MIN,
  30 * SEC,
  10 * SEC,
  5 * SEC,
] as const;

type Cfg = Pick<TimerConfig, "warningsMs" | "warnings">;
type Patch = Pick<TimerConfig, "warnings" | "warningsMs">;

export function addWarning(cfg: Cfg, ms: number): Patch {
  return warningsPatch([...timerWarnings(cfg), { ms, sound: true, vibrate: true, flash: true }]);
}

export function removeWarning(cfg: Cfg, ms: number): Patch {
  return warningsPatch(timerWarnings(cfg).filter((w) => w.ms !== ms));
}

export function toggleWarningFlag(cfg: Cfg, ms: number, flag: WarningFlag, on: boolean): Patch {
  return warningsPatch(
    timerWarnings(cfg).map((w): TimerWarning => (w.ms === ms ? { ...w, [flag]: on } : w)),
  );
}

/** A preset list (all alerts on). */
export function presetWarnings(list: readonly number[]): Patch {
  return warningsPatch(list.map((ms) => ({ ms, sound: true, vibrate: true, flash: true })));
}

/** Choices not in the list yet. */
export function addChoices(cfg: Cfg): number[] {
  const have = new Set(timerWarnings(cfg).map((w) => w.ms));
  return WARNING_CHOICES_MS.filter((ms) => !have.has(ms));
}

/** "5:00 · 1:00 · 0:10" (empty string when there are no warnings). */
export function warningsSummary(cfg: Cfg): string {
  return timerWarnings(cfg)
    .map((w) => formatClock(w.ms, { showTenths: false }))
    .join(" · ");
}
