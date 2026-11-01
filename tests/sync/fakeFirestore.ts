/**
 * Tiny in-memory stand-in for the firebase/firestore functions used by ./firestoreRemote.ts
 * (unit tests only; the real SDK is exercised by tests/sync against the emulator).
 */
import type { Firestore } from "firebase/firestore";
import type { FirestoreApi } from "@/lib/sync/firestoreRemote";

const SERVER_TS = { __serverTimestamp: true };
type Doc = Record<string, unknown>;
interface Ref {
  path: string;
  id: string;
  kind: "doc" | "collection";
}
type Listener = { ref: Ref; next: (snap: unknown) => void; error: (e: unknown) => void };

export class FakeFirestore {
  docs = new Map<string, Doc>();
  pending = new Set<string>();
  fromCache = false;
  clock = 1_700_000_000;
  listeners = new Set<Listener>();
  failWrites: unknown = null;
  writes: { path: string; data: Doc }[] = [];
  /** Hold writes as "pending" (hasPendingWrites) until `release()`. */
  holdWrites = false;

  db = {} as Firestore;

  private snapDoc(path: string) {
    const data = this.docs.get(path);
    return {
      id: path.split("/").pop()!,
      exists: () => data !== undefined,
      data: () => data,
      metadata: { hasPendingWrites: this.pending.has(path), fromCache: this.fromCache },
    };
  }

  private snapshotFor(ref: Ref) {
    if (ref.kind === "doc") return this.snapDoc(ref.path);
    const prefix = `${ref.path}/`;
    const docs = [...this.docs.keys()]
      .filter((p) => p.startsWith(prefix) && !p.slice(prefix.length).includes("/"))
      .map((p) => this.snapDoc(p));
    return { docs, metadata: { fromCache: this.fromCache } };
  }

  emit(): void {
    for (const l of [...this.listeners]) l.next(this.snapshotFor(l.ref));
  }

  fail(err: unknown): void {
    for (const l of [...this.listeners]) l.error(err);
  }

  release(): void {
    this.pending.clear();
    this.emit();
  }

  /** Write like the server would (stamping server timestamps). */
  serverSet(path: string, data: Doc): void {
    this.clock += 1;
    const stamped = Object.fromEntries(
      Object.entries(data).map(([k, v]) => [
        k,
        v === SERVER_TS ? { seconds: this.clock, nanoseconds: 500_000_000 } : v,
      ]),
    );
    this.docs.set(path, stamped);
  }

  api(): FirestoreApi {
    const join = (...parts: string[]) => parts.join("/");
    const api = {
      collection: (_db: unknown, path: string) => ({
        path,
        id: path.split("/").pop(),
        kind: "collection",
      }),
      doc: (_db: unknown, path: string, id?: string) => {
        const full = id ? join(path, id) : path;
        return { path: full, id: full.split("/").pop(), kind: "doc" };
      },
      serverTimestamp: () => SERVER_TS,
      onSnapshot: (
        ref: Ref,
        _opts: unknown,
        next: (s: unknown) => void,
        error: (e: unknown) => void,
      ) => {
        const l = { ref, next, error };
        this.listeners.add(l);
        queueMicrotask(() => this.listeners.has(l) && next(this.snapshotFor(ref)));
        return () => this.listeners.delete(l);
      },
      setDoc: async (ref: Ref, data: Doc) => {
        if (this.failWrites) throw this.failWrites;
        this.writes.push({ path: ref.path, data });
        this.serverSet(ref.path, data);
        if (this.holdWrites) this.pending.add(ref.path);
        this.emit();
      },
      getDoc: async (ref: Ref) => this.snapDoc(ref.path),
      getDocs: async (ref: Ref) => this.snapshotFor(ref),
    };
    return api as unknown as FirestoreApi;
  }
}

export { SERVER_TS };
