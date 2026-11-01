/**
 * Built-in preset registry (PRE-001, PRE-010, PRE-011). Presets are data (ARCH-003): one folder
 * per game, registered here in picker order.
 */
import type { Preset } from "../engine";
import { DIGIMON_PRESETS } from "./digimon/presets";
import { FAB_PRESETS } from "./fab/presets";
import { FFTCG_PRESETS } from "./fftcg/presets";
import { GENERIC_PRESETS } from "./generic/presets";
import { LORCANA_PRESETS } from "./lorcana/presets";
import { MTG_PRESETS } from "./mtg/presets";
import { ONE_PIECE_PRESETS } from "./onepiece/presets";
import { POKEMON_PRESETS } from "./pokemon/presets";
import { SORCERY_PRESETS } from "./sorcery/presets";
import { SWU_PRESETS } from "./swu/presets";
import { YUGIOH_PRESETS } from "./yugioh/presets";

export const BUILT_IN_PRESETS: readonly Preset[] = [
  ...MTG_PRESETS,
  ...POKEMON_PRESETS,
  ...YUGIOH_PRESETS,
  ...FFTCG_PRESETS,
  ...LORCANA_PRESETS,
  ...ONE_PIECE_PRESETS,
  ...SWU_PRESETS,
  ...DIGIMON_PRESETS,
  ...FAB_PRESETS,
  ...SORCERY_PRESETS,
  ...GENERIC_PRESETS,
];

export const DEFAULT_PRESET_ID = "mtg.commander";

export function getBuiltInPreset(id: string): Preset | undefined {
  return BUILT_IN_PRESETS.find((p) => p.id === id);
}

/** Presets for pickers: hidden (P2) stubs excluded unless asked. */
export function listBuiltInPresets(opts: { includeHidden?: boolean } = {}): Preset[] {
  return BUILT_IN_PRESETS.filter((p) => opts.includeHidden || !p.hidden);
}

export { MTG_PRESETS };
export { hasUnverifiedValues, presetVerifyItems, type VerifyItem } from "./verify";
export { perSeatChips, type PerSeatChips } from "./hints";
