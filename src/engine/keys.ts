/** Counter value keys: `${counterId}|${seatId}|${sourceSeatId}|${sourceIndex}` (§6.3). */
import type { CounterId, CounterKey, SeatId } from "./types";

export interface ParsedCounterKey {
  counterId: CounterId;
  seatId?: SeatId;
  sourceSeatId?: SeatId;
  sourceIndex?: number;
}

/**
 * Build a key. Omit seatId for global counters; sourceIndex addresses matrix cells
 * (commander damage) and per-commander counters (commander tax).
 */
export function counterKey(
  counterId: CounterId,
  seatId?: SeatId,
  sourceSeatId?: SeatId,
  sourceIndex?: number,
): CounterKey {
  return `${counterId}|${seatId ?? ""}|${sourceSeatId ?? ""}|${sourceIndex ?? ""}`;
}

/** Inverse of counterKey. Throws on malformed keys. */
export function parseCounterKey(key: CounterKey): ParsedCounterKey {
  const parts = key.split("|");
  if (parts.length !== 4 || !parts[0]) throw new Error(`Malformed counter key: ${key}`);
  const [counterId, seatId, sourceSeatId, idx] = parts as [string, string, string, string];
  const out: ParsedCounterKey = { counterId };
  if (seatId) out.seatId = seatId;
  if (sourceSeatId) out.sourceSeatId = sourceSeatId;
  if (idx) {
    const n = Number(idx);
    if (!Number.isInteger(n) || n < 0) throw new Error(`Malformed counter key: ${key}`);
    out.sourceIndex = n;
  }
  return out;
}

/** True when the key targets or is sourced from the seat. */
export function keyInvolvesSeat(key: CounterKey, seatId: SeatId): boolean {
  const p = parseCounterKey(key);
  return p.seatId === seatId || p.sourceSeatId === seatId;
}
