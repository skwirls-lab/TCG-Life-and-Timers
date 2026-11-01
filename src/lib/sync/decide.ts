/**
 * Per-document reconciliation (SYNC-002): three-way comparison of the local document, the remote
 * document and the "shadow" (what both sides agreed on at the last successful sync).
 *
 * - Only one side changed since the shadow → that side wins.
 * - Both changed → last-write-wins by `updatedAt` (remote server time vs the local row's clock);
 *   ties go to the local side (it is the one the user is looking at).
 * - Deletes are tombstones; a remote hard delete (document vanished after we had seen it) wins.
 * - Write-once collections (game records, SYNC-003) never push updates, only creates/tombstones.
 */
import { jsonEqual } from "./json";
import type { JsonObject, SyncItem } from "./types";

export interface ShadowEntry {
  data: JsonObject;
  deleted: boolean;
  parent?: string;
  /** local updatedAt at the last sync */
  local: number;
  /** remote (server) updatedAt last seen; 0 = written by us but not yet echoed */
  remote: number;
}

export type Decision =
  | { kind: "none"; localChanged: boolean }
  | { kind: "push"; item: SyncItem }
  | {
      kind: "applyRemote";
      item: SyncItem;
      /** remote doc vanished: forget the shadow */ gone: boolean;
    }
  | { kind: "adopt"; item: SyncItem };

const HARD_DELETE_TIME = Number.MAX_SAFE_INTEGER;

function sameDoc(a: { data: JsonObject; deleted: boolean; parent?: string }, b: typeof a): boolean {
  return (
    a.deleted === b.deleted &&
    (a.parent ?? null) === (b.parent ?? null) &&
    jsonEqual(a.data, b.data)
  );
}

export function decide(
  id: string,
  local: SyncItem | undefined,
  remote: SyncItem | undefined,
  shadow: ShadowEntry | undefined,
  opts: { writeOnce?: boolean; noDeletes?: boolean; now: number },
): Decision {
  const gone = !remote && shadow !== undefined && shadow.remote > 0;
  const r: SyncItem | undefined =
    remote ??
    (gone
      ? {
          id,
          parent: shadow.parent,
          deleted: true,
          data: shadow.data,
          updatedAt: HARD_DELETE_TIME,
        }
      : undefined);

  const localChanged =
    !local && opts.noDeletes
      ? false
      : shadow
        ? local
          ? !sameDoc({ ...local, deleted: false }, shadow)
          : !shadow.deleted
        : local !== undefined;
  const remoteChanged = r
    ? shadow
      ? r.updatedAt > shadow.remote && !sameDoc(r, shadow)
      : true
    : false;

  const applyRemote = (): Decision => ({ kind: "applyRemote", item: r!, gone });

  const push = (): Decision => {
    if (local) {
      if (opts.writeOnce && r) return { kind: "none", localChanged };
      return { kind: "push", item: { ...local, deleted: false } };
    }
    if (!shadow || shadow.deleted) return { kind: "none", localChanged };
    if (r?.deleted) return { kind: "adopt", item: r };
    return {
      kind: "push",
      item: {
        id,
        parent: shadow.parent,
        deleted: true,
        data: opts.writeOnce && r ? r.data : shadow.data,
        updatedAt: opts.now,
      },
    };
  };

  if (!localChanged && !remoteChanged) {
    if (r && !gone && shadow && r.updatedAt > shadow.remote) return { kind: "adopt", item: r };
    return { kind: "none", localChanged: false };
  }
  if (localChanged && !remoteChanged) return push();
  if (!localChanged && remoteChanged) return applyRemote();

  // Both sides changed.
  if (local && r && !r.deleted && sameDoc({ ...local, deleted: false }, r)) {
    return { kind: "adopt", item: r };
  }
  if (!local && r!.deleted) return gone ? applyRemote() : { kind: "adopt", item: r! };
  if (opts.writeOnce && r && !r.deleted) return applyRemote();
  const localTime = local ? local.updatedAt : opts.now;
  return r!.updatedAt > localTime ? applyRemote() : push();
}
