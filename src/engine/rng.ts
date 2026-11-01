/** Injectable randomness (instructions §8 "Randomness"). The engine never calls Math.random. */

export interface Rng {
  /** Uniform integer in [0, maxExclusive). maxExclusive must be a positive integer ≤ 2^32. */
  int(maxExclusive: number): number;
}

function check(maxExclusive: number) {
  if (!Number.isInteger(maxExclusive) || maxExclusive <= 0 || maxExclusive > 2 ** 32) {
    throw new RangeError(`Rng.int: invalid bound ${maxExclusive}`);
  }
}

/** Production RNG: crypto.getRandomValues with rejection sampling (no modulo bias). */
export function cryptoRng(): Rng {
  const buf = new Uint32Array(1);
  return {
    int(maxExclusive) {
      check(maxExclusive);
      const limit = 2 ** 32 - (2 ** 32 % maxExclusive);
      for (;;) {
        globalThis.crypto.getRandomValues(buf);
        const v = buf[0]!;
        if (v < limit) return v % maxExclusive;
      }
    },
  };
}

/** Deterministic RNG for tests (mulberry32). */
export function seededRng(seed: number): Rng {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    int(maxExclusive) {
      check(maxExclusive);
      return Math.floor(next() * maxExclusive);
    },
  };
}

const ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz";

/** Random id drawn from the rng (engine-side ids; the app layer may use nanoid). */
export function randomId(rng: Rng, length = 12): string {
  let s = "";
  for (let i = 0; i < length; i++) s += ALPHABET[rng.int(ALPHABET.length)];
  return s;
}

/** Uniform pick from a non-empty array. */
export function pick<T>(rng: Rng, items: readonly T[]): T {
  if (items.length === 0) throw new RangeError("pick: empty array");
  return items[rng.int(items.length)]!;
}
