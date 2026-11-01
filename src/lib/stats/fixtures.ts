/**
 * Hand-built stats fixtures (T6.4): 26 records whose aggregates are computed by hand in
 * `stats.test.ts` and used by the e2e seed loader (`/dev/history?seed=fixtures`).
 *
 * Cast: Ana (profile p-ana, deck "Toxrill" d-tox in group A), Ben (deck name "Krenko" in A),
 * Cy (commander "Kaalia" in A), Dee, Declan (written "Declan" and "declan  "), and the default
 * names "Player 3" / "Player 4" (excluded from player stats by default).
 *
 * A (12) Commander 4p [Ana, Ben, Cy, Dee], starting seat i % 4, days 1–12
 * B (8)  Constructed 2p [Ana, Ben], starting seat j % 2, timer on, days 13–20
 * C (4)  Commander 4p [Ana, Ben, Player 3, Player 4], starting seat k, days 21–24
 * D (2)  Commander 3p [Declan, Ben, Cy], starting seat 0 / 1, days 25–26
 */
import { assignPlaces, syncSeats } from "@/lib/records/build";
import { identityOf } from "@/lib/records/identity";
import type {
  CauseKind,
  CommanderDamageEntry,
  GameRecord,
  RecordClockStats,
  RecordElimination,
  RecordOutcome,
  RecordPlayer,
} from "@/lib/records/types";

export const FIXTURE_BASE = Date.UTC(2026, 8, 1, 20, 0, 0);
export const DAY = 86_400_000;
const MIN = 60_000;
const SEC = 1000;
const COLORS = ["#f472b6", "#60a5fa", "#facc15", "#34d399"];

interface SeatSpec {
  name: string;
  profileId?: string;
  deckId?: string;
  deckName?: string;
  commanders?: string[];
  clock?: Partial<RecordClockStats>;
}

interface Spec {
  id: string;
  day: number;
  preset: "commander" | "constructed";
  seats: SeatSpec[];
  start: number;
  /** winning seat index, "draw" or "none" */
  winner: number | "draw" | "none";
  /** [seat index, cause] in elimination order */
  elims: [number, CauseKind][];
  minutes: number;
  turns?: number;
  timer?: boolean;
  cmd?: [number, number, number][];
}

const PRESETS = {
  commander: { id: "mtg.commander", name: "Commander", start: 40 },
  constructed: { id: "mtg.constructed", name: "Constructed", start: 20 },
} as const;

function clock(c: Partial<RecordClockStats>): RecordClockStats {
  return {
    usedMs: 0,
    turns: 0,
    timedTurns: 0,
    avgTurnMs: null,
    timeouts: 0,
    responseMs: 0,
    responses: 0,
    ...c,
  };
}

