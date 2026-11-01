/**
 * Firestore remote adapters (T4.3). The `firebase/firestore` module is injected (it is loaded
 * with a dynamic import by ./cloudSync.ts, PERF-003), which also makes these unit-testable.
 *
 * Every write is `{ ...XDataSchema.parse(data), updatedAt: serverTimestamp() }` (D-013): rules
 * require `updatedAt == request.time`. Snapshots are validated with the `*DocSchema` variants;
 * invalid documents are skipped and logged.
 */
import type * as FirestoreModule from "firebase/firestore";
import type { Firestore } from "firebase/firestore";
import type { ZodType } from "zod";
import {
  artDataSchema,
  artDocSchema,
  deckDataSchema,
  deckDocSchema,
  gameDataSchema,
  gameDocSchema,
  paths,
  presetDataSchema,
  presetDocSchema,
  profileDataSchema,
  profileDocSchema,
  userDataSchema,
  userDocSchema,
  type TimestampLike,
} from "@/lib/firebase/docs";
import { toJsonObject } from "./json";
import { SETTINGS_ITEM_ID } from "./mappers";
import type { JsonObject, RemoteAdapter, RemoteSnapshot, SyncItem, Unsubscribe } from "./types";

export type FirestoreApi = Pick<
  typeof FirestoreModule,
  "collection" | "doc" | "onSnapshot" | "setDoc" | "getDoc" | "getDocs" | "serverTimestamp"
>;

type Log = (msg: string, detail?: unknown) => void;

export interface RemoteContext {
  fs: FirestoreApi;
  db: Firestore;
  uid: string;
  log?: Log;
}

export function timestampMs(ts: TimestampLike): number {
  return ts.seconds * 1000 + Math.floor(ts.nanoseconds / 1e6);
}

interface DocLike {
  id: string;
  data(): unknown;
  metadata: { hasPendingWrites: boolean };
}

/** Parse one Firestore document into a SyncItem (null when invalid). */
export function docToItem(
  d: { id: string; data(): unknown },
  schema: ZodType,
  log: Log,
  parent?: string,
): SyncItem | null {
  const r = schema.safeParse(d.data());
  if (!r.success) {
    log(`sync: skipping invalid remote doc ${d.id}`, r.error.issues[0]);
    return null;
  }
  const { updatedAt, deleted, ...rest } = r.data as {
    updatedAt: TimestampLike;
    deleted?: boolean;
  } & Record<string, unknown>;
  return {
    id: d.id,
    parent,
    updatedAt: timestampMs(updatedAt),
    deleted: deleted === true,
    data: toJsonObject(rest),
  };
}

/**
 * Keeps the last server-confirmed version of each doc so that documents with pending local
 * writes (whose `updatedAt` is not known yet) still appear in the snapshot.
 */
function snapshotItems(
  docs: DocLike[],
  lastServer: Map<string, SyncItem>,
  schema: ZodType,
  log: Log,
  parent?: string,
): SyncItem[] {
  const items: SyncItem[] = [];
  const seen = new Set<string>();
  for (const d of docs) {
    seen.add(d.id);
    if (d.metadata.hasPendingWrites) {
      const prev = lastServer.get(d.id);
      if (prev) items.push(prev);
      continue;
    }
    const item = docToItem(d, schema, log, parent);
    if (item) {
      lastServer.set(d.id, item);
      items.push(item);
    }
  }
  for (const id of [...lastServer.keys()]) if (!seen.has(id)) lastServer.delete(id);
  return items;
}

function payload(schema: ZodType, item: SyncItem, fs: FirestoreApi): Record<string, unknown> {
  const parsed = schema.parse(item.deleted ? { ...item.data, deleted: true } : item.data);
  return { ...toJsonObject(parsed as object), updatedAt: fs.serverTimestamp() };
}

/** A flat collection under users/{uid} (profiles, presets, games, art). */
export function collectionRemote(
  ctx: RemoteContext,
  collectionPath: string,
  dataSchema: ZodType,
  docSchema: ZodType,
): RemoteAdapter {
  const { fs, db } = ctx;
  const log = ctx.log ?? (() => {});
  return {
    subscribe(onSnap, onError) {
      const lastServer = new Map<string, SyncItem>();
      return fs.onSnapshot(
        fs.collection(db, collectionPath),
        { includeMetadataChanges: true },
        (snap) =>
          onSnap({
            items: snapshotItems(snap.docs, lastServer, docSchema, log),
            fromServer: !snap.metadata.fromCache,
          }),
        onError,
      );
    },
    async write(item) {
      await fs.setDoc(fs.doc(db, collectionPath, item.id), payload(dataSchema, item, fs));
    },
  };
}

