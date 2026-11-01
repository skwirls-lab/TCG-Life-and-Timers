/**
 * One Piece Card Game (PRD §10.6). Life = cards in the Life area, set per seat from the Leader
 * (usually 4 or 5; PRE-013 perSeatStart). DON!! is a plain 0–10 counter: the deck refreshes and
 * adds DON!! during its own phases, which players apply manually (no auto-reset on pass).
 */
import type { Preset } from "../../engine";
import { primary, tally, timer } from "../builders";

export const OP = { life: "op.life", don: "op.don" } as const;

export const onePiece: Preset = {
  id: "onepiece.standard",
  version: 1,
  name: "One Piece Card Game",
  game: "One Piece Card Game",
  format: "Standard",
  description: "Life cards set by each Leader, plus a DON!! tracker.",
  rulesSummary:
    "Each Leader sets the starting Life (usually 4 or 5). Taking damage at 0 Life loses the game; so does drawing from an empty deck.",
  rulesUrl: "https://en.onepiece-cardgame.com/rules/",
  minPlayers: 2,
  maxPlayers: 2,
  defaultPlayers: 2,
  counters: [
    primary({ id: OP.life, name: "Life", icon: "heart", category: "life" }, 5, "down", {
      holdStep: 1,
      verify: true,
      threshold: { comparator: "<=", value: 0, outcome: "lose" },
      description: "Cards in your Life area. Each seat can start at its Leader's Life value.",
    }),
    tally(
      { id: OP.don, name: "DON!!", icon: "don", category: "resource" },
      {
        max: 10,
        holdStep: 1,
        enabledByDefault: true,
        description: "Active DON!! cards (0–10). Not reset automatically.",
      },
    ),
  ],
  quickStartValues: [4, 5],
  capabilities: ["perSeatStart"],
  defaults: { timer: timer(), firstPlayerRule: "random" },
  builtIn: true,
};

export const ONE_PIECE_PRESETS: Preset[] = [onePiece];
