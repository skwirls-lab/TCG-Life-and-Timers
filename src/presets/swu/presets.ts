/**
 * Star Wars: Unlimited (PRD §10.6). Damage on your base counts up; you lose when it reaches the
 * base's HP, which differs per base (25/28/30) — a per-seat threshold override (PRE-013).
 */
import type { Preset } from "../../engine";
import { primary, token, timer } from "../builders";

export const SWU = { baseDamage: "swu.baseDamage", initiative: "swu.initiative" } as const;

/** Common base HP values offered as per-seat threshold chips. */
export const SWU_BASE_HP = [25, 28, 30];

export const starWarsUnlimited: Preset = {
  id: "swu.premier",
  version: 1,
  name: "Star Wars: Unlimited",
  game: "Star Wars: Unlimited",
  format: "Premier",
  description: "Damage on your base counts up to its HP; each seat can set its base's HP.",
  rulesSummary:
    "Lose when the damage on your base reaches its HP (25, 28 or 30 depending on the base). The Initiative token passes when claimed.",
  rulesUrl: "https://starwarsunlimited.com/how-to-play",
  minPlayers: 2,
  maxPlayers: 4,
  defaultPlayers: 2,
  counters: [
    primary(
      { id: SWU.baseDamage, name: "Base damage", icon: "damage", category: "damage" },
      0,
      "up",
      {
        verify: true,
        threshold: {
          comparator: ">=",
          value: 30,
          outcome: "lose",
          perSeatOverride: true,
          label: "Base HP",
        },
        description: "Damage on your base. Set each seat's base HP in setup.",
      },
    ),
    token({ id: SWU.initiative, name: "Initiative", icon: "initiative", category: "status" }),
  ],
  capabilities: ["initiative"],
  defaults: { timer: timer(), firstPlayerRule: "random" },
  builtIn: true,
};

export const SWU_PRESETS: Preset[] = [starWarsUnlimited];
