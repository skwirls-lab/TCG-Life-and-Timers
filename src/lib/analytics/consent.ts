/**
 * Analytics / error-reporting consent (LEG-004). Default is "unset" = nothing collected. The choice
 * is device-local (localStorage, synchronous so it is known before any telemetry could start).
 */
import { create } from "zustand";

export type ConsentChoice = "unset" | "granted" | "denied";

export const CONSENT_KEY = "tcg.consent.v1";

interface StoredConsent {
  v: 1;
  choice: "granted" | "denied";
  at: number;
}

export type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function defaultStorage(): StorageLike | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

export function readConsent(storage: StorageLike | null = defaultStorage()): ConsentChoice {
  try {
    const raw = storage?.getItem(CONSENT_KEY);
    if (!raw) return "unset";
    const parsed = JSON.parse(raw) as Partial<StoredConsent>;
    return parsed.v === 1 && (parsed.choice === "granted" || parsed.choice === "denied")
      ? parsed.choice
      : "unset";
  } catch {
    return "unset";
  }
}

export function writeConsent(
  choice: ConsentChoice,
  storage: StorageLike | null = defaultStorage(),
  now: number = Date.now(),
): void {
  try {
    if (choice === "unset") storage?.removeItem(CONSENT_KEY);
    else storage?.setItem(CONSENT_KEY, JSON.stringify({ v: 1, choice, at: now }));
  } catch {
    // Private mode / quota: the choice still applies for this session via the store.
  }
}

interface ConsentStore {
  /** null until read on the client (SSR and the first client render agree on "not shown"). */
  choice: ConsentChoice | null;
  hydrate: () => void;
  set: (choice: ConsentChoice) => void;
}

type Listener = (choice: ConsentChoice) => void;
const listeners = new Set<Listener>();

/** Called on every explicit choice (not on hydrate). Returns an unsubscribe function. */
export function onConsentChange(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export const useConsent = create<ConsentStore>((set) => ({
  choice: null,
  hydrate: () => set({ choice: readConsent() }),
  set: (choice) => {
    writeConsent(choice);
    set({ choice });
    for (const fn of listeners) fn(choice);
  },
}));

/** Current choice, reading storage if the store was not hydrated yet. */
export function currentConsent(): ConsentChoice {
  return useConsent.getState().choice ?? readConsent();
}