function make(s: Spec): GameRecord {
  const preset = PRESETS[s.preset];
  const n = s.seats.length;
  const endedAt = FIXTURE_BASE + s.day * DAY;
  const startedAt = endedAt - s.minutes * MIN;
  const seatId = (i: number) => `${s.id}-s${i}`;
  const outcome: RecordOutcome =
    s.winner === "draw" ? "draw" : s.winner === "none" ? "none" : "win";
  const cmd: CommanderDamageEntry[] = (s.cmd ?? []).map(([from, to, amount]) => ({
    from: seatId(from),
    to: seatId(to),
    amount,
  }));
  const eliminations: RecordElimination[] = s.elims.map(([i, kind], k) => {
    const e: RecordElimination = {
      seatId: seatId(i),
      name: s.seats[i]!.name,
      cause:
        kind === "time" || kind === "concede" || kind === "manual"
          ? { kind }
          : { kind: "threshold", counterId: `mtg.${kind === "commander" ? "cmdDamage" : kind}` },
      causeKind: kind,
      turn: k + 2,
      round: 1,
      at: startedAt + (k + 1) * MIN,
    };
    if (kind === "commander") {
      const src = cmd.find((c) => c.to === seatId(i));
      if (src) e.sourceSeatId = src.from;
    }
    return e;
  });
  const players: RecordPlayer[] = s.seats.map((seat, i) => {
    const order = s.elims.findIndex(([j]) => j === i);
    const p: RecordPlayer = {
      seatId: seatId(i),
      name: seat.name,
      identity: identityOf(seat),
      commanders: seat.commanders ?? [],
      color: COLORS[i % COLORS.length]!,
      seatIndex: i,
      turnPosition: ((i - s.start + n) % n) + 1,
      winner: s.winner === i,
      finals: {},
      primary: order >= 0 ? 0 : preset.start,
      commanderDamageDealt: cmd
        .filter((c) => c.from === seatId(i))
        .reduce((a, c) => a + c.amount, 0),
    };
    p.finals[`mtg.life`] = p.primary;
    if (order >= 0) p.eliminatedOrder = order + 1;
    if (seat.profileId) p.profileId = seat.profileId;
    if (seat.deckId) p.deckId = seat.deckId;
    if (seat.deckName) p.deckName = seat.deckName;
    if (seat.clock) p.clock = clock(seat.clock);
    return p;
  });
  const placed = assignPlaces(players, outcome);
  return {
    id: s.id,
    schemaVersion: 1,
    presetId: preset.id,
    game: "Magic: The Gathering",
    startedAt,
    endedAt,
    durationMs: s.minutes * MIN,
    seats: syncSeats(placed),
    createdAt: endedAt,
    updatedAt: endedAt,
    presetName: preset.name,
    format: preset.name,
    wallMs: s.minutes * MIN,
    playerCount: n,
    primaryCounterId: "mtg.life",
    primaryCounterName: "Life",
    startValue: preset.start,
    startingSeatId: seatId(s.start),
    turns: s.turns ?? 1,
    rounds: 1,
    turnTracking: s.turns !== undefined,
    timerMode: s.timer ? "bank" : "off",
    outcome,
    winners: placed.filter((p) => p.winner).map((p) => p.seatId),
    eliminations,
    players: placed,
    commanderDamage: cmd,
    changes: 10,
  };
}

const ANA: SeatSpec = { name: "Ana", profileId: "p-ana", deckId: "d-tox", deckName: "Toxrill" };
const BEN: SeatSpec = { name: "Ben", deckName: "Krenko" };
const CY: SeatSpec = { name: "Cy", commanders: ["Kaalia"] };
const DEE: SeatSpec = { name: "Dee" };

type A = [winner: Spec["winner"], elims: Spec["elims"], minutes: number, extra?: Partial<Spec>];
const GROUP_A: A[] = [
  [
    0,
    [
      [3, "life"],
      [2, "commander"],
      [1, "life"],
    ],
    60,
    { turns: 30, cmd: [[0, 2, 21]] },
  ],
  [
    1,
    [
      [0, "poison"],
      [3, "life"],
      [2, "life"],
    ],
    50,
    { turns: 28, cmd: [[1, 3, 10]] },
  ],
  [
    2,
    [
      [1, "life"],
      [0, "commander"],
      [3, "concede"],
    ],
    70,
    { turns: 36, cmd: [[2, 0, 21]] },
  ],
  [
    3,
    [
      [2, "time"],
      [1, "life"],
      [0, "life"],
    ],
    40,
    { turns: 20, timer: true },
  ],
  [
    0,
    [
      [1, "life"],
      [3, "life"],
      [2, "life"],
    ],
    55,
  ],
  [
    0,
    [
      [2, "life"],
      [1, "commander"],
      [3, "life"],
    ],
    65,
    { cmd: [[0, 1, 21]] },
  ],
  [
    2,
    [
      [3, "poison"],
      [0, "life"],
      [1, "life"],
    ],
    45,
  ],
  [
    0,
    [
      [1, "life"],
      [2, "life"],
      [3, "life"],
    ],
    35,
  ],
  [
    1,
    [
      [3, "life"],
      [0, "life"],
      [2, "life"],
    ],
    80,
  ],
  ["none", [[3, "life"]], 30],
  ["draw", [[1, "life"]], 25],
  [
    3,
    [
      [0, "concede"],
      [1, "life"],
      [2, "life"],
    ],
    60,
  ],
];

