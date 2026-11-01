/**
 * Setup hints for per-seat overrides (PRE-013, consumed by T3.4): which chip values to offer for a
 * seat's primary start and threshold. Derived from preset data; built-ins may add threshold chips.
 */
import type { Preset } from "../engine";
import { SWU_BASE_HP } from "./swu/presets";

const THRESHOLD_CHIPS: Record<string, number[]> = {
  "swu.premier": SWU_BASE_HP,
};

export interface PerSeatChips {
  counterId: string;
  /** Present when the preset has the `perSeatStart` capability. */
  start?: number[];
  /** Present when the primary threshold allows per-seat overrides. */
  threshold?: number[];
}

/** Per-seat chip values for the primary counter, or undefined when the preset has none. */
export function perSeatChips(preset: Preset): PerSeatChips | undefined {
  const primary = preset.counters.find((c) => c.isPrimary);
  if (!primary) return undefined;
  const out: PerSeatChips = { counterId: primary.id };
  if (preset.capabilities.includes("perSeatStart")) {
    out.start = preset.quickStartValues?.length ? [...preset.quickStartValues] : [primary.start];
  }
  if (primary.threshold?.perSeatOverride) {
    out.threshold = [...(THRESHOLD_CHIPS[preset.id] ?? [primary.threshold.value])];
  }
  return out.start || out.threshold ? out : undefined;
}
