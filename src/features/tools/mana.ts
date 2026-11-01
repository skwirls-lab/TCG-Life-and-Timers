/** TOOL-011 Mana & Storm: device-level pool state and the game's storm counter lookup (pure). */
import { z } from "zod";
import type { CounterDefinition, Game } from "@/engine";

export const MANA_KEY = "tools.mana";
export const MANA_MAX = 999;

export const ManaStateSchema = z.object({
  W: z.number().int().min(0),
  U: z.number().int().min(0),
  B: z.number().int().min(0),
  R: z.number().int().min(0),
  G: z.number().int().min(0),
  C: z.number().int().min(0),
  storm: z.number().int().min(0),
});
export type ManaState = z.infer<typeof ManaStateSchema>;
export type ManaField = keyof ManaState;

export const emptyMana = (): ManaState => ({ W: 0, U: 0, B: 0, R: 0, G: 0, C: 0, storm: 0 });

export function bump(state: ManaState, field: ManaField, delta: number): ManaState {
  return { ...state, [field]: Math.min(MANA_MAX, Math.max(0, state[field] + delta)) };
}

/**
 * The preset's global storm counter, if it has one (data-driven: a global numeric counter with
 * the storm icon that resets on turn pass, e.g. 'mtg.storm'). Using it lets the engine reset
 * storm on PASS_TURN.
 */
export function findStormCounter(game: Pick<Game, "preset">): CounterDefinition | undefined {
  return game.preset.counters.find(
    (c) => c.scope === "global" && c.kind === "number" && c.icon === "storm",
  );
}
