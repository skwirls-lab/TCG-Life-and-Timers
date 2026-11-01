/** Shared fixtures for engine tests. */
import {
  createGame,
  createSession,
  defaultTimerConfig,
  reduceSession,
  seededRng,
  type CounterDefinition,
  type Game,
  type GameAction,
  type GameSession,
  type NewGameConfig,
  type Preset,
  type Rng,
} from "@/engine";

export const T0 = 1_700_000_000_000;

const num = (
  o: Partial<CounterDefinition> & Pick<CounterDefinition, "id" | "name">,
): CounterDefinition => ({
  icon: "star",
  kind: "number",
  scope: "player",
  category: "other",
  start: 0,
  min: 0,
  max: null,
  step: 1,
  direction: "up",
  visibility: "badge",
  enabledByDefault: true,
  ...o,
});

/** A compact preset exercising every counter feature. */
export function testPreset(o: Partial<Preset> = {}): Preset {
  return {
    id: "test.all",
    version: 1,
    name: "Test",
    game: "Test",
    description: "test preset",
    rulesSummary: "test",
    minPlayers: 1,
    maxPlayers: 8,
    defaultPlayers: 4,
    counters: [
      num({
        id: "life",
        name: "Life",
        icon: "heart",
        category: "life",
        isPrimary: true,
        start: 20,
        min: null,
        direction: "down",
        holdStep: 10,
        visibility: "board",
        threshold: { comparator: "<=", value: 0, outcome: "lose" },
      }),
      num({
        id: "poison",
        name: "Poison",
        category: "poison",
        threshold: { comparator: ">=", value: 10, outcome: "lose" },
      }),
      num({
        id: "cmd",
        name: "Commander damage",
        category: "commander",
        scope: "playerVsOpponent",
        sourcesPerOpponent: 1,
        linkedTo: { counterId: "life", factor: -1, optional: true },
        threshold: { comparator: ">=", value: 21, outcome: "lose", perSource: true },
        visibility: "board",
      }),
      num({ id: "tax", name: "Tax", category: "tax", perCommander: true, taxMultiplier: 2 }),
      num({ id: "energy", name: "Energy", category: "resource", max: 5, enabledByDefault: false }),
      num({ id: "seen", name: "Seen", showWhenDefault: true }),
      num({
        id: "flag",
        name: "Supporter",
        kind: "boolean",
        max: 1,
        resetOnTurnPass: true,
        category: "status",
      }),
      num({
        id: "asleep",
        name: "Asleep",
        kind: "boolean",
        max: 1,
        exclusiveGroup: "rot",
        category: "status",
      }),
      num({
        id: "confused",
        name: "Confused",
        kind: "boolean",
        max: 1,
        exclusiveGroup: "rot",
        category: "status",
      }),
      num({
        id: "storm",
        name: "Storm",
        scope: "global",
        visibility: "panel",
        resetOnTurnPass: true,
      }),
      num({
        id: "daynight",
        name: "Day/Night",
        kind: "enum",
        scope: "global",
        enumValues: ["neither", "day", "night"],
        enumCycleFrom: 1,
        icon: "daynight",
        visibility: "board",
        min: null,
      }),
      num({
        id: "mode",
        name: "Mode",
        kind: "enum",
        enumValues: ["a", "b"],
        min: null,
        visibility: "panel",
      }),
      num({
        id: "lore",
        name: "Lore",
        category: "score",
        threshold: { comparator: ">=", value: 20, outcome: "win" },
      }),
      {
        id: "monarch",
        name: "Monarch",
        icon: "crown",
        kind: "token",
        scope: "token",
        category: "status",
        start: 0,
        step: 1,
        direction: "up",
        visibility: "badge",
        enabledByDefault: true,
      },
      {
        id: "init",
        name: "Initiative",
        icon: "initiative",
        kind: "token",
        scope: "token",
        category: "status",
        start: 0,
        step: 1,
        direction: "up",
        visibility: "badge",
        enabledByDefault: false,
      },
    ],
    quickStartValues: [10, 20],
    capabilities: [
      "commanderDamage",
      "partners",
      "commanderTax",
      "monarch",
      "dayNight",
      "perTurnFlags",
    ],
    defaults: { timer: defaultTimerConfig(), firstPlayerRule: "random" },
    builtIn: false,
    ...o,
  };
}

export const NAMES = ["Bethany", "JP", "Conner", "Josh"];

export function newGame(cfg: Partial<NewGameConfig> = {}, rng: Rng = seededRng(1), now = T0): Game {
  return createGame(
    {
      preset: testPreset(),
      seats: NAMES.map((name, i) => ({ id: `s${i + 1}`, name })),
      firstSeatId: "s1",
      ...cfg,
    },
    rng,
    now,
  );
}

/** Apply actions through a session (undo-aware). */
export function run(
  session: GameSession,
  actions: GameAction[],
  rng: Rng = seededRng(2),
): GameSession {
  return actions.reduce((s, a) => reduceSession(s, a, { rng }), session);
}

export function sessionOf(game: Game): GameSession {
  return createSession(game);
}
