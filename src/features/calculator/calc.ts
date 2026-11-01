/**
 * Life-point calculator logic (INP-007, TOOL-006): pure helpers for the CalculatorSheet.
 *
 * - `applyCalc` turns a parsed keypad entry into the new value (halve rounds UP, Yu-Gi-Oh!).
 * - `shouldOpenCalculator` tells the board whether tapping the number opens the calculator.
 * - `calcTape` derives the "tape" of recent arithmetic for one seat from the game log. Each
 *   calculator entry is dispatched as COUNTER_SET (never batch-merged, INP-006), so every entry
 *   is its own log event. The operator typed is remembered in memory (`rememberCalc`) so the tape
 *   can show "÷ 2" and the typed operand even when clamping changed the delta; events without a
 *   remembered op (taps, other devices, after reload) show their plain delta.
 */
import type { CounterDefinition, Game, GameEvent, GameOptions, Preset, SeatId } from "@/engine";
import type { KeypadResult } from "@/components/ui/Keypad";

export type CalcOp = KeypadResult;

type Bounds = Pick<CounterDefinition, "min" | "max">;

/** New value after a calculator entry, clamped to the counter's [min, max]. */
export function applyCalc(value: number, op: CalcOp, bounds: Partial<Bounds> = {}): number {
  let next: number;
  switch (op.op) {
    case "add":
      next = value + op.value;
      break;
    case "sub":
      next = value - op.value;
      break;
    case "set":
      next = op.value;
      break;
    case "half":
      // "Halve your LP": fractions round up (8001 → 4001).
      next = Math.ceil(value / 2);
      break;
  }
  const { min, max } = bounds;
  if (min !== undefined && min !== null && next < min) next = min;
  if (max !== undefined && max !== null && next > max) next = max;
  return next;
}

/**
 * Whether tapping the primary number opens the calculator: the game's "Tap number for
 * calculator" option when known, else the preset's `calculator` capability.
 */
export function shouldOpenCalculator(
  preset: Pick<Preset, "capabilities">,
  options?: Partial<Pick<GameOptions, "tapForCalculator">>,
): boolean {
  return options?.tapForCalculator ?? preset.capabilities.includes("calculator");
}

// ---------------------------------------------------------------------------------------------
// Tape
// ---------------------------------------------------------------------------------------------

const remembered = new Map<string, CalcOp>();
const MAX_REMEMBERED = 200;

const memoKey = (gameId: string, eventId: string) => `${gameId}:${eventId}`;

/** Remember which calculator op produced a log event (in memory only). */
export function rememberCalc(gameId: string, eventId: string, op: CalcOp): void {
  remembered.set(memoKey(gameId, eventId), op);
  if (remembered.size > MAX_REMEMBERED) {
    const oldest = remembered.keys().next().value;
    if (oldest !== undefined) remembered.delete(oldest);
  }
}

/** Test hook. */
export function clearRememberedCalcs(): void {
  remembered.clear();
}

export interface TapeRow {
  eventId: string;
  from: number;
  to: number;
  /** add/sub from the delta when the op isn't known. */
  op: CalcOp["op"];
  /** Operand shown on the tape (typed value, or |delta|). */
  operand: number;
  at: number;
}

function isEntry(e: GameEvent, seatId: SeatId, counterId: string): boolean {
  return (
    e.kind === "counter" &&
    e.counterId === counterId &&
    e.seatId === seatId &&
    e.sourceSeatId === undefined &&
    e.from !== undefined &&
    e.to !== undefined
  );
}

/** The last `limit` changes of a seat's counter, oldest first. */
export function calcTape(
  game: Pick<Game, "id" | "log">,
  seatId: SeatId,
  counterId: string,
  limit = 8,
): TapeRow[] {
  const rows: TapeRow[] = [];
  for (let i = game.log.length - 1; i >= 0 && rows.length < limit; i--) {
    const e = game.log[i]!;
    if (!isEntry(e, seatId, counterId)) continue;
    const from = e.from!;
    const to = e.to!;
    const op = remembered.get(memoKey(game.id, e.id));
    rows.push(
      op
        ? { eventId: e.id, from, to, op: op.op, operand: op.value, at: e.at }
        : {
            eventId: e.id,
            from,
            to,
            op: to >= from ? "add" : "sub",
            operand: Math.abs(to - from),
            at: e.at,
          },
    );
  }
  return rows.reverse();
}

/** "8000 − 2300 = 5700", "5700 ÷ 2 = 2850", "2850 → 4000". */
export function tapeText(row: Pick<TapeRow, "from" | "to" | "op" | "operand">): string {
  switch (row.op) {
    case "add":
      return `${row.from} + ${row.operand} = ${row.to}`;
    case "sub":
      return `${row.from} − ${row.operand} = ${row.to}`;
    case "half":
      return `${row.from} ÷ 2 = ${row.to}`;
    case "set":
      return `${row.from} → ${row.to}`;
  }
}
