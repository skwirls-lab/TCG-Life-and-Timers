/** Shared fixtures for the rules tests: an emulator test environment plus valid documents. */
import { initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { readFileSync } from "node:fs";
import { serverTimestamp } from "firebase/firestore";

export const PROJECT_ID = "demo-tcg-life";
export const ALICE = "alice";
export const BOB = "bob";

export async function makeEnv(): Promise<RulesTestEnvironment> {
  return initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules: readFileSync("firestore.rules", "utf8"), host: "127.0.0.1", port: 8080 },
    storage: { rules: readFileSync("storage.rules", "utf8"), host: "127.0.0.1", port: 9199 },
  });
}

const now = () => serverTimestamp();

export const valid = {
  user: () => ({
    displayName: "Alice",
    createdAt: now(),
    updatedAt: now(),
    settings: { theme: "dark" },
  }),
  profile: () => ({
    name: "Alice",
    normalizedName: "alice",
    color: "#ff0000",
    contrast: false,
    art: {
      kind: "scryfall",
      value: "https://cards.scryfall.io/art_crop/x.jpg",
      focal: { x: 0.5, y: 0.3 },
      artist: "A. Artist",
      cardName: "Toxrill",
    },
    updatedAt: now(),
  }),
  deck: () => ({
    name: "Toxrill",
    presetId: "mtg-commander",
    commanders: ["Toxrill, the Corrosive"],
    colorIdentity: ["U", "B"],
    updatedAt: now(),
  }),
  preset: () => ({
    name: "My preset",
    game: "Magic",
    payload: JSON.stringify({ id: "custom-1", counters: [] }),
    schemaVersion: 1,
    updatedAt: now(),
  }),
  game: () => ({
    schemaVersion: 1,
    presetId: "mtg-commander",
    game: "Magic",
    startedAt: 1_700_000_000_000,
    endedAt: 1_700_000_600_000,
    durationMs: 600_000,
    seats: [
      { name: "Alice", profileId: "p1", deckId: "d1", deckName: "Toxrill", winner: true, place: 1 },
      { name: "Bob", winner: false, place: 2 },
    ],
    log: "eJzLSM3JyVcozy/KSQEAGgQEXQ==",
    updatedAt: now(),
  }),
  art: (uid: string) => ({
    storagePath: `users/${uid}/art/a1.webp`,
    width: 1600,
    height: 900,
    bytes: 350_000,
    contentType: "image/webp",
    name: "My art",
    focal: { x: 0.5, y: 0.5 },
    updatedAt: now(),
  }),
  share: (code: string, ownerUid: string) => ({
    code,
    ownerUid,
    name: "Shared",
    game: "Magic",
    payload: JSON.stringify({ id: "custom-1" }),
    createdAt: now(),
  }),
  feedback: () => ({
    category: "bug",
    text: "The timer froze",
    appVersion: "0.1.0",
    createdAt: now(),
  }),
  checkout: () => ({
    price: "price_123abc",
    success_url: "https://example.com/account?ok=1",
    cancel_url: "https://example.com/account",
  }),
};

/** Every owner-scoped document path with a factory for a valid doc. */
export function userDocs(uid: string): { path: string; make: () => Record<string, unknown> }[] {
  return [
    { path: `users/${uid}`, make: valid.user },
    { path: `users/${uid}/profiles/p1`, make: valid.profile },
    { path: `users/${uid}/profiles/p1/decks/d1`, make: valid.deck },
    { path: `users/${uid}/presets/custom-1`, make: valid.preset },
    { path: `users/${uid}/games/g1`, make: valid.game },
    { path: `users/${uid}/art/a1`, make: () => valid.art(uid) },
  ];
}
