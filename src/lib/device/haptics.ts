/** Haptics (INP-008). Android only; iOS Safari has no Vibration API, so callers must also give visual feedback. */
export type HapticPattern = "tick" | "warn" | "timeout" | "confirm";

const PATTERNS: Record<HapticPattern, number | number[]> = {
  tick: 8,
  confirm: [12, 40, 12],
  warn: [60, 80, 60],
  timeout: [200, 100, 200, 100, 400],
};

export interface HapticsEnv {
  vibrate?: (pattern: number | number[]) => boolean;
}

export function hapticsSupported(env: HapticsEnv): boolean {
  return typeof env.vibrate === "function";
}

export function vibrate(env: HapticsEnv, pattern: HapticPattern, enabled: boolean): boolean {
  if (!enabled || !hapticsSupported(env)) return false;
  try {
    return env.vibrate!(PATTERNS[pattern]);
  } catch {
    return false;
  }
}

export function browserHaptics(): HapticsEnv {
  if (typeof navigator === "undefined") return {};
  return typeof navigator.vibrate === "function" ? { vibrate: (p) => navigator.vibrate(p) } : {};
}
