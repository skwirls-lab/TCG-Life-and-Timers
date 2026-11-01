/**
 * CONTRACT (shared): player profile + deck domain types (PROF-001, PROF-010).
 * Persistence (Dexie tables `profiles` / `decks`) and the repository live in ./repo.ts.
 */
import type { ArtRef } from "@/engine";

/** Persisted entity versions (instructions §10.5). */
export const PROFILE_SCHEMA_VERSION = 1;
export const DECK_SCHEMA_VERSION = 1;

export interface PlayerProfile {
  id: string;
  name: string;
  color: string;
  art?: ArtRef;
  contrast: boolean;
  /** the account owner's own profile ("me", PROF-003) */
  isMe?: boolean;
  lastUsedAt?: number;
  updatedAt: number;
}

export interface Deck {
  id: string;
  profileId: string;
  name: string;
  presetId?: string;
  /** commander card names; 2 = partners */
  commanders: string[];
  art?: ArtRef;
  /** e.g. "WUB" */
  colorIdentity?: string;
  lastUsedAt?: number;
  updatedAt: number;
}

export interface ProfileSelection {
  profile: PlayerProfile;
  deck?: Deck;
}

/** Fields accepted when creating/updating a profile (id/updatedAt are managed by the repo). */
export type ProfileInput = Omit<PlayerProfile, "id" | "updatedAt"> & { id?: string };
/** Fields accepted when creating/updating a deck. */
export type DeckInput = Omit<Deck, "id" | "updatedAt" | "commanders"> & {
  id?: string;
  commanders?: string[];
};
