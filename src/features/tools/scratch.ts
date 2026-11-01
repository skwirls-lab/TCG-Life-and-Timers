/**
 * TOOL-012 scratch counters: no built-in preset declares a "scratch counters" set, so the page is
 * a device-level list of user-named counters (Dexie kv `tools.scratch`), e.g. Lorcana ink or a
 * Pokémon damage tally. Pure helpers; the page persists the list.
 */
import { z } from "zod";

export const SCRATCH_KEY = "tools.scratch";
export const SCRATCH_MIN = -999;
export const SCRATCH_MAX = 9999;
export const SCRATCH_NAME_MAX = 24;
export const SCRATCH_LIMIT = 20;

export const ScratchCounterSchema = z.object({
  id: z.string().min(1),
  name: z.string().max(SCRATCH_NAME_MAX),
  value: z.number().int().min(SCRATCH_MIN).max(SCRATCH_MAX),
});
export type ScratchCounter = z.infer<typeof ScratchCounterSchema>;
export const ScratchListSchema = z.array(ScratchCounterSchema).max(SCRATCH_LIMIT);

function nextId(list: readonly ScratchCounter[]): string {
  let n = list.length + 1;
  const used = new Set(list.map((c) => c.id));
  while (used.has(`c${n}`)) n++;
  return `c${n}`;
}

/** Append a counter at 0 (no-op at the limit). */
export function addCounter(list: readonly ScratchCounter[], name: string): ScratchCounter[] {
  if (list.length >= SCRATCH_LIMIT) return [...list];
  return [...list, { id: nextId(list), name: name.slice(0, SCRATCH_NAME_MAX), value: 0 }];
}

export function renameCounter(
  list: readonly ScratchCounter[],
  id: string,
  name: string,
): ScratchCounter[] {
  return list.map((c) => (c.id === id ? { ...c, name: name.slice(0, SCRATCH_NAME_MAX) } : c));
}

export function removeCounter(list: readonly ScratchCounter[], id: string): ScratchCounter[] {
  return list.filter((c) => c.id !== id);
}

export function bumpCounter(
  list: readonly ScratchCounter[],
  id: string,
  delta: number,
): ScratchCounter[] {
  return list.map((c) =>
    c.id === id
      ? { ...c, value: Math.min(SCRATCH_MAX, Math.max(SCRATCH_MIN, c.value + delta)) }
      : c,
  );
}

/** Reset every value to 0 (names are kept). */
export function clearCounters(list: readonly ScratchCounter[]): ScratchCounter[] {
  return list.map((c) => ({ ...c, value: 0 }));
}
