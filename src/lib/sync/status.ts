"use client";
/** Sync status store for Settings/Account (SYNC-004). Written by the running engine. */
import { create } from "zustand";
import type { SyncStatus } from "./types";

export const IDLE_STATUS: SyncStatus = {
  state: "idle",
  lastSyncedAt: null,
  pending: 0,
  error: null,
};

interface SyncStatusStore extends SyncStatus {
  /** True while a sync engine is running (signed in with Google). */
  active: boolean;
  set: (s: Partial<SyncStatus> & { active?: boolean }) => void;
  reset: () => void;
}

export const useSyncStatus = create<SyncStatusStore>((set) => ({
  ...IDLE_STATUS,
  active: false,
  set: (s) => set(s),
  reset: () => set({ ...IDLE_STATUS, active: false }),
}));

export type SyncStatusLine =
  | { key: "account.sync.off" }
  | { key: "account.sync.syncing"; pending: number }
  | { key: "account.sync.offline"; pending: number }
  | { key: "account.sync.error"; error: string }
  | { key: "account.sync.synced"; minutes: number }
  | { key: "account.sync.syncedNow" };

/** Human status line: "Synced · 2 min ago" / "Offline — will sync" / error (SYNC-004). */
export function describeSyncStatus(
  s: SyncStatus & { active: boolean },
  now: number = Date.now(),
): SyncStatusLine {
  if (!s.active) return { key: "account.sync.off" };
  if (s.state === "offline") return { key: "account.sync.offline", pending: s.pending };
  if (s.state === "error") return { key: "account.sync.error", error: s.error ?? "" };
  if (s.state === "syncing" || s.lastSyncedAt === null)
    return { key: "account.sync.syncing", pending: s.pending };
  const minutes = Math.floor(Math.max(0, now - s.lastSyncedAt) / 60_000);
  return minutes < 1 ? { key: "account.sync.syncedNow" } : { key: "account.sync.synced", minutes };
}
