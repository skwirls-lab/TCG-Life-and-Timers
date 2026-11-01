/**
 * Sorcery: Contested Realm (PRD §10.6, PRE-011). Multi-stage loss modeled with existing engine
 * primitives (no engine change):
 *   - Life starts at 20 with min −1. Reaching 0 puts the avatar at Death's Door.
 *   - Any further damage takes Life to −1 → threshold `<= −1` → lose ("death blow").
 *   - A "Death's Door" status flag (badge) marks the stage on the seat; players set it when life
 *     hits 0 (the engine cannot derive counter state from another counter yet).
 * Not enforced: "can't gain life while at Death's Door" (see RULES-TO-VERIFY / proposed engine
 * change: threshold stages that set a status and lock the counter's direction).
 */
import type { Preset } from "../../engine";
import { flag, primary, timer } from "../builders";

export const SORCERY = { life: "sorcery.life", deathsDoor: "sorcery.deathsDoor" } as const;

export const sorcery: Preset = {
  id: "sorcery.standard",
  version: 1,
  name: "Sorcery: Contested Realm",
  game: "Sorcery: Contested Realm",
  format: "Constructed",
  description: "20 life, then Death's Door: the next damage is a death blow.",
  rulesSummary:
    "At 0 life your avatar is at Death's Door and can't gain life; the next damage dealt to it is a death blow and you lose.",
  rulesUrl: "https://sorcerytcg.com/rules",
  minPlayers: 2,
  maxPlayers: 4,
  defaultPlayers: 2,
  counters: [
    primary({ id: SORCERY.life, name: "Life", icon: "heart", category: "life" }, 20, "down", {
      min: -1,
      verify: true,
      threshold: { comparator: "<=", value: -1, outcome: "lose" },
      description: "0 = Death's Door. One more damage (−1) is the death blow.",
    }),
    flag(
      { id: SORCERY.deathsDoor, name: "Death's Door", icon: "skull", category: "status" },
      { verify: true, description: "Set when life reaches 0. The next damage loses." },
    ),
  ],
  quickStartValues: [20],
  capabilities: [],
  defaults: { timer: timer(), firstPlayerRule: "random" },
  builtIn: true,
};

export const SORCERY_PRESETS: Preset[] = [sorcery];
