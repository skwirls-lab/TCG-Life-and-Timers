/**
 * Share codes (CUS-007, SEC-005): 8 characters from [A-Za-z0-9] drawn with
 * `crypto.getRandomValues` and rejection sampling (no modulo bias). 62^8 ≈ 2.2e14 codes, so
 * collisions are rare; the creator retries on one.
 */
import { SHARE_CODE_RE } from "@/lib/firebase/docs";

export const SHARE_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
export const SHARE_CODE_LENGTH = 8;
/** Largest multiple of 62 below 256: bytes ≥ this are rejected. */
const LIMIT = 256 - (256 % SHARE_ALPHABET.length);

export type RandomBytes = (n: number) => Uint8Array;

export const cryptoBytes: RandomBytes = (n) => crypto.getRandomValues(new Uint8Array(n));

export function generateShareCode(random: RandomBytes = cryptoBytes): string {
  let out = "";
  while (out.length < SHARE_CODE_LENGTH) {
    for (const b of random(SHARE_CODE_LENGTH * 2)) {
      if (b >= LIMIT) continue;
      out += SHARE_ALPHABET[b % SHARE_ALPHABET.length];
      if (out.length === SHARE_CODE_LENGTH) break;
    }
  }
  return out;
}

export function isShareCode(code: string): boolean {
  return SHARE_CODE_RE.test(code);
}
