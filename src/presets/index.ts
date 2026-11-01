/**
 * Built-in preset registry (PRE-001). Presets are data (ARCH-003); other game lanes append their
 * arrays here.
 */
import type { Preset } from "../engine";
import { MTG_PRESETS } from "./mtg/presets";

export const BUILT_IN_PRESETS: readonly Preset[] = [...MTG_PRESETS];

export const DEFAULT_PRESET_ID = "mtg.commander";

export function getBuiltInPreset(id: string): Preset | undefined {
  return BUILT_IN_PRESETS.find((p) => p.id === id);
}

/** Presets for pickers: hidden (P2) stubs excluded unless asked. */
export function listBuiltInPresets(opts: { includeHidden?: boolean } = {}): Preset[] {
  return BUILT_IN_PRESETS.filter((p) => opts.includeHidden || !p.hidden);
}

export { MTG_PRESETS };
