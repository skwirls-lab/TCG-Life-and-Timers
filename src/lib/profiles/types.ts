/**
 * CONTRACT (shared): player profile + deck domain types (PROF-001, PROF-010).
 * Persistence (Dexie tables `profiles` / `decks`) and the repository are implemented by the
 * SEATMENU lane in src/lib/profiles/repo.ts.
 */
import type { ArtRef } from "@/engine";

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