/** Decks live under their profile: one listener per profile document. */
export function decksRemote(ctx: RemoteContext): RemoteAdapter {
  const { fs, db, uid } = ctx;
  const log = ctx.log ?? (() => {});
  return {
    subscribe(onSnap, onError) {
      const perProfile = new Map<
        string,
        { unsub: Unsubscribe; items: SyncItem[]; fromServer: boolean }
      >();
      let profilesFromServer = false;
      let closed = false;
      const emit = () => {
        const snap: RemoteSnapshot = {
          items: [...perProfile.values()].flatMap((p) => p.items),
          fromServer: profilesFromServer && [...perProfile.values()].every((p) => p.fromServer),
        };
        onSnap(snap);
      };
      const unsubProfiles = fs.onSnapshot(
        fs.collection(db, paths.profiles(uid)),
        { includeMetadataChanges: true },
        (snap) => {
          profilesFromServer = !snap.metadata.fromCache;
          const ids = new Set(snap.docs.map((d) => d.id));
          for (const [id, entry] of perProfile)
            if (!ids.has(id)) {
              entry.unsub();
              perProfile.delete(id);
            }
          for (const id of ids) {
            if (perProfile.has(id)) continue;
            const lastServer = new Map<string, SyncItem>();
            const entry = { unsub: () => {}, items: [] as SyncItem[], fromServer: false };
            perProfile.set(id, entry);
            entry.unsub = fs.onSnapshot(
              fs.collection(db, paths.decks(uid, id)),
              { includeMetadataChanges: true },
              (ds) => {
                entry.items = snapshotItems(ds.docs, lastServer, deckDocSchema, log, id);
                entry.fromServer = !ds.metadata.fromCache;
                if (!closed) emit();
              },
              onError,
            );
          }
          emit();
        },
        onError,
      );
      return () => {
        closed = true;
        unsubProfiles();
        for (const e of perProfile.values()) e.unsub();
        perProfile.clear();
      };
    },
    async write(item) {
      if (!item.parent) throw Object.assign(new Error("deck without profile"), { code: "invalid" });
      await fs.setDoc(
        fs.doc(db, paths.deck(uid, item.parent, item.id)),
        payload(deckDataSchema, item, fs),
      );
    },
  };
}

/** Settings + "me" profile live in users/{uid} (createdAt is immutable, D-013). */
export function userDocRemote(ctx: RemoteContext, displayName: () => string): RemoteAdapter {
  const { fs, db, uid } = ctx;
  const log = ctx.log ?? (() => {});
  const ref = () => fs.doc(db, paths.user(uid));
  let createdAt: unknown = null;
  return {
    subscribe(onSnap, onError) {
      let last: SyncItem | null = null;
      return fs.onSnapshot(
        ref(),
        { includeMetadataChanges: true },
        (snap) => {
          const fromServer = !snap.metadata.fromCache;
          if (!snap.exists()) {
            last = null;
            onSnap({ items: [], fromServer });
            return;
          }
          if (!snap.metadata.hasPendingWrites) {
            const r = userDocSchema.safeParse(snap.data());
            if (r.success) {
              createdAt = snap.data()?.createdAt ?? createdAt;
              const data: JsonObject = toJsonObject({
                settings: r.data.settings ?? {},
                meProfileId: r.data.meProfileId,
              });
              last = {
                id: SETTINGS_ITEM_ID,
                updatedAt: timestampMs(r.data.updatedAt),
                deleted: false,
                data,
              };
            } else log("sync: skipping invalid user doc", r.error.issues[0]);
          }
          onSnap({ items: last ? [last] : [], fromServer });
        },
        onError,
      );
    },
    async write(item) {
      const data = userDataSchema.parse({
        displayName: displayName().slice(0, 100),
        settings: item.data.settings ?? {},
        meProfileId: item.data.meProfileId,
      });
      const attempt = async () => {
        if (createdAt === null) {
          const existing = await fs.getDoc(ref());
          createdAt = existing.exists() ? (existing.data().createdAt ?? null) : null;
        }
        await fs.setDoc(ref(), {
          ...toJsonObject(data),
          createdAt: createdAt ?? fs.serverTimestamp(),
          updatedAt: fs.serverTimestamp(),
        });
      };
      try {
        await attempt();
      } catch (err) {
        // Another device created the doc meanwhile: createdAt is immutable, so re-read it once.
        if ((err as { code?: unknown }).code !== "permission-denied") throw err;
        createdAt = null;
        await attempt();
      }
    },
  };
}

export const remoteAdapters = {
  profiles: (ctx: RemoteContext) =>
    collectionRemote(ctx, paths.profiles(ctx.uid), profileDataSchema, profileDocSchema),
  presets: (ctx: RemoteContext) =>
    collectionRemote(ctx, paths.presets(ctx.uid), presetDataSchema, presetDocSchema),
  records: (ctx: RemoteContext) =>
    collectionRemote(ctx, paths.games(ctx.uid), gameDataSchema, gameDocSchema),
  art: (ctx: RemoteContext) =>
    collectionRemote(ctx, paths.arts(ctx.uid), artDataSchema, artDocSchema),
  decks: decksRemote,
  settings: userDocRemote,
};

/** One-shot read of everything the user has in the cloud (guest → account merge planning). */
export type RemoteData = Record<
  "profiles" | "decks" | "presets" | "records" | "art" | "settings",
  SyncItem[]
>;

export async function fetchRemoteItems(ctx: RemoteContext): Promise<RemoteData> {
  const { fs, db, uid } = ctx;
  const log = ctx.log ?? (() => {});
  const read = async (path: string, schema: ZodType, parent?: string) => {
    const snap = await fs.getDocs(fs.collection(db, path));
    return snap.docs
      .map((d) => docToItem(d, schema, log, parent))
      .filter((i): i is SyncItem => i !== null);
  };
  const profiles = await read(paths.profiles(uid), profileDocSchema);
  const decks = (
    await Promise.all(profiles.map((p) => read(paths.decks(uid, p.id), deckDocSchema, p.id)))
  ).flat();
  const user = await fs.getDoc(fs.doc(db, paths.user(uid)));
  const u = user.exists() ? userDocSchema.safeParse(user.data()) : null;
  return {
    profiles,
    decks,
    presets: await read(paths.presets(uid), presetDocSchema),
    records: await read(paths.games(uid), gameDocSchema),
    art: await read(paths.arts(uid), artDocSchema),
    settings:
      u && u.success
        ? [
            {
              id: SETTINGS_ITEM_ID,
              updatedAt: timestampMs(u.data.updatedAt),
              deleted: false,
              data: toJsonObject({
                settings: u.data.settings ?? {},
                meProfileId: u.data.meProfileId,
              }),
            },
          ]
        : [],
  };
}
