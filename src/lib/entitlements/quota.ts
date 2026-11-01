"use client";
/**
 * Free-tier profile / deck quotas (PRD §17.2: 4 profiles, 3 decks each). Checked on the paths
 * that CREATE a profile or deck (profiles screen, ProfilePicker "New deck", seat "Save as
 * profile"); editing existing ones is never blocked, and nothing over the limit is ever deleted.
 */
import type { TcgDb } from "@/lib/db";
import { getDb } from "@/lib/db";
import { requireLimit } from "./gate";

/** May the user create one more profile? Opens the paywall when not. */
export async function canCreateProfile(db: TcgDb = getDb()): Promise<boolean> {
  const count = await db.profiles.count();
  return requireLimit("profiles", count, "profilesUnlimited");
}

/** May the user add one more deck to `profileId`? Opens the paywall when not. */
export async function canCreateDeck(profileId: string, db: TcgDb = getDb()): Promise<boolean> {
  const count = await db.decks.where("profileId").equals(profileId).count();
  return requireLimit("decksPerProfile", count, "profilesUnlimited");
}
