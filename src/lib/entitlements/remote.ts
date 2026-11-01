/**
 * The slice of Firestore / Functions the PAY features use (checkout, entitlement listener, share
 * links), behind a small port so the flows are unit-tested with an in-memory fake. The default
 * implementation lazy-loads the Firebase SDK (it never lands in the board chunk, PERF-003).
 */

export interface RemoteSnap {
  exists: boolean;
  data: Record<string, unknown> | null;
  /** true when the snapshot came from the local cache rather than the server */
  fromCache: boolean;
}

export interface RemotePort {
  /** Add a document with an auto id to a collection; resolves to the new id. */
  addDoc(collectionPath: string, data: Record<string, unknown>): Promise<string>;
  /** Create/overwrite a document; `serverTimestamps` fields are set to the server time. */
  setDoc(path: string, data: Record<string, unknown>, serverTimestamps?: string[]): Promise<void>;
  getDoc(path: string): Promise<RemoteSnap>;
  deleteDoc(path: string): Promise<void>;
  /** Documents of a collection where `field == value`. */
  queryEq(
    collectionPath: string,
    field: string,
    value: string,
  ): Promise<{ id: string; data: Record<string, unknown> }[]>;
  onDoc(path: string, next: (snap: RemoteSnap) => void, error: (err: unknown) => void): () => void;
  /** Call an HTTPS callable function by name. */
  call(name: string, data: unknown): Promise<unknown>;
}

export class CloudUnavailableError extends Error {
  constructor() {
    super("cloud not configured");
    this.name = "CloudUnavailableError";
  }
}

/** Firebase-backed port (lazy SDK imports). */
export function firebaseRemote(): RemotePort {
  const ctx = async () => {
    const { getDb } = await import("@/lib/firebase/client");
    const db = await getDb();
    if (!db) throw new CloudUnavailableError();
    const fs = await import("firebase/firestore");
    return { db, fs };
  };
  return {
    async addDoc(collectionPath, data) {
      const { db, fs } = await ctx();
      const ref = await fs.addDoc(fs.collection(db, collectionPath), data);
      return ref.id;
    },
    async setDoc(path, data, serverTimestamps = []) {
      const { db, fs } = await ctx();
      const full: Record<string, unknown> = { ...data };
      for (const k of serverTimestamps) full[k] = fs.serverTimestamp();
      await fs.setDoc(fs.doc(db, path), full);
    },
    async getDoc(path) {
      const { db, fs } = await ctx();
      const snap = await fs.getDoc(fs.doc(db, path));
      return {
        exists: snap.exists(),
        data: snap.exists() ? snap.data() : null,
        fromCache: snap.metadata.fromCache,
      };
    },
    async deleteDoc(path) {
      const { db, fs } = await ctx();
      await fs.deleteDoc(fs.doc(db, path));
    },
    async queryEq(collectionPath, field, value) {
      const { db, fs } = await ctx();
      const res = await fs.getDocs(
        fs.query(fs.collection(db, collectionPath), fs.where(field, "==", value)),
      );
      return res.docs.map((d) => ({ id: d.id, data: d.data() }));
    },
    onDoc(path, next, error) {
      let unsub: (() => void) | null = null;
      let stopped = false;
      ctx()
        .then(({ db, fs }) => {
          if (stopped) return;
          unsub = fs.onSnapshot(
            fs.doc(db, path),
            { includeMetadataChanges: true },
            (snap) =>
              next({
                exists: snap.exists(),
                data: snap.exists() ? snap.data() : null,
                fromCache: snap.metadata.fromCache,
              }),
            error,
          );
        })
        .catch(error);
      return () => {
        stopped = true;
        unsub?.();
      };
    },
    async call(name, data) {
      const { getFunctionsClient } = await import("@/lib/firebase/client");
      const fns = await getFunctionsClient();
      if (!fns) throw new CloudUnavailableError();
      const { httpsCallable } = await import("firebase/functions");
      const res = await httpsCallable(fns, name)(data);
      return res.data;
    },
  };
}
