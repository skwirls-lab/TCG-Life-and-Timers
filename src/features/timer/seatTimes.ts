/**
 * TMR-060 "Different time per seat" + declare-blockers settings helpers (setup and settings
 * only; kept out of the board bundle). Pure; unit-tested.
 *
 * The engine stores a signed extra time per seat id (`TimerConfig.seatExtraMs`), added to the
 * base allotment (bank in bank modes, per-turn time in per-turn modes). The editors show the
 * absolute starting time per seat; the default is the base time.
 */
import { baseAllotmentMs, formatClock, type TimerConfig, type TimerMode } from "@/engine";
import { BANK_MODES, MIN, PER_TURN_MODES, SEC } from "./model";

/** Blockers window lengths offered (5–120 s). */
export const BLOCKERS_SECONDS = [5, 10, 15, 20, 30, 45, 60, 90, 120] as const;

export type ModeFamily = "bank" | "turn";

/** Which base a mode's handicap adjusts (null: no limited per-seat time). */
export function modeFamily(mode: TimerMode): ModeFamily | null {
  if (BANK_MODES.includes(mode)) return "bank";
  if (PER_TURN_MODES.includes(mode)) return "turn";
  return null;
}

/** The per-seat stepper step (1 min for banks, 15 s per turn). */
export function seatTimeStep(mode: TimerMode): number {
  return modeFamily(mode) === "turn" ? 15 * SEC : MIN;
}

/** The handicap toggle is on (an object, possibly empty). */
export function seatTimesOn(cfg: Pick<TimerConfig, "seatExtraMs">): boolean {
  return cfg.seatExtraMs !== undefined;
}

/** A seat's absolute starting time in the editor. */
export function seatTimeMs(cfg: TimerConfig, extraMs: number | undefined): number {
  return Math.max(0, baseAllotmentMs(cfg) + (extraMs ?? 0));
}

/** The extra time for an absolute value chosen in the editor (0 = the base time). */
export function extraFor(cfg: TimerConfig, absoluteMs: number): number {
  return absoluteMs - baseAllotmentMs(cfg);
}

/** Map with zero entries dropped. */
export function compactExtra(extra: Record<string, number>): Record<string, number> {
  return Object.fromEntries(Object.entries(extra).filter(([, v]) => v !== 0));
}

/**
 * A mode change to another family (bank ↔ per turn) would apply minutes of extra bank to a
 * per-turn allowance: clear the extras (the toggle stays on).
 */
export function modePatch(cfg: TimerConfig, mode: TimerMode): Partial<TimerConfig> {
  if (!cfg.seatExtraMs || modeFamily(cfg.mode) === modeFamily(mode)) return { mode };
  return { mode, seatExtraMs: {} };
}

/** "+5:00" / "−1:00" for an extra time. */
export function formatExtra(ms: number): string {
  return `${ms < 0 ? "−" : "+"}${formatClock(Math.abs(ms), { showTenths: false })}`;
}

/** Summary line for the settings row: "Ana +5:00 · Ben −1:00" (empty when all equal). */
export function seatTimesSummary(
  cfg: Pick<TimerConfig, "seatExtraMs">,
  seats: readonly { id: string; name: string }[],
): string {
  const extra = cfg.seatExtraMs ?? {};
  return seats
    .filter((s) => (extra[s.id] ?? 0) !== 0)
    .map((s) => `${s.name} ${formatExtra(extra[s.id]!)}`)
    .join(" · ");
}

/** Effective blockers settings (absent keys = defaults). */
export function blockersSettings(cfg: TimerConfig): {
  on: boolean;
  seconds: number;
  timeout: NonNullable<TimerConfig["blockersTimeout"]>;
} {
  return {
    on: cfg.blockersWindow === true,
    seconds: Math.round((cfg.blockersMs ?? 30 * SEC) / SEC),
    timeout: cfg.blockersTimeout ?? "wait",
  };
}