/** Clock stats of game A4 (index 3), the only timed Commander game. */
const A3_CLOCKS: Partial<RecordClockStats>[] = [
  { avgTurnMs: 100 * SEC, timedTurns: 5, turns: 5, usedMs: 500 * SEC },
  {
    avgTurnMs: 120 * SEC,
    timedTurns: 5,
    turns: 5,
    usedMs: 600 * SEC,
    responses: 2,
    responseMs: 40 * SEC,
  },
  { avgTurnMs: 200 * SEC, timedTurns: 5, turns: 5, usedMs: 1000 * SEC, timeouts: 1 },
  { avgTurnMs: 80 * SEC, timedTurns: 5, turns: 5, usedMs: 400 * SEC },
];

const B_WINNERS: Spec["winner"][] = [0, 1, 0, 0, 1, 1, 0, "none"];

const C_GAMES: [winner: number, elims: Spec["elims"]][] = [
  [
    2,
    [
      [0, "life"],
      [1, "life"],
      [3, "life"],
    ],
  ],
  [
    0,
    [
      [3, "life"],
      [2, "life"],
      [1, "life"],
    ],
  ],
  [
    1,
    [
      [2, "life"],
      [0, "life"],
      [3, "life"],
    ],
  ],
  [
    3,
    [
      [1, "life"],
      [0, "poison"],
      [2, "life"],
    ],
  ],
];

function build(): GameRecord[] {
  const out: GameRecord[] = [];
  GROUP_A.forEach(([winner, elims, minutes, extra], i) => {
    const seats =
      i === 3
        ? [ANA, BEN, CY, DEE].map((s, k) => ({ ...s, clock: A3_CLOCKS[k] }))
        : [ANA, BEN, CY, DEE];
    out.push(
      make({
        id: `a${i + 1}`,
        day: i + 1,
        preset: "commander",
        seats,
        start: i % 4,
        winner,
        elims,
        minutes,
        ...extra,
      }),
    );
  });
  B_WINNERS.forEach((winner, j) => {
    const loser = winner === 0 ? 1 : 0;
    out.push(
      make({
        id: `b${j + 1}`,
        day: 13 + j,
        preset: "constructed",
        seats: [
          {
            name: "Ana",
            profileId: "p-ana",
            clock: { avgTurnMs: 60 * SEC, timedTurns: 10, turns: 10, usedMs: 600 * SEC },
          },
          {
            name: "Ben",
            clock: {
              avgTurnMs: 90 * SEC,
              timedTurns: 10,
              turns: 10,
              usedMs: 900 * SEC,
              timeouts: j === 5 ? 1 : 0,
            },
          },
        ],
        start: j % 2,
        winner,
        elims: winner === "none" ? [] : [[loser, "life"]],
        minutes: winner === "none" ? 15 : 20,
        timer: true,
      }),
    );
  });
  C_GAMES.forEach(([winner, elims], k) => {
    out.push(
      make({
        id: `c${k + 1}`,
        day: 21 + k,
        preset: "commander",
        seats: [
          { name: "Ana", profileId: "p-ana" },
          { name: "Ben" },
          { name: "Player 3" },
          { name: "Player 4" },
        ],
        start: k,
        winner,
        elims,
        minutes: 50,
      }),
    );
  });
  out.push(
    make({
      id: "d1",
      day: 25,
      preset: "commander",
      seats: [{ name: "Declan" }, { name: "Ben" }, { name: "Cy" }],
      start: 0,
      winner: 0,
      elims: [
        [2, "life"],
        [1, "life"],
      ],
      minutes: 40,
    }),
    make({
      id: "d2",
      day: 26,
      preset: "commander",
      seats: [{ name: "declan  " }, { name: "Ben" }, { name: "Cy" }],
      start: 1,
      winner: 1,
      elims: [
        [0, "life"],
        [2, "life"],
      ],
      minutes: 40,
    }),
  );
  return out;
}

/** The 26 fixture records, oldest first. */
export const FIXTURE_RECORDS: readonly GameRecord[] = build();
