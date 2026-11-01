/**
 * Guest → account merge (T4.4, AUTH-003). On the first sign-in on a device, local data is merged
 * into the account. When both sides have data the user picks:
 * - "merge" (default): match by id, then profiles by normalized name; the newer `updatedAt`
 *   wins per document. Nothing is dropped: unmatched documents from both sides are kept.
 * - "cloudOnly": the device's synced tables are replaced by the cloud copy.
 *
 * `planMerge` is pure. `executeMerge` only rewrites local ids (name matches) or clears local
 * tables; the sync engine then performs the per-id last-write-wins reconciliation.
 */
import { getDb, type StoredDeck, type StoredProfile, type TcgDb } from "@/lib/db";
import {
  MERGE_COLLECTIONS,
  clearLocalAccountData,
  type DataSnapshot,
  type MergeCollection,
} from "./localData";
import { jsonEqual } from "@/lib/sync/json";
import type { SyncItem } from "@/lib/sync/types";

export type MergeChoice = "merge" | "cloudOnly";

export type MergeReason = "id" | "name" | "localOnly" | "remoteOnly";
export interface MergeOutcome {
  collection: MergeCollection;
  /** id after the merge */
  id: string;
  localId?: string;
  reason: MergeReason;
  winner: "local" | "remote" | "same";
}

export interface MergePlan {
  hasLocal: boolean;
  hasRemote: boolean;
  /** Both sides have data: ask "Merge" (default) or "Keep cloud only". */
  needsChoice: boolean;
  /** Local profile ids to rewrite to the matching cloud profile id (normalized-name match). */
  profileRenames: { from: string; to: string }[];
  outcomes: MergeOutcome[];
  counts: { local: number; remote: number };
}

/** Collections whose documents count as "user data" (settings always exist, so they don't). */
const DATA_COLLECTIONS: MergeCollection[] = ["profiles", "decks", "presets", "records", "art"];

const live = (items: SyncItem[]) => items.filter((i) => !i.deleted);

function winner(local: SyncItem, remote: SyncItem): MergeOutcome["winner"] {
  if (!remote.deleted && jsonEqual(local.data, remote.data)) return "same";
  return remote.updatedAt > local.updatedAt ? "remote" : "local";
}

export function planMerge(local: DataSnapshot, remote: DataSnapshot): MergePlan {
  const countOf = (s: DataSnapshot) => DATA_COLLECTIONS.reduce((n, c) => n + live(s[c]).length, 0);
  const counts = { local: countOf(local), remote: countOf(remote) };
  const outcomes: MergeOutcome[] = [];
  const profileRenames: { from: string; to: string }[] = [];

  // Profiles first: id match, then normalized-name match among unmatched live cloud profiles.
  const remoteProfiles = new Map(remote.profiles.map((p) => [p.id, p]));
  const claimed = new Set<string>();
  const unmatched: SyncItem[] = [];
  for (const lp of local.profiles) {
    const rp = remoteProfiles.get(lp.id);
    if (rp) {
      claimed.add(rp.id);
      outcomes.push({ collection: "profiles", id: lp.id, reason: "id", winner: winner(lp, rp) });
    } else unmatched.push(lp);
  }
  for (const lp of unmatched) {
    const name = String(lp.data.normalizedName ?? "");
    const rp = live(remote.profiles).find(
      (p) => !claimed.has(p.id) && name !== "" && p.data.normalizedName === name,
    );
    if (rp) {
      claimed.add(rp.id);
      profileRenames.push({ from: lp.id, to: rp.id });
      outcomes.push({
        collection: "profiles",
        id: rp.id,
        localId: lp.id,
        reason: "name",
        winner: winner(lp, rp),
      });
    } else
      outcomes.push({ collection: "profiles", id: lp.id, reason: "localOnly", winner: "local" });
  }
  for (const rp of live(remote.profiles))
    if (!claimed.has(rp.id))
      outcomes.push({ collection: "profiles", id: rp.id, reason: "remoteOnly", winner: "remote" });

  for (const c of MERGE_COLLECTIONS) {
    if (c === "profiles") continue;
    const rmap = new Map(remote[c].map((i) => [i.id, i]));
    for (const li of local[c]) {
      const ri = rmap.get(li.id);
      outcomes.push(
        ri
          ? { collection: c, id: li.id, reason: "id", winner: winner(li, ri) }
          : { collection: c, id: li.id, reason: "localOnly", winner: "local" },
      );
    }
    const lids = new Set(local[c].map((i) => i.id));
    for (const ri of live(remote[c]))
      if (!lids.has(ri.id))
        outcomes.push({ collection: c, id: ri.id, reason: "remoteOnly", winner: "remote" });
  }

  const hasLocal = counts.local > 0;
  const hasRemote = counts.remote > 0;
  return {
    hasLocal,
    hasRemote,
    needsChoice: hasLocal && hasRemote,
    profileRenames,
    outcomes,
    counts,
  };
}

export interface ExecuteOptions {
  includeRecords: boolean;
  db?: TcgDb;
}

/** Apply the local side of a plan. Afterwards start sync (it does the per-id LWW). */
export async function executeMerge(
  plan: MergePlan,
  choice: MergeChoice,
  opts: ExecuteOptions,
): Promise<void> {
  const db = opts.db ?? getDb();
  if (choice === "cloudOnly") {
    await clearLocalAccountData({ includeRecords: opts.includeRecords }, db);
    return;
  }
  if (!plan.profileRenames.length) return;
  await db.transaction("rw", db.profiles, db.decks, async () => {
    for (const { from, to } of plan.profileRenames) {
      const row = await db.profiles.get(from);
      if (!row) continue;
      const next: StoredProfile = { ...row, id: to };
      await db.profiles.delete(from);
      await db.profiles.put(next);
      const decks = await db.decks.where("profileId").equals(from).toArray();
      for (const d of decks) await db.decks.put({ ...d, profileId: to } satisfies StoredDeck);
    }
  });
}
