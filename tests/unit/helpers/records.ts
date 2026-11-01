/** Game driver for record tests: a real preset, fixed seat ids and a virtual clock. */
import {
  createGame,
  reduce,
  seededRng,
  type Game,
  type GameAction,
  type NewGameConfig,
  type SeatInput,
} from "@/engine";
import { getBuiltInPreset } from "@/presets";

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
export type Input = DistributiveOmit<GameAction, "now">;

export const T0 = Date.UTC(2026, 9, 1, 18, 0, 0);
export const MIN = 60_000;

export class Play {
  g: Game;
  t = 0;
  private rng = seededRng(3);

  constructor(seats: SeatInput[], cfg: Partial<NewGameConfig> = {}, presetId = "mtg.commander") {
    const preset = getBuiltInPreset(presetId)!;
    this.g = createGame(
      {
        preset,
        seats: seats.map((s, i) => ({ id: `s${i + 1}`, ...s })),
        firstSeatId: "s1",
        ...cfg,
      },
      this.rng,
      T0,
    );
  }

  get now() {
    return T0 + this.t;
  }

  /** Advance the virtual clock by `ms`. */
  wait(ms: number): this {
    this.t += ms;
    return this;
  }

  do(...actions: Input[]): this {
    for (const a of actions) {
      this.g = reduce(this.g, { ...a, now: this.now } as GameAction, { rng: this.rng });
    }
    return this;
  }

  life(seat: string, delta: number): this {
    return this.do({ type: "COUNTER_ADD", counterId: "mtg.life", seatId: seat, delta });
  }
}

export const names = (...n: string[]): SeatInput[] => n.map((name) => ({ name }));
