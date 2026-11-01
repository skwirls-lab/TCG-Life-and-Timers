/** Small JSON helpers for the sync engine (stable comparison, undefined stripping). */
import type { Json, JsonObject } from "./types";

/** Deterministic JSON string (object keys sorted, undefined dropped). */
export function stableStringify(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((v) => (v === undefined ? null : sortKeys(v)));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(value).sort()) {
      const v = (value as Record<string, unknown>)[k];
      if (v !== undefined) out[k] = sortKeys(v);
    }
    return out;
  }
  return value;
}

export function jsonEqual(a: unknown, b: unknown): boolean {
  return stableStringify(a) === stableStringify(b);
}

/** Deep copy that drops `undefined` object values (Firestore rejects them) and non-JSON values. */
export function toJson(value: unknown): Json {
  return JSON.parse(JSON.stringify(value ?? null)) as Json;
}

export function toJsonObject(value: object): JsonObject {
  return toJson(value) as JsonObject;
}
