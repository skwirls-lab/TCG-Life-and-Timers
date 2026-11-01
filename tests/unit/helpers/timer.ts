/** Timer test driver: a session plus a virtual clock (ms since T0). */
import {
  createSession,
  displayMs,
  reduceSession,
  remaining,
  seededRng,
  timeUsed,
  type GameAction,
  type GameSession,
  type NewGameConfig,
  type SeatId,
  type TimerConfig,
} from "@/engine";
import { newGame, T0 } from "./engine";

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
export type Input = DistributiveOmit<GameAction, "now">;

export const SEC = 1000;
export const MIN = 60_000;

export class Table {
  s: GameSession;
  /** ms since T0 */
  t = 0;
  private rng = seededRng(7);

  constructor(timer: Partial<TimerConfig>, cfg: Partial<NewGameConfig> = {}) {
    this.s = createSession(
      newGame({
        timer: { mode: "bank", bankMs: 10 * MIN, timeoutAction: "lose", warningsMs: [], ...timer },
        ...cfg,
      }),
    );
  }

  get g() {
    return this.s.game;
  }

  get now() {
    return T0 + this.t;
  }

  at(ms: number): this {
    this.t = ms;
    return this;
  }

  do(...actions: Input[]): this {
    for (const a of actions) {
      this.s = reduceSession(this.s, { ...a, now: this.now } as GameAction, { rng: this.rng });
    }
    return this;
  }

  /** Dispatch at `ms` (relative to T0). */
  doAt(ms: number, ...actions: Input[]): this {
    return this.at(ms).do(...actions);
  }

  rem(seat: SeatId): number {
    return remaining(this.g, seat, this.now);
  }

  used(seat: SeatId): number {
    return timeUsed(this.g, seat, this.now);
  }

  shown(seat: SeatId): number {
    return displayMs(this.g, seat, this.now);
  }

  get timer() {
    return this.g.timer;
  }

  lastTimerEvent() {
    return this.g.log.filter((e) => e.kind === "timer").at(-1);
  }
}
